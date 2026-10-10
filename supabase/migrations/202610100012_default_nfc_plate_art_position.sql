-- Standard artwork: overlay the generated QR on the decorative QR frame.
alter table public.plate_art_templates
  alter column qr_config set default '{"x": 50, "y": 73, "size": 37, "margin": 4}'::jsonb;
