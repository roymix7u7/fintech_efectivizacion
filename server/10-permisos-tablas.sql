-- ============================================================
--  ARREGLA EL ERROR 403 EN COMISIONES Y SEDES
--
--  Las tablas nuevas se crearon sin permisos de tabla, asi que
--  Postgres las rechaza antes de mirar siquiera las politicas.
--  Por eso daba "permission denied for table", codigo 42501, en
--  vez de devolver una lista vacia.
--
--  Son dos capas distintas y hacen falta las dos:
--    · GRANT decide si el rol puede tocar la tabla,
--    · RLS decide que filas ve de esa tabla.
--
--  Las tablas viejas ya tenian el GRANT puesto por Supabase al
--  crearlas desde el panel. Estas se crearon desde el editor SQL
--  y no lo heredaron.
--
--  Ejecutar entero.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Permisos de tabla
--    Solo para authenticated. A anon no se le da nada: no tiene
--    por que leer comisiones ni sedes ni con sesion ni sin ella.
--    Las politicas RLS siguen decidiendo quien ve y escribe que.
-- ------------------------------------------------------------
grant select on public.comisiones_banco to authenticated;
grant insert, update, delete on public.comisiones_banco to authenticated;

grant select on public.comisiones_cliente to authenticated;
grant insert, update, delete on public.comisiones_cliente to authenticated;

grant select on public.sedes to authenticated;
grant insert, update, delete on public.sedes to authenticated;


-- ------------------------------------------------------------
-- 2) Permiso de ejecucion de las funciones que llama el panel
-- ------------------------------------------------------------
grant execute on function public.comision_efectiva(uuid, text) to authenticated;
grant execute on function public.asignar_comision_masiva(text, numeric, uuid[], text) to authenticated;
grant execute on function public.quitar_comision_especial(text, uuid[]) to authenticated;
grant execute on function public.tomar_siguiente(text) to authenticated;
grant execute on function public.soltar_caso(text, uuid) to authenticated;
grant execute on function public.estado_cola() to authenticated;
grant execute on function public.listar_equipo() to authenticated;
grant execute on function public.rendimiento_equipo(integer, uuid) to authenticated;


-- ------------------------------------------------------------
-- 3) Que no vuelva a pasar
--    A partir de ahora, cualquier tabla nueva que crees desde el
--    editor SQL nace ya con permiso para authenticated.
-- ------------------------------------------------------------
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant execute on functions to authenticated;


-- ------------------------------------------------------------
-- 4) Refrescar la cache de la API
--    PostgREST guarda el esquema en memoria y a veces no se
--    entera de los cambios hasta que se le avisa.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 5) Comprobacion
--    Las tres tablas deben aparecer con authenticated.
-- ------------------------------------------------------------
select table_name  as tabla,
       grantee     as rol,
       string_agg(privilege_type, ', ' order by privilege_type) as permisos
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('comisiones_banco', 'comisiones_cliente', 'sedes')
  and grantee in ('authenticated', 'anon')
group by table_name, grantee
order by table_name, grantee;
