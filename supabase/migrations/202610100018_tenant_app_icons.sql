alter table public.tenants add column if not exists app_icon_path text check (app_icon_path is null or app_icon_path ~ '^[0-9a-f-]{36}/[^/]+$');

create or replace function public.get_public_tenant_page(requested_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare current_tenant public.tenants; page jsonb;
begin
  select * into current_tenant from public.tenants where public_slug = lower(btrim(requested_slug))::citext;
  if not found then return null; end if;
  if current_tenant.status <> 'active' then return jsonb_build_object('availability', 'unavailable'); end if;
  select jsonb_build_object(
    'availability', 'active', 'id', current_tenant.id, 'name', current_tenant.name, 'slug', current_tenant.public_slug::text,
    'logo_path', current_tenant.logo_path, 'app_icon_path', current_tenant.app_icon_path,
    'theme', jsonb_build_object('primary_color', current_tenant.primary_color, 'secondary_color', current_tenant.secondary_color, 'background_color', current_tenant.background_color, 'text_color', current_tenant.text_color, 'button_style', current_tenant.button_style),
    'buttons', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'kind', b.kind, 'label', b.label, 'target_url', b.target_url, 'config', case when b.kind = 'wifi' then '{}'::jsonb else b.config end) order by b.display_order, b.created_at) from public.tenant_buttons b where b.tenant_id = current_tenant.id and b.active), '[]'::jsonb),
    'wifi', case when exists (select 1 from public.tenant_buttons where tenant_id = current_tenant.id and kind = 'wifi' and active) then (select jsonb_build_object('ssid', w.ssid, 'password', w.password, 'security_type', w.security_type, 'hidden', w.hidden) from public.wifi_settings w where w.tenant_id = current_tenant.id) else null end
  ) into page;
  return page;
end;
$$;
