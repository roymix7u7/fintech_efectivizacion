-- ============================================================
--  PASO 1 DE 2 — EJECUTAR ESTE SOLO, Y LUEGO 09b
--
--  Postgres no deja usar un valor nuevo de enum dentro de la
--  misma transacción que lo crea. Por eso va en su propio
--  archivo: si lo pegas junto con 09b, el resto falla.
--
--  Ejecuta esto, espera a que diga Success, y recién entonces
--  abre 09b-sedes-y-equipo.sql.
-- ============================================================

alter type public.rol_usuario add value if not exists 'supervisor';

-- Comprobación: deberías ver supervisor en la lista.
select enumlabel as roles_disponibles
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'rol_usuario'
order by e.enumsortorder;
