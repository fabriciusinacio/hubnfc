-- Super-admin support: tenant contact data, active-tenant gating and admin RPCs.
alter table public.tenants
  add column city text check (city is null or char_length(btrim(city)) between 1 and 100),
  add column phone text check (phone is null or char_length(btrim(phone)) between 5 and 30),
  add column address text check (address is null or char_length(btrim(address)) between 1 and 240);

-- A disabled tenant remains manageable by a platform admin, but not by its own members.
create or replace function public.can_access_tenant(requested_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_memberships m
      join public.tenants t on t.id = m.tenant_id
      where m.tenant_id = requested_tenant_id
        and m.user_id = auth.uid()
        and t.status = 'active'
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
      select 1
      from public.tenant_memberships m
      join public.tenants t on t.id = m.tenant_id
      where m.tenant_id = requested_tenant_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
        and t.status = 'active'
    );
$$;

create or replace function public.admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_platform_admin() then jsonb_build_object(
    'total_tenants', (select count(*) from public.tenants),
    'active_tenants', (select count(*) from public.tenants where status = 'active'),
    'inactive_tenants', (select count(*) from public.tenants where status <> 'active'),
    'total_visits', (select count(*) from public.analytics_events where event_type = 'visit'),
    'total_clicks', (select count(*) from public.analytics_events where event_type = 'button_click')
  ) else null end;
$$;

create or replace function public.admin_list_tenants()
returns table (
  id uuid,
  name text,
  public_slug text,
  status public.tenant_status,
  city text,
  phone text,
  address text,
  created_at timestamptz,
  responsible_name text,
  responsible_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.public_slug::text,
    t.status,
    t.city,
    t.phone,
    t.address,
    t.created_at,
    p.display_name,
    u.email
  from public.tenants t
  left join lateral (
    select m.user_id
    from public.tenant_memberships m
    where m.tenant_id = t.id and m.role = 'owner'
    order by m.created_at
    limit 1
  ) owner_membership on true
  left join public.profiles p on p.id = owner_membership.user_id
  left join auth.users u on u.id = owner_membership.user_id
  where public.is_platform_admin()
  order by t.created_at desc;
$$;

-- Called only by the trusted Edge Function after it creates an Auth user.
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
  values (
    btrim(requested_name),
    lower(btrim(requested_slug))::citext,
    nullif(btrim(requested_city), ''),
    nullif(btrim(requested_phone), ''),
    nullif(btrim(requested_address), ''),
    requested_status
  )
  returning * into created_tenant;

  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (created_tenant.id, requested_user_id, 'owner');

  return created_tenant;
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public;
revoke all on function public.admin_list_tenants() from public;
revoke all on function public.provision_client_tenant(uuid, text, text, text, text, text, public.tenant_status) from public;
grant execute on function public.admin_dashboard_metrics() to authenticated;
grant execute on function public.admin_list_tenants() to authenticated;
grant execute on function public.provision_client_tenant(uuid, text, text, text, text, text, public.tenant_status) to service_role;
