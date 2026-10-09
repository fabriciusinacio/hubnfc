-- Read-only analytics sharing by high-entropy, expiring capability links.
create table public.tenant_analytics_shares (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.tenant_analytics_shares enable row level security;
revoke all on public.tenant_analytics_shares from anon, authenticated;

create or replace function public.issue_tenant_analytics_share(requested_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_token text;
  share_expiry timestamptz := now() + interval '30 days';
begin
  if not public.is_platform_admin() then return null; end if;
  if not exists (select 1 from public.tenants where id = requested_tenant_id) then return null; end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.tenant_analytics_shares (tenant_id, token_hash, expires_at, created_by)
  values (requested_tenant_id, extensions.digest(raw_token, 'sha256'), share_expiry, auth.uid())
  on conflict (tenant_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        created_at = now(),
        created_by = excluded.created_by;

  return jsonb_build_object('token', raw_token, 'expires_at', share_expiry);
end;
$$;

create or replace function public.get_shared_tenant_analytics(requested_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  shared_tenant public.tenants;
  result jsonb;
begin
  if requested_token is null or requested_token !~ '^[0-9a-f]{64}$' then return null; end if;

  select t.* into shared_tenant
  from public.tenant_analytics_shares s
  join public.tenants t on t.id = s.tenant_id
  where s.token_hash = extensions.digest(requested_token, 'sha256')
    and s.expires_at > now();

  if not found then return null; end if;

  select jsonb_build_object(
    'tenant_name', shared_tenant.name,
    'total_visits', (select count(*) from public.analytics_events where tenant_id = shared_tenant.id and event_type in ('visit', 'page_view')),
    'visits_today', (select count(*) from public.analytics_events where tenant_id = shared_tenant.id and event_type in ('visit', 'page_view') and created_at >= date_trunc('day', now())),
    'visits_7_days', (select count(*) from public.analytics_events where tenant_id = shared_tenant.id and event_type in ('visit', 'page_view') and created_at >= now() - interval '7 days'),
    'visits_30_days', (select count(*) from public.analytics_events where tenant_id = shared_tenant.id and event_type in ('visit', 'page_view') and created_at >= now() - interval '30 days'),
    'total_clicks', (select count(*) from public.analytics_events where tenant_id = shared_tenant.id and event_type = 'button_click'),
    'daily_visits', coalesce((select jsonb_agg(jsonb_build_object('date', day::date, 'visits', coalesce(event_counts.total, 0)) order by day) from generate_series(current_date - interval '29 days', current_date, interval '1 day') day left join lateral (select count(*)::integer as total from public.analytics_events e where e.tenant_id = shared_tenant.id and e.event_type in ('visit', 'page_view') and e.created_at >= day and e.created_at < day + interval '1 day') event_counts on true), '[]'::jsonb),
    'top_buttons', coalesce((select jsonb_agg(jsonb_build_object('label', item.label, 'clicks', item.clicks) order by item.clicks desc, item.label) from (select b.label, count(e.id)::integer as clicks from public.tenant_buttons b left join public.analytics_events e on e.button_id = b.id and e.event_type = 'button_click' where b.tenant_id = shared_tenant.id group by b.id, b.label having count(e.id) > 0 order by clicks desc, b.label limit 8) item), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.issue_tenant_analytics_share(uuid) from public;
revoke all on function public.get_shared_tenant_analytics(text) from public;
grant execute on function public.issue_tenant_analytics_share(uuid) to authenticated;
grant execute on function public.get_shared_tenant_analytics(text) to anon, authenticated;
