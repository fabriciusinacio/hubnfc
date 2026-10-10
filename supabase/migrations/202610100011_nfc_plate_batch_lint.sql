-- Keep the batch generator lint-clean without changing its behavior.
create or replace function public.create_nfc_plate_batch(requested_template_id uuid, requested_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_batch public.plate_batches;
  created_plate public.nfc_plates;
  next_display_code text;
begin
  if not public.is_platform_admin() then return null; end if;
  if requested_quantity not between 1 and 200 then raise exception 'Quantity must be between 1 and 200'; end if;
  if not exists (select 1 from public.plate_art_templates where id = requested_template_id) then raise exception 'Template not found'; end if;

  insert into public.plate_batches (batch_number, template_id, quantity, created_by)
  values ('LT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.plate_batch_number_seq')::text, 6, '0'), requested_template_id, requested_quantity, auth.uid())
  returning * into created_batch;

  for batch_item in 1..requested_quantity loop
    next_display_code := 'PL-' || lpad(nextval('public.nfc_plate_number_seq')::text, 6, '0');
    insert into public.nfc_plates (public_code, display_code, batch_id)
    values (encode(extensions.gen_random_bytes(12), 'hex'), next_display_code, created_batch.id)
    returning * into created_plate;
    insert into public.nfc_plate_history (plate_id, action, next_status, changed_by, metadata)
    values (created_plate.id, 'created', 'available', auth.uid(), jsonb_build_object('batch_id', created_batch.id));
  end loop;

  return jsonb_build_object('id', created_batch.id, 'batch_number', created_batch.batch_number, 'quantity', created_batch.quantity);
end;
$$;
