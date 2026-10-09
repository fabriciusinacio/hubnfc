-- Client panel defaults, public availability state and stricter publish-time validation.
alter table public.tenant_buttons
  add constraint tenant_buttons_active_target_check check (
    not active
    or kind in ('wifi', 'add_to_home')
    or (kind = 'phone' and target_url ~ '^tel:\+[1-9][0-9]{7,14}$')
    or (kind = 'whatsapp' and target_url ~ '^https://wa\\.me/[1-9][0-9]{7,14}(\\?text=[^[:space:]]+)?$')
    or (kind not in ('wifi', 'add_to_home', 'phone', 'whatsapp') and target_url ~ '^https?://[^[:space:]]+$')
  );

alter table public.wifi_settings drop constraint wifi_settings_security_type_check;
alter table public.wifi_settings drop constraint wifi_settings_password_check;
alter table public.wifi_settings drop constraint wifi_settings_check;
alter table public.wifi_settings
  add constraint wifi_settings_security_type_check check (security_type in ('WEP', 'WPA', 'WPA2', 'WPA3', 'nopass')),
  add constraint wifi_settings_password_check check (
    (security_type = 'nopass' and password = '')
    or (security_type = 'WEP' and char_length(password) between 5 and 63)
    or (security_type in ('WPA', 'WPA2', 'WPA3') and char_length(password) between 8 and 63)
  );

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'tenant-logos';

create or replace function public.provision_client_tenant(
  requested_user_id uuid,
  requested_name text,
  requested_slug text,
  requested_city text,
  requested_phone text,
  requested_address text,
  requested_status public.tenant_status default 'active'
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  created_tenant public.tenants;
begin
  if not exists (select 1 from auth.users where id = requested_user_id) then
    raise exception 'The responsible user does not exist';
  end if;

  insert into public.tenants (name, public_slug, city, phone, address, status)
  values (btrim(requested_name), lower(btrim(requested_slug))::citext, nullif(btrim(requested_city), ''), nullif(btrim(requested_phone), ''), nullif(btrim(requested_address), ''), requested_status)
  returning * into created_tenant;

  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (created_tenant.id, requested_user_id, 'owner');

  insert into public.tenant_buttons (tenant_id, kind, label, active, display_order, target_url)
  values
    (created_tenant.id, 'google_review', 'Avaliar no Google', false, 10, null),
    (created_tenant.id, 'instagram', 'Instagram', false, 20, null),
    (created_tenant.id, 'facebook', 'Facebook', false, 30, null),
    (created_tenant.id, 'website', 'Nosso site', false, 40, null),
    (created_tenant.id, 'menu', 'Cardápio', false, 50, null),
    (created_tenant.id, 'whatsapp', 'WhatsApp', false, 60, null),
    (created_tenant.id, 'phone', 'Telefone', false, 70, null),
    (created_tenant.id, 'location', 'Localização', false, 80, null),
    (created_tenant.id, 'wifi', 'Conectar Wi-Fi', false, 90, null),
    (created_tenant.id, 'add_to_home', 'Adicionar à tela inicial', false, 100, null);

  return created_tenant;
end;
$$;

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
  select * into current_tenant from public.tenants where public_slug = lower(btrim(requested_slug))::citext;
  if not found then return null; end if;
  if current_tenant.status <> 'active' then return jsonb_build_object('availability', 'unavailable'); end if;

  select jsonb_build_object(
    'availability', 'active',
    'id', current_tenant.id,
    'name', current_tenant.name,
    'slug', current_tenant.public_slug::text,
    'logo_path', current_tenant.logo_path,
    'theme', jsonb_build_object('primary_color', current_tenant.primary_color, 'secondary_color', current_tenant.secondary_color, 'background_color', current_tenant.background_color, 'text_color', current_tenant.text_color, 'button_style', current_tenant.button_style),
    'buttons', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'kind', b.kind, 'label', b.label, 'target_url', b.target_url, 'config', case when b.kind = 'wifi' then '{}'::jsonb else b.config end) order by b.display_order, b.created_at)
      from public.tenant_buttons b where b.tenant_id = current_tenant.id and b.active
    ), '[]'::jsonb),
    'wifi', case when exists (select 1 from public.tenant_buttons where tenant_id = current_tenant.id and kind = 'wifi' and active) then (
      select jsonb_build_object('ssid', w.ssid, 'password', w.password, 'security_type', w.security_type, 'hidden', w.hidden) from public.wifi_settings w where w.tenant_id = current_tenant.id
    ) else null end
  ) into page;
  return page;
end;
$$;
