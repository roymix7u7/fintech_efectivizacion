-- Comprobacion, no cambia nada.
--
-- Si los permisos de tabla no estuvieran puestos, esta migracion
-- falla y el push se detiene. Si pasa, es que estan.
--
-- Hizo falta porque no se puede sondear con la clave anonima: a anon
-- no se le dio permiso a proposito, asi que responde denegado tanto
-- si el GRANT existe como si no.
do $$
declare
  v_tablas integer;
  v_rpc    integer;
begin
  select count(distinct table_name) into v_tablas
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('comisiones_banco', 'comisiones_cliente', 'sedes')
    and grantee = 'authenticated'
    and privilege_type = 'SELECT';

  if v_tablas < 3 then
    raise exception
      'Solo % de 3 tablas tienen SELECT para authenticated', v_tablas;
  end if;

  select count(*) into v_rpc
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and grantee = 'authenticated'
    and routine_name in ('tomar_siguiente', 'estado_cola', 'listar_equipo');

  if v_rpc < 3 then
    raise exception
      'Solo % de 3 funciones tienen EXECUTE para authenticated', v_rpc;
  end if;

  raise notice 'Permisos correctos: % tablas y % funciones', v_tablas, v_rpc;
end $$;
