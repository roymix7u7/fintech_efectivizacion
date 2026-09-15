-- ============================================================
--  SIMULA EL REPARTO DE LA COLA DE KYC ENTRE LOS GESTORES
--
--  Ejecutar DESPUES de clientes-prueba.sql. No cambia nada: al final
--  lanza un error a proposito para que Postgres deshaga todo, y el
--  resultado viaja en el mensaje de ese error.
--
--  Que comprueba, gestor por gestor y en turnos:
--
--    1. Tomar siguiente le da a cada uno un cliente distinto.
--    2. Pedir otra vez sin resolver le devuelve EL MISMO cliente: nadie
--       acapara casos pulsando el boton varias veces.
--    3. Al resolverlo (aprobar), el siguiente toque le da uno nuevo.
--    4. Nunca dos gestores reciben el mismo cliente.
--    5. Se atiende primero al que llego antes.
--
--  Lee el mensaje que empieza por REPARTO en el resultado.
-- ============================================================

do $$
declare
  v_gestores uuid[];
  v_emails   text[];
  v_turnos   int := 3;
  v_g        int;
  v_t        int;
  v_caso     uuid;
  v_repetido uuid;
  v_detalle  text := '';
  v_tomados  uuid[] := '{}';
  v_acapara  int := 0;
  v_fuera_orden int := 0;
  v_anterior timestamptz;
  v_llegada  timestamptz;
  v_pendientes int;
begin
  select array_agg(id order by email), array_agg(email order by email)
    into v_gestores, v_emails
  from public.users
  where rol = 'gestor' and estado = 'activo';

  select count(*) into v_pendientes
  from public.users where rol = 'cliente' and estado = 'pendiente';

  if v_gestores is null then
    raise exception 'REPARTO sin gestores activos';
  end if;
  if v_pendientes = 0 then
    raise exception 'REPARTO la cola esta vacia: ejecuta primero clientes-prueba.sql';
  end if;

  for v_t in 1..v_turnos loop
    v_detalle := v_detalle || E'\n  Turno ' || v_t || ':';

    for v_g in 1..array_length(v_gestores, 1) loop
      -- Actuar como ese gestor, igual que una peticion del panel.
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_gestores[v_g], 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);

      v_caso := public.tomar_siguiente('kyc');
      exit when v_caso is null;

      -- Volver a pedir sin resolver: debe ser el mismo.
      v_repetido := public.tomar_siguiente('kyc');
      if v_repetido is distinct from v_caso then
        v_acapara := v_acapara + 1;
      end if;

      perform set_config('role', 'postgres', true);

      -- Orden de llegada: cada caso nuevo no puede ser mas nuevo que
      -- uno que quedo esperando.
      select created_at into v_llegada from public.users where id = v_caso;
      if v_anterior is not null and v_llegada < v_anterior then
        v_fuera_orden := v_fuera_orden + 1;
      end if;
      v_anterior := v_llegada;

      v_tomados := v_tomados || v_caso;
      v_detalle := v_detalle || E'\n    '
        || rpad(split_part(v_emails[v_g], '@', 1), 16)
        || ' -> ' || (select p.nombres || ' ' || p.apellidos || ' (DNI ' || p.dni || ')'
                      from public.perfiles_cliente p where p.user_id = v_caso);

      -- Resolverlo como ese gestor, para que el proximo toque le de otro.
      perform set_config('role', 'authenticated', true);
      update public.users set estado = 'activo' where id = v_caso;
      perform set_config('role', 'postgres', true);
    end loop;
  end loop;

  raise exception E'REPARTO\n  Gestores activos: %\n  Clientes pendientes al empezar: %\n  Casos tomados: % en % turnos\n  Casos repetidos entre gestores: %\n  Gestores que acapararon al pulsar dos veces: %\n  Casos atendidos fuera de orden de llegada: %\n%\n\n  (Todo se deshizo: la cola real no cambio.)',
    array_length(v_gestores, 1),
    v_pendientes,
    array_length(v_tomados, 1),
    v_turnos,
    array_length(v_tomados, 1) - (select count(distinct x) from unnest(v_tomados) x),
    v_acapara,
    v_fuera_orden,
    v_detalle;
end $$;
