-- Use a character class for the dot in wa.me to avoid PostgreSQL escape ambiguity.
alter table public.tenant_buttons drop constraint tenant_buttons_check;
alter table public.tenant_buttons drop constraint tenant_buttons_active_target_check;

alter table public.tenant_buttons
  add constraint tenant_buttons_target_shape_check check (
    target_url is null
    or (kind in ('wifi', 'add_to_home') and target_url is null)
    or (kind = 'phone' and target_url ~ '^tel:\+[1-9][0-9]{7,14}$')
    or (kind = 'whatsapp' and target_url ~ '^https://wa[.]me/[1-9][0-9]{7,14}(\?text=[^[:space:]]+)?$')
    or (kind not in ('wifi', 'add_to_home', 'phone', 'whatsapp') and target_url ~ '^https?://[^[:space:]]+$')
  ),
  add constraint tenant_buttons_active_target_check check (
    not active or kind in ('wifi', 'add_to_home') or target_url is not null
  );
