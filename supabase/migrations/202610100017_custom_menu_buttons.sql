-- Custom menu items can use safe web, WhatsApp, e-mail, or phone destinations.
alter table public.tenant_buttons drop constraint if exists tenant_buttons_target_shape_check;

alter table public.tenant_buttons add constraint tenant_buttons_target_shape_check check (
  target_url is null
  or (kind in ('wifi', 'add_to_home') and target_url is null)
  or (kind = 'phone' and target_url ~ '^tel:\+[1-9][0-9]{7,14}$')
  or (kind = 'whatsapp' and target_url ~ '^https://wa[.]me/[1-9][0-9]{7,14}(\?text=[^[:space:]]+)?$')
  or (kind = 'custom' and target_url ~ '^(https?://[^[:space:]]+|mailto:[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+|tel:\+[1-9][0-9]{7,14})$')
  or (kind not in ('wifi', 'add_to_home', 'phone', 'whatsapp', 'custom') and target_url ~ '^https?://[^[:space:]]+$')
);
