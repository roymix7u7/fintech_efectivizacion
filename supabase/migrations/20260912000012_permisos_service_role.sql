-- ============================================================
--  EL ROL DE SERVICIO NO PODIA LEER NINGUNA TABLA
--
--  La funcion crear-staff fallaba con "permission denied for
--  table users" aunque quien llamaba fuera administrador.
--
--  La causa: en public.users, service_role tenia unicamente
--  REFERENCES, TRIGGER y TRUNCATE. Le faltaban SELECT, INSERT,
--  UPDATE y DELETE, que anon y authenticated si tenian.
--
--  No se habia notado porque hasta ahora todo pasaba por el
--  navegador como authenticated. La funcion de alta es lo
--  primero que usa la clave de servicio.
--
--  Es seguro dar estos permisos: la clave de servicio vive solo
--  dentro de Supabase, nunca viaja al navegador, y ademas
--  service_role ya tiene bypassrls, asi que las politicas no lo
--  limitan de todos modos. Negarle el GRANT no aportaba
--  seguridad, solo lo dejaba inutil.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Permisos sobre lo que ya existe
-- ------------------------------------------------------------
grant select, insert, update, delete
  on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to service_role;

grant execute on all functions in schema public to service_role;


-- ------------------------------------------------------------
-- 2) Que las tablas nuevas nazcan bien
-- ------------------------------------------------------------
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;


-- ------------------------------------------------------------
-- 3) Refrescar la cache de la API
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 4) Comprobacion: falla a proposito si algo quedo sin permiso
-- ------------------------------------------------------------
do $$
declare
  v_faltan text;
begin
  select string_agg(t.tablename, ', ' order by t.tablename)
    into v_faltan
  from pg_tables t
  where t.schemaname = 'public'
    and not exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = t.tablename
        and g.grantee = 'service_role'
        and g.privilege_type = 'SELECT'
    );

  if v_faltan is not null then
    raise exception 'Sin SELECT para service_role: %', v_faltan;
  end if;
end $$;
