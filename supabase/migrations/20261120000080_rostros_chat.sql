-- ════════════════════════════════════════════════════════════════════
-- 080 · Rostro del cliente para el chat del personal
--
-- Una miniatura del rostro (192 × 192, ~10 KB) recortada de la selfie de
-- la verificación, para reconocer al cliente en el chat de un vistazo.
--
--   · Se guarda en un bucket propio, privado: rostros/<user_id>.jpg.
--     La selfie original no se toca y el DNI que sostiene no entra en el
--     recorte.
--   · La recorta el navegador del personal (panel) la primera vez que el
--     chat pide la foto de un cliente verificado, y al aprobar su
--     identidad. Nadie más la sube.
--   · Solo la ve el personal: el chat la pide al panel, que la firma con
--     la sesión del asesor (enlace que vence en una hora). El cliente no
--     la ve nunca y el servidor del chat no guarda copia.
--   · Ver la foto se puede quitar por persona en Accesos (chat.fotos).
-- ════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rostros', 'rostros', false, 102400, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_rostros_lectura on storage.objects;
create policy storage_rostros_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'rostros' and es_staff());

drop policy if exists storage_rostros_sube on storage.objects;
create policy storage_rostros_sube on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rostros' and es_staff());

-- Para volver a recortarla (upsert) cuando el cliente cambia su selfie.
drop policy if exists storage_rostros_actualiza on storage.objects;
create policy storage_rostros_actualiza on storage.objects
  for update to authenticated
  using (bucket_id = 'rostros' and es_staff())
  with check (bucket_id = 'rostros' and es_staff());

drop policy if exists storage_rostros_borra on storage.objects;
create policy storage_rostros_borra on storage.objects
  for delete to authenticated
  using (bucket_id = 'rostros' and es_admin());
