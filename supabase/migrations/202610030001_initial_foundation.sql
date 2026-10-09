-- NFC Hub foundation. Apply to a new Supabase project.
create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.platform_role as enum ('user', 'super_admin');
create type public.tenant_status as enum ('active', 'inactive', 'suspended');
create type public.tenant_member_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.button_kind as enum (
  'google_review', 'facebook', 'instagram', 'website', 'menu', 'wifi',
  'location', 'whatsapp', 'phone', 'add_to_home', 'custom'
);
create type public.analytics_event_type as enum ('visit', 'button_click', 'install_prompt');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.platform_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  public_slug citext not null unique check (public_slug::text ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  status public.tenant_status not null default 'active',
  logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/[^/]+$'),
  primary_color text not null default '#166534' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#f59e0b' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#ffffff' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text not null default '#172033' check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  button_style text not null default 'solid' check (button_style in ('solid', 'outline', 'soft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_member_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.tenant_buttons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind public.button_kind not null,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  active boolean not null default true,
  display_order integer not null default 0 check (display_order between 0 and 999),
  target_url text,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind in ('wifi', 'add_to_home') and target_url is null)
    or (kind in ('phone', 'whatsapp') and target_url ~ '^(tel:|https://wa\\.me/)')
    or (kind not in ('wifi', 'add_to_home', 'phone', 'whatsapp') and target_url ~ '^https://')
  )
);

create table public.wifi_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  ssid text not null check (char_length(ssid) between 1 and 32),
  password text not null default '' check (char_length(password) <= 63),
  security_type text not null default 'WPA' check (security_type in ('WEP', 'WPA', 'nopass')),
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  check (
    (security_type = 'nopass' and password = '')
    or (security_type = 'WEP' and char_length(password) between 5 and 63)
    or (security_type = 'WPA' and char_length(password) between 8 and 63)
  )
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  button_id uuid references public.tenant_buttons(id) on delete set null,
  event_type public.analytics_event_type not null,
  anonymous_hash bytea not null check (octet_length(anonymous_hash) = 32),
  bucket_start timestamptz not null,
  created_at timestamptz not null default now(),
  check ((event_type = 'button_click' and button_id is not null) or (event_type <> 'button_click' and button_id is null))
);

create unique index analytics_events_dedup_idx
  on public.analytics_events (tenant_id, event_type, coalesce(button_id, '00000000-0000-0000-0000-000000000000'::uuid), anonymous_hash, bucket_start);
create index analytics_events_tenant_created_idx on public.analytics_events (tenant_id, created_at desc);
create index analytics_events_tenant_button_created_idx on public.analytics_events (tenant_id, button_id, created_at desc) where button_id is not null;
create index tenant_buttons_tenant_order_idx on public.tenant_buttons (tenant_id, display_order, created_at);
create unique index tenant_buttons_one_builtin_kind_idx on public.tenant_buttons (tenant_id, kind) where kind <> 'custom';
create index tenant_memberships_user_idx on public.tenant_memberships (user_id, tenant_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger tenants_set_updated_at before update on public.tenants for each row execute function public.set_updated_at();
create trigger tenant_buttons_set_updated_at before update on public.tenant_buttons for each row execute function public.set_updated_at();
create trigger wifi_settings_set_updated_at before update on public.wifi_settings for each row execute function public.set_updated_at();

create or replace function public.prevent_tenant_status_change_by_member()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Requests with no Auth user are trusted server/SQL-editor operations.
  if auth.uid() is not null
    and new.status is distinct from old.status
    and not public.is_platform_admin() then
    raise exception 'Only a platform administrator can change tenant status';
  end if;
  return new;
end;
$$;

create trigger tenants_guard_status before update on public.tenants
for each row execute function public.prevent_tenant_status_change_by_member();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.can_access_tenant(requested_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.tenant_memberships
      where tenant_id = requested_tenant_id and user_id = auth.uid()
    );
$$;

create or replace function public.can_manage_tenant(requested_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.tenant_memberships
      where tenant_id = requested_tenant_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    );
$$;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_buttons enable row level security;
alter table public.wifi_settings enable row level security;
alter table public.analytics_events enable row level security;

create policy "profiles: users read own profile" on public.profiles for select using (id = auth.uid() or public.is_platform_admin());
create policy "profiles: users update own profile" on public.profiles for update using (id = auth.uid() or public.is_platform_admin()) with check (id = auth.uid() or public.is_platform_admin());
create policy "tenants: members read their tenant" on public.tenants for select using (public.can_access_tenant(id));
create policy "tenants: platform admins insert" on public.tenants for insert with check (public.is_platform_admin());
create policy "tenants: managers update" on public.tenants for update using (public.can_manage_tenant(id)) with check (public.can_manage_tenant(id));
create policy "tenant memberships: members read" on public.tenant_memberships for select using (public.can_access_tenant(tenant_id));
create policy "tenant memberships: platform admins insert" on public.tenant_memberships for insert with check (public.is_platform_admin());
create policy "tenant memberships: platform admins update" on public.tenant_memberships for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "tenant memberships: platform admins delete" on public.tenant_memberships for delete using (public.is_platform_admin());
create policy "tenant buttons: members read" on public.tenant_buttons for select using (public.can_access_tenant(tenant_id));
create policy "tenant buttons: managers insert" on public.tenant_buttons for insert with check (public.can_manage_tenant(tenant_id));
create policy "tenant buttons: managers update" on public.tenant_buttons for update using (public.can_manage_tenant(tenant_id)) with check (public.can_manage_tenant(tenant_id));
create policy "tenant buttons: managers delete" on public.tenant_buttons for delete using (public.can_manage_tenant(tenant_id));
create policy "wifi settings: members read" on public.wifi_settings for select using (public.can_access_tenant(tenant_id));
create policy "wifi settings: managers insert" on public.wifi_settings for insert with check (public.can_manage_tenant(tenant_id));
create policy "wifi settings: managers update" on public.wifi_settings for update using (public.can_manage_tenant(tenant_id)) with check (public.can_manage_tenant(tenant_id));
create policy "wifi settings: managers delete" on public.wifi_settings for delete using (public.can_manage_tenant(tenant_id));
create policy "analytics: members read tenant analytics" on public.analytics_events for select using (public.can_access_tenant(tenant_id));

-- Explicit grants keep direct table access authenticated-only; RLS still decides every row.
revoke all on public.profiles, public.tenants, public.tenant_memberships, public.tenant_buttons, public.wifi_settings, public.analytics_events from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.tenants, public.tenant_memberships, public.tenant_buttons, public.wifi_settings to authenticated;
grant select on public.analytics_events to authenticated;

create or replace function public.get_public_tenant_page(requested_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_tenant public.tenants;
  page jsonb;
begin
  select * into current_tenant
  from public.tenants
  where public_slug = lower(btrim(requested_slug))::citext and status = 'active';

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'id', current_tenant.id,
    'name', current_tenant.name,
    'slug', current_tenant.public_slug::text,
    'logo_path', current_tenant.logo_path,
    'theme', jsonb_build_object(
      'primary_color', current_tenant.primary_color,
      'secondary_color', current_tenant.secondary_color,
      'background_color', current_tenant.background_color,
      'text_color', current_tenant.text_color,
      'button_style', current_tenant.button_style
    ),
    'buttons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'kind', b.kind,
        'label', b.label,
        'target_url', b.target_url,
        'config', case when b.kind = 'wifi' then '{}'::jsonb else b.config end
      ) order by b.display_order, b.created_at)
      from public.tenant_buttons b
      where b.tenant_id = current_tenant.id and b.active
    ), '[]'::jsonb),
    'wifi', case when exists (
      select 1 from public.tenant_buttons where tenant_id = current_tenant.id and kind = 'wifi' and active
    ) then (
      select jsonb_build_object('ssid', w.ssid, 'password', w.password, 'security_type', w.security_type, 'hidden', w.hidden)
      from public.wifi_settings w where w.tenant_id = current_tenant.id
    ) else null end
  ) into page;

  return page;
end;
$$;

create or replace function public.record_public_event(
  requested_slug text,
  requested_event public.analytics_event_type,
  requested_button_id uuid default null,
  anonymous_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_tenant_id uuid;
  event_bucket timestamptz;
  anonymous_digest bytea;
begin
  if anonymous_id is null or char_length(anonymous_id) not between 24 and 200 then
    return false;
  end if;

  select id into current_tenant_id
  from public.tenants
  where public_slug = lower(btrim(requested_slug))::citext and status = 'active';

  if current_tenant_id is null then return false; end if;
  if requested_event = 'button_click' and (
    requested_button_id is null or not exists (
      select 1 from public.tenant_buttons
      where id = requested_button_id and tenant_id = current_tenant_id and active
    )
  ) then return false; end if;
  if requested_event <> 'button_click' and requested_button_id is not null then return false; end if;

  event_bucket := case when requested_event = 'visit'
    then date_trunc('hour', now()) + floor(date_part('minute', now()) / 30) * interval '30 minutes'
    else date_trunc('minute', now())
  end;
  anonymous_digest := digest(anonymous_id, 'sha256');

  insert into public.analytics_events (tenant_id, button_id, event_type, anonymous_hash, bucket_start)
  values (current_tenant_id, requested_button_id, requested_event, anonymous_digest, event_bucket)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.get_public_tenant_page(text) from public;
revoke all on function public.record_public_event(text, public.analytics_event_type, uuid, text) from public;
grant execute on function public.get_public_tenant_page(text) to anon, authenticated;
grant execute on function public.record_public_event(text, public.analytics_event_type, uuid, text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-logos', 'tenant-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "tenant logos: managers upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tenant-logos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_manage_tenant(((storage.foldername(name))[1])::uuid)
);
create policy "tenant logos: managers update" on storage.objects for update to authenticated
using (
  bucket_id = 'tenant-logos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_manage_tenant(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'tenant-logos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_manage_tenant(((storage.foldername(name))[1])::uuid)
);
create policy "tenant logos: managers delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'tenant-logos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_manage_tenant(((storage.foldername(name))[1])::uuid)
);
