-- ============================================================
--  UN TIPO NUEVO DE NOTICIA: PROMOCION
--
--  Los tipos eran info, advertencia y critico, que nacieron
--  pensando en avisos de sistema. Pero casi todo lo que se
--  publica es una promocion, y llamarla "info" hacia que se
--  viera igual de gris que un aviso de mantenimiento.
--
--  Va en su propio archivo a proposito: Postgres no deja usar
--  un valor de enum en la misma transaccion en la que se agrega,
--  y cada archivo de migracion es una transaccion. La migracion
--  siguiente ya puede referirse a 'promocion'.
-- ============================================================

alter type public.tipo_alerta add value if not exists 'promocion';
