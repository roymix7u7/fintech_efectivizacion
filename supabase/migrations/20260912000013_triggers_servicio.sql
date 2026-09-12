-- ============================================================
--  LOS TRIGGERS DEGRADABAN A CLIENTE LO QUE CREABA LA FUNCION
--
--  users_forzar_alta pone rol=cliente y estado=pendiente cuando
--  quien escribe no es staff. Para decidirlo llama a es_staff(),
--  que mira auth.uid().
--
--  La funcion crear-staff escribe con la clave de servicio, y
--  ahi no hay usuario en sesion: auth.uid() es nulo. Asi que el
--  trigger trataba a la funcion como a un cliente registrandose
--  solo, y la cuenta recien creada aparecia en la lista de
--  clientes por verificar en vez de en Equipo.
--
--  La proteccion sigue siendo necesaria: impide que un cliente
--  se ascienda a administrador desde el navegador. Lo que se
--  agrega es reconocer al rol de servicio como codigo de
--  servidor ya verificado. La funcion comprueba por su cuenta
--  que quien llama sea administrador antes de escribir.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Quien escribe es codigo de servidor, no un navegador
--    PostgREST cambia el rol de la conexion segun la clave, asi
--    que current_user distingue una llamada del navegador de una
--    de la funcion o de una migracion.
-- ------------------------------------------------------------
create or replace function public.es_servicio()
returns boolean
language sql stable
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin');
$$;


-- ------------------------------------------------------------
-- 2) Las tres funciones de rol reconocen al servicio
--    No debilita nada: service_role ya tiene bypassrls y permiso
--    sobre todas las tablas, asi que podia hacer esto igualmente.
--    Lo unico que cambia es que los triggers dejan de estorbarle.
-- ------------------------------------------------------------
create or replace function public.es_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.es_servicio() or coalesce((
    select rol in ('admin', 'supervisor', 'gestor') and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false);
$$;

create or replace function public.es_supervisor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.es_servicio() or coalesce((
    select rol in ('admin', 'supervisor') and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false);
$$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.es_servicio() or coalesce((
    select rol = 'admin' and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false);
$$;


-- ------------------------------------------------------------
-- 3) Reparar las cuentas que ya se crearon degradadas
--    La auditoria guardo el rol y la sede que se pidieron, asi
--    que se puede devolver cada una a lo que debia ser.
-- ------------------------------------------------------------
do $$
declare
  r record;
  v_arregladas integer := 0;
begin
  for r in
    select distinct on (l.entidad_id)
           l.entidad_id                         as id,
           l.datos_despues ->> 'rol'            as rol,
           nullif(l.datos_despues ->> 'sede_id', '') as sede_id
    from public.auditoria_logs l
    where l.accion = 'CREAR_STAFF'
      and l.entidad_id is not null
      and l.datos_despues ? 'rol'
    order by l.entidad_id, l.created_at desc
  loop
    update public.users u
       set rol     = r.rol::public.rol_usuario,
           estado  = 'activo',
           sede_id = coalesce(r.sede_id::uuid, u.sede_id)
     where u.id = r.id
       and u.rol = 'cliente';   -- solo las que quedaron degradadas

    if found then
      v_arregladas := v_arregladas + 1;
    end if;
  end loop;

  raise notice 'Cuentas de personal reparadas: %', v_arregladas;
end $$;
