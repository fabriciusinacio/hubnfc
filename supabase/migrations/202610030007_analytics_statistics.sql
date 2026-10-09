-- Aggregate analytics only: tenants never need raw anonymous event hashes.
drop policy if exists "analytics: members read tenant analytics" on public.analytics_events;
revoke select on public.analytics_events from authenticated;

create or replace function public.record_public_event(
  requested_slug text,
  requested_event public.analytics_event_type,
  requested_button_id uuid default null,
  anonymous_id text default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare current_tenant_id uuid; event_bucket timestamptz; anonymous_digest bytea;
begin
  if anonymous_id is null or char_length(anonymous_id) not between 24 and 200 then return false; end if;
  select id into current_tenant_id from public.tenants where public_slug = lower(btrim(requested_slug))::citext and status = 'active';
  if current_tenant_id is null then return false; end if;
  if requested_event = 'button_click' and (requested_button_id is null or not exists (select 1 from public.tenant_buttons where id = requested_button_id and tenant_id = current_tenant_id and active)) then return false; end if;
  if requested_event <> 'button_click' and requested_button_id is not null then return false; end if;
  event_bucket := case when requested_event in ('visit', 'page_view') then date_trunc('hour', now()) + floor(date_part('minute', now()) / 30) * interval '30 minutes' else date_trunc('minute', now()) end;
  anonymous_digest := extensions.digest(anonymous_id, 'sha256');
  insert into public.analytics_events (tenant_id, button_id, event_type, anonymous_hash, bucket_start) values (current_tenant_id, requested_button_id, requested_event, anonymous_digest, event_bucket) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.get_tenant_analytics(requested_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists (select 1 from public.tenants where id = requested_tenant_id) then return null; end if;
  if not public.can_access_tenant(requested_tenant_id) then return null; end if;
  select jsonb_build_object(
    'total_visits', (select count(*) from public.analytics_events where tenant_id = requested_tenant_id and event_type in ('visit', 'page_view')),
    'visits_today', (select count(*) from public.analytics_events where tenant_id = requested_tenant_id and event_type in ('visit', 'page_view') and created_at >= date_trunc('day', now())),
    'visits_7_days', (select count(*) from public.analytics_events where tenant_id = requested_tenant_id and event_type in ('visit', 'page_view') and created_at >= now() - interval '7 days'),
    'visits_30_days', (select count(*) from public.analytics_events where tenant_id = requested_tenant_id and event_type in ('visit', 'page_view') and created_at >= now() - interval '30 days'),
    'total_clicks', (select count(*) from public.analytics_events where tenant_id = requested_tenant_id and event_type = 'button_click'),
    'daily_visits', coalesce((select jsonb_agg(jsonb_build_object('date', day::date, 'visits', coalesce(event_counts.total, 0)) order by day) from generate_series(current_date - interval '29 days', current_date, interval '1 day') day left join lateral (select count(*)::integer as total from public.analytics_events e where e.tenant_id = requested_tenant_id and e.event_type in ('visit', 'page_view') and e.created_at >= day and e.created_at < day + interval '1 day') event_counts on true), '[]'::jsonb),
    'top_buttons', coalesce((select jsonb_agg(jsonb_build_object('label', item.label, 'clicks', item.clicks) order by item.clicks desc, item.label) from (select b.label, count(e.id)::integer as clicks from public.tenant_buttons b left join public.analytics_events e on e.button_id = b.id and e.event_type = 'button_click' where b.tenant_id = requested_tenant_id group by b.id, b.label having count(e.id) > 0 order by clicks desc, b.label limit 8) item), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_dashboard_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_platform_admin() then jsonb_build_object(
    'total_tenants', (select count(*) from public.tenants),
    'active_tenants', (select count(*) from public.tenants where status = 'active'),
    'inactive_tenants', (select count(*) from public.tenants where status <> 'active'),
    'total_visits', (select count(*) from public.analytics_events where event_type in ('visit', 'page_view')),
    'total_clicks', (select count(*) from public.analytics_events where event_type = 'button_click')
  ) else null end;
$$;

revoke all on function public.get_tenant_analytics(uuid) from public;
grant execute on function public.get_tenant_analytics(uuid) to authenticated;
