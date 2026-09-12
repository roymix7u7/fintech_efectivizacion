-- ============================================================
--  LIMPIEZA FINAL Y COMPROBACION
--  Ejecutar despues de 02 y 03.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Politicas de Storage duplicadas
--
--    Las politicas viejas siguen ahi junto a las nuevas. No son
--    un agujero: todas exigen que la carpeta coincida con
--    auth.uid(), y un visitante anonimo tiene auth.uid() nulo,
--    asi que la condicion nunca se cumple.
--
--    Aun asi conviene borrarlas. Las politicas se combinan con
--    OR, asi que tener dos juegos sobre los mismos buckets hace
--    que sea dificil razonar sobre quien puede que cosa, y las
--    viejas todavia nombran los roles verificador y tesoreria.
--    Las nuevas ya cubren lectura, escritura, actualizacion y
--    borrado con es_staff().
-- ------------------------------------------------------------
drop policy if exists comprobantes_read on storage.objects;
drop policy if exists comprobantes_upload on storage.objects;
drop policy if exists kyc_read on storage.objects;
drop policy if exists kyc_upload on storage.objects;
drop policy if exists tarjetas_fotos_read on storage.objects;
drop policy if exists tarjetas_fotos_upload on storage.objects;


-- ------------------------------------------------------------
-- 2) El bucket vouchers quedo sin uso
--    Era del flujo con montos. No tiene ninguna politica, asi
--    que ya esta cerrado. Borralo solo si esta vacio.
-- ------------------------------------------------------------
-- select count(*) from storage.objects where bucket_id = 'vouchers';
-- delete from storage.buckets where name = 'vouchers';


-- ------------------------------------------------------------
-- 3) COMPROBACION
--    Ejecuta esto al final y pegame el resultado.
--    Lo esperado es que devuelva CERO filas.
-- ------------------------------------------------------------
select
  schemaname as esquema,
  tablename  as tabla,
  policyname as politica,
  cmd        as operacion,
  qual       as condicion_lectura,
  with_check as condicion_escritura
from pg_policies
where schemaname in ('public', 'storage')
  and (
    qual = 'true'
    or with_check = 'true'
    or qual like '%auth.jwt()%'
    or with_check like '%auth.jwt()%'
  )
order by schemaname, tablename, policyname;


-- ------------------------------------------------------------
-- 4) Segunda comprobacion: que tablas quedaron sin politicas
--    Una tabla con RLS activo y sin politicas queda bloqueada
--    para todos, lo que rompe la app en silencio.
--    Tambien deberia devolver cero filas.
-- ------------------------------------------------------------
select c.relname as tabla_sin_politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by c.relname;
