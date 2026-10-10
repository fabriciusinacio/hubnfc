-- Global NFC plate inventory, print templates and permanent QR redirects.
create type public.nfc_plate_status as enum ('available', 'reserved', 'active', 'disabled');

create sequence public.nfc_plate_number_seq start with 1 increment by 1;
create sequence public.plate_batch_number_seq start with 1 increment by 1;

create table public.plate_art_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  image_path text not null check (image_path ~ '^templates/[0-9a-f-]{36}/[^/]+$'),
  width_mm numeric(7,2) not null default 100 check (width_mm between 30 and 500),
  height_mm numeric(7,2) not null default 150 check (height_mm between 30 and 500),
  qr_config jsonb not null default '{"x": 50, "y": 73, "size": 37, "margin": 4}'::jsonb check (jsonb_typeof(qr_config) = 'object'),
  number_config jsonb not null default '{"x": 50, "y": 94, "font_size": 8, "color": "#172033", "align": "center"}'::jsonb check (jsonb_typeof(number_config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.plate_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  template_id uuid not null references public.plate_art_templates(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 200),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.nfc_plates (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique check (public_code ~ '^[a-f0-9]{24}$'),
  display_code text not null unique check (display_code ~ '^PL-[0-9]{6,}$'),
  status public.nfc_plate_status not null default 'available',
  batch_id uuid not null references public.plate_batches(id) on delete restrict,
  tenant_id uuid references public.tenants(id) on delete set null,
  activated_at timestamptz,
  reserved_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and tenant_id is not null and activated_at is not null) or (status <> 'active' and tenant_id is null))
);

create table public.nfc_plate_history (
  id bigint generated always as identity primary key,
  plate_id uuid not null references public.nfc_plates(id) on delete cascade,
  action text not null check (action in ('created', 'reserved', 'activated', 'disabled', 'released', 'reassigned')),
  previous_status public.nfc_plate_status,
  next_status public.nfc_plate_status not null,
  previous_tenant_id uuid references public.tenants(id) on delete set null,
  next_tenant_id uuid references public.tenants(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index nfc_plates_status_idx on public.nfc_plates(status, created_at desc);
create index nfc_plates_tenant_idx on public.nfc_plates(tenant_id) where tenant_id is not null;
create index nfc_plate_history_plate_idx on public.nfc_plate_history(plate_id, created_at desc);

create trigger plate_art_templates_set_updated_at before update on public.plate_art_templates for each row execute function public.set_updated_at();
create trigger nfc_plates_set_updated_at before update on public.nfc_plates for each row execute function public.set_updated_at();

alter table public.plate_art_templates enable row level security;
alter table public.plate_batches enable row level security;
alter table public.nfc_plates enable row level security;
alter table public.nfc_plate_history enable row level security;

create policy "plate templates: platform admins manage" on public.plate_art_templates for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "plate batches: platform admins read" on public.plate_batches for select using (public.is_platform_admin());
create policy "nfc plates: platform admins read" on public.nfc_plates for select using (public.is_platform_admin());
create policy "nfc plate history: platform admins read" on public.nfc_plate_history for select using (public.is_platform_admin());

revoke all on public.plate_art_templates, public.plate_batches, public.nfc_plates, public.nfc_plate_history from anon, authenticated;
grant select, insert, update, delete on public.plate_art_templates to authenticated;
grant select on public.plate_batches, public.nfc_plates, public.nfc_plate_history to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plate-artworks', 'plate-artworks', false, 10485760, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "plate artwork: platform admins read" on storage.objects for select to authenticated using (bucket_id = 'plate-artworks' and public.is_platform_admin());
create policy "plate artwork: platform admins upload" on storage.objects for insert to authenticated with check (bucket_id = 'plate-artworks' and public.is_platform_admin() and name ~ '^templates/[0-9a-f-]{36}/[^/]+$');
create policy "plate artwork: platform admins update" on storage.objects for update to authenticated using (bucket_id = 'plate-artworks' and public.is_platform_admin()) with check (bucket_id = 'plate-artworks' and public.is_platform_admin() and name ~ '^templates/[0-9a-f-]{36}/[^/]+$');
create policy "plate artwork: platform admins delete" on storage.objects for delete to authenticated using (bucket_id = 'plate-artworks' and public.is_platform_admin());

create or replace function public.create_nfc_plate_batch(requested_template_id uuid, requested_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_batch public.plate_batches;
  created_plate public.nfc_plates;
  item integer;
  next_display_code text;
begin
  if not public.is_platform_admin() then return null; end if;
  if requested_quantity not between 1 and 200 then raise exception 'Quantity must be between 1 and 200'; end if;
  if not exists (select 1 from public.plate_art_templates where id = requested_template_id) then raise exception 'Template not found'; end if;

  insert into public.plate_batches (batch_number, template_id, quantity, created_by)
  values ('LT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.plate_batch_number_seq')::text, 6, '0'), requested_template_id, requested_quantity, auth.uid())
  returning * into created_batch;

  for item in 1..requested_quantity loop
    next_display_code := 'PL-' || lpad(nextval('public.nfc_plate_number_seq')::text, 6, '0');
    insert into public.nfc_plates (public_code, display_code, batch_id)
    values (encode(extensions.gen_random_bytes(12), 'hex'), next_display_code, created_batch.id)
    returning * into created_plate;
    insert into public.nfc_plate_history (plate_id, action, next_status, changed_by, metadata)
    values (created_plate.id, 'created', 'available', auth.uid(), jsonb_build_object('batch_id', created_batch.id));
  end loop;

  return jsonb_build_object('id', created_batch.id, 'batch_number', created_batch.batch_number, 'quantity', created_batch.quantity);
end;
$$;

create or replace function public.update_nfc_plate_assignment(requested_plate_id uuid, requested_status public.nfc_plate_status, requested_tenant_id uuid default null)
returns public.nfc_plates
language plpgsql
security definer
set search_path = public
as $$
declare
  current_plate public.nfc_plates;
  updated_plate public.nfc_plates;
  event_action text;
begin
  if not public.is_platform_admin() then raise exception 'Access denied'; end if;
  select * into current_plate from public.nfc_plates where id = requested_plate_id for update;
  if not found then raise exception 'Plate not found'; end if;

  if not ((current_plate.status = 'available' and requested_status in ('reserved', 'active', 'disabled'))
    or (current_plate.status = 'reserved' and requested_status in ('available', 'active', 'disabled'))
    or (current_plate.status = 'active' and requested_status in ('active', 'reserved', 'disabled'))
    or (current_plate.status = 'disabled' and requested_status in ('available', 'reserved'))) then
    raise exception 'Invalid status transition';
  end if;

  if requested_status = 'active' then
    if requested_tenant_id is null or not exists (select 1 from public.tenants where id = requested_tenant_id) then raise exception 'An active plate requires a valid tenant'; end if;
  elsif requested_tenant_id is not null then
    raise exception 'Only active plates can be assigned to a tenant';
  end if;

  update public.nfc_plates
  set status = requested_status,
      tenant_id = case when requested_status = 'active' then requested_tenant_id else null end,
      activated_at = case when requested_status = 'active' then coalesce(current_plate.activated_at, now()) else current_plate.activated_at end,
      reserved_at = case when requested_status = 'reserved' then now() else null end,
      disabled_at = case when requested_status = 'disabled' then now() else null end
  where id = requested_plate_id
  returning * into updated_plate;

  event_action := case requested_status when 'active' then case when current_plate.tenant_id is null then 'activated' else 'reassigned' end when 'reserved' then 'reserved' when 'disabled' then 'disabled' else 'released' end;
  insert into public.nfc_plate_history (plate_id, action, previous_status, next_status, previous_tenant_id, next_tenant_id, changed_by)
  values (updated_plate.id, event_action, current_plate.status, updated_plate.status, current_plate.tenant_id, updated_plate.tenant_id, auth.uid());
  return updated_plate;
end;
$$;

create or replace function public.resolve_nfc_plate(requested_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.public_slug::text
  from public.nfc_plates p
  join public.tenants t on t.id = p.tenant_id
  where p.public_code = lower(btrim(requested_code))
    and p.status = 'active'
    and t.status = 'active'
  limit 1;
$$;

revoke all on function public.create_nfc_plate_batch(uuid, integer) from public;
revoke all on function public.update_nfc_plate_assignment(uuid, public.nfc_plate_status, uuid) from public;
revoke all on function public.resolve_nfc_plate(text) from public;
grant execute on function public.create_nfc_plate_batch(uuid, integer) to authenticated;
grant execute on function public.update_nfc_plate_assignment(uuid, public.nfc_plate_status, uuid) to authenticated;
grant execute on function public.resolve_nfc_plate(text) to anon, authenticated;
