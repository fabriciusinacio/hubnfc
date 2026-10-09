-- Supabase installs pgcrypto in the extensions schema; qualify digest explicitly.
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
  if anonymous_id is null or char_length(anonymous_id) not between 24 and 200 then return false; end if;
  select id into current_tenant_id from public.tenants where public_slug = lower(btrim(requested_slug))::citext and status = 'active';
  if current_tenant_id is null then return false; end if;
  if requested_event = 'button_click' and (requested_button_id is null or not exists (select 1 from public.tenant_buttons where id = requested_button_id and tenant_id = current_tenant_id and active)) then return false; end if;
  if requested_event <> 'button_click' and requested_button_id is not null then return false; end if;
  event_bucket := case when requested_event = 'visit' then date_trunc('hour', now()) + floor(date_part('minute', now()) / 30) * interval '30 minutes' else date_trunc('minute', now()) end;
  anonymous_digest := extensions.digest(anonymous_id, 'sha256');
  insert into public.analytics_events (tenant_id, button_id, event_type, anonymous_hash, bucket_start)
  values (current_tenant_id, requested_button_id, requested_event, anonymous_digest, event_bucket)
  on conflict do nothing;
  return true;
end;
$$;
