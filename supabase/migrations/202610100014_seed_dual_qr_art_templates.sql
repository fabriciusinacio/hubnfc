-- Approved printable artworks stored in the private plate library.
insert into public.plate_art_templates (id, name, image_path, width_mm, height_mm, qr_config)
values
  ('6d613645-4ba2-4f4b-a9c1-0a0fd8a03d31', 'QR Duplo Preto', 'templates/6d613645-4ba2-4f4b-a9c1-0a0fd8a03d31/nfc-qr-duplo-preto.png', 100, 150, '{"x": 30, "y": 76, "size": 27, "margin": 4}'::jsonb),
  ('7eb75a5f-d72a-4a3e-8654-852393d93d0b', 'QR Duplo Claro', 'templates/7eb75a5f-d72a-4a3e-8654-852393d93d0b/nfc-qr-duplo-claro.png', 100, 150, '{"x": 30, "y": 76, "size": 27, "margin": 4}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  image_path = excluded.image_path,
  width_mm = excluded.width_mm,
  height_mm = excluded.height_mm,
  qr_config = excluded.qr_config;
