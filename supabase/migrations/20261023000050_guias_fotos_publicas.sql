-- ============================================================
--  IMÁGENES DE LAS GUÍAS DE BANCO
--
--  El bucket guias-bancos existía pero era privado y el panel no tenía
--  cómo subir nada: los pasos solo aceptaban una URL pegada a mano.
--  Ahora el panel sube la portada y la captura de cada paso.
--
--  Público como noticias-fotos: son capturas de la app del banco que
--  ve cualquier cliente, no datos de nadie. Así la app usa la URL
--  directa (sin firmar ni caducar) y la guarda con la guía en el
--  teléfono. Escribir sigue siendo solo del administrador
--  (storage_guias_escritura); leer ya estaba abierto.
-- ============================================================

update storage.buckets
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'guias-bancos';
