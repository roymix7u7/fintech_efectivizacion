-- ============================================================
--  CUANTOS CLIENTES ABRIERON CADA ALERTA
--
--  Una alerta se manda porque hay algo que la gente tiene que
--  saber hoy. Sin este numero no hay forma de saber si llego:
--  el panel la muestra como enviada y ahi termina la historia.
--
--  Contar desde el panel obligaria a una consulta por alerta, o
--  a traerse las decenas de miles de filas de lectura para
--  contarlas en el navegador. Se resuelve en el servidor, que es
--  donde estan los datos.
-- ============================================================

create or replace function public.alertas_alcance()
returns table (alerta_id uuid, vistas bigint, clientes bigint)
language sql
stable
security definer
set search_path = public
as $$
  -- security definer para poder contar las lecturas de todos los
  -- clientes, pero solo si quien pregunta es del equipo. Sin este
  -- filtro, un cliente con sesion podria pedir la funcion.
  select v.alerta_id,
         count(*)::bigint,
         (select count(*) from public.users
           where rol = 'cliente' and estado = 'activo')::bigint
  from public.alertas_vistas v
  where public.es_staff()
  group by v.alerta_id;
$$;

grant execute on function public.alertas_alcance() to authenticated;
revoke execute on function public.alertas_alcance() from anon;

notify pgrst, 'reload schema';
