-- ============================================================
--  DATOS DE PRUEBA PARA TODOS LOS ROLES
--
--  Crea un dia de trabajo completo y realista, sin fotos: no hacen
--  falta para probar flujos, colas ni permisos.
--
--  Que queda listo para probar, rol por rol:
--
--    CLIENTE   cuentas en cada estado (por revisar, observado,
--              activo), con tarjetas, cuentas bancarias del mismo
--              banco y solicitudes en los cuatro estados.
--    GESTOR    cola de identidades, de tarjetas y de comprobantes,
--              ya repartida entre los gestores activos, con algunos
--              casos vencidos esperando en la bolsa.
--    SUPERVISOR historial de casos resueltos por su gente, para que
--              el rendimiento no salga vacio, y clientes a los que
--              ponerles comision especial.
--    PAGOS     solicitudes aprobadas en varios bancos, dos
--              encargados sobre el mismo banco, y lotes ya pagados
--              para el historial y para probar una cancelacion.
--    ADMIN     un segundo bloque de comisiones con tarifas
--              distintas, clientes dentro, y excepciones que los
--              cambios masivos no deben tocar.
--
--  Todo queda marcado para poder borrarlo sin tocar datos reales:
--    · correos  @prueba.altoque.pe
--    · clientes con codigo_promo = 'DATOS_PRUEBA'
--    · solicitudes con codigo que empieza en 'PRB-'
--  Para borrarlo: server/semillas/limpiar-datos-prueba.sql
--
--  Contrasena de todas las cuentas: Prueba2026!
--
--  Se puede ejecutar dos veces: lo que ya existe se salta.
-- ============================================================

do $$
declare
  v_nombres text[] := array[
    'Lucía','Mateo','Valentina','Santiago','Camila','Sebastián','Daniela','Diego',
    'Fernanda','Joaquín','Isabella','Rodrigo','Mariana','Gabriel','Andrea','Adrián',
    'Sofía','Emilio','Renata','Nicolás','Ximena','Alonso','Paula','Bruno'];
  v_apellidos text[] := array[
    'Quispe Mamani','Flores Huamán','Rojas Chávez','Torres Vargas','Ramírez Castillo',
    'Mendoza Salazar','Gutiérrez Paredes','Díaz Cárdenas','Sánchez Ríos','Vásquez León',
    'Castro Aguilar','Herrera Ramos','Espinoza Luna','Morales Cruz','Ortiz Medina',
    'Silva Campos','Palacios Soto','Navarro Cáceres','Reyes Pinto','Delgado Farfán',
    'Cabrera Tapia','Benites Arroyo','Zapata Olivares','Chumpitaz Villa'];
  v_distritos text[] := array[
    'Lima','Miraflores','San Juan de Lurigancho','Los Olivos','Surco',
    'Comas','San Miguel','Ate','Chorrillos','Independencia'];
  -- Solo bancos principales: el deposito viaja dentro del mismo banco.
  v_bancos text[] := array['BCP','BBVA','Interbank','Scotiabank','BanBif'];

  v_admin        uuid;
  v_gestores     uuid[];
  v_pagos1       uuid;
  v_pagos2       uuid;
  v_bloque_def   uuid;
  v_bloque_pref  uuid;
  v_sede_norte   uuid;

  v_id        uuid;
  v_email     text;
  v_dni       text;
  v_perfil    uuid;
  v_banco     text;
  v_banco2    text;
  v_tarjeta   uuid;
  v_sol       uuid;
  v_lote      uuid;
  v_cuando    timestamptz;
  v_gestor    uuid;

  v_creados   int := 0;
  v_saltados  int := 0;
  v_sols      int := 0;
  v_pagadas   uuid[] := '{}';
begin
  select id into v_admin from public.users where rol = 'admin' limit 1;
  select array_agg(id order by email) into v_gestores
    from public.users where rol = 'gestor' and estado = 'activo';
  select id into v_pagos1 from public.users where rol = 'pagos' order by created_at limit 1;
  select id into v_bloque_def from public.bloques_comision where es_default limit 1;
  select id into v_sede_norte from public.sedes order by nombre limit 1;

  if v_gestores is null then
    raise exception 'No hay gestores activos: la cola no se podria repartir.';
  end if;

  -- ── Segundo encargado de pagos, para probar dos sobre el mismo banco ──
  select id into v_pagos2 from public.users where email = 'pagos2@prueba.altoque.pe';
  if v_pagos2 is null then
    v_pagos2 := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_pagos2, 'authenticated',
      'authenticated', 'pagos2@prueba.altoque.pe',
      extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_pagos2, v_pagos2::text, 'email',
      jsonb_build_object('sub', v_pagos2::text, 'email', 'pagos2@prueba.altoque.pe',
                         'email_verified', true), now(), now(), now());
    insert into public.users (id, email, rol, estado, sede_id)
    values (v_pagos2, 'pagos2@prueba.altoque.pe', 'pagos', 'activo', v_sede_norte);
  end if;

  -- Bancos de cada encargado. BCP lo llevan los dos a proposito: es el
  -- caso donde hay que comprobar que no se pisen.
  if v_pagos1 is not null then
    insert into public.pagos_bancos (user_id, banco) values
      (v_pagos1, 'BCP'), (v_pagos1, 'Interbank'), (v_pagos1, 'Scotiabank')
    on conflict do nothing;
  end if;
  insert into public.pagos_bancos (user_id, banco) values
    (v_pagos2, 'BCP'), (v_pagos2, 'BBVA'), (v_pagos2, 'BanBif')
  on conflict do nothing;

  -- ── Segundo bloque de comisiones ──
  select id into v_bloque_pref from public.bloques_comision where nombre = 'Preferentes';
  if v_bloque_pref is null then
    insert into public.bloques_comision (nombre, descripcion, creado_por)
    values ('Preferentes', 'Clientes de alto volumen: tarifas más bajas.', v_admin)
    returning id into v_bloque_pref;
    insert into public.bloques_comision_banco (bloque_id, banco, porcentaje)
    select v_bloque_pref, b, 0.80
    from unnest(array['BCP','BBVA','Interbank','Scotiabank','BanBif','CMR','Otros']) b
    on conflict do nothing;
  end if;

  -- ══════════ CLIENTES ══════════
  for i in 1..24 loop
    v_email := 'cliente' || lpad(i::text, 2, '0') || '@prueba.altoque.pe';
    v_dni   := (90000000 + i)::text;

    if exists (select 1 from auth.users where email = v_email)
       or exists (select 1 from public.perfiles_cliente where dni = v_dni) then
      v_saltados := v_saltados + 1;
      continue;
    end if;

    -- Los primeros llegaron hace mas tiempo: la cola los atiende antes.
    v_cuando := now() - ((25 - i) * interval '23 minutes');
    v_id := gen_random_uuid();
    v_banco  := v_bancos[1 + (i % 5)];
    v_banco2 := v_bancos[1 + ((i + 2) % 5)];

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated',
      'authenticated', v_email,
      extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), v_cuando,
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, v_cuando, v_cuando,
      '', '', '', '');

    insert into auth.identities (id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      v_cuando, v_cuando, v_cuando);

    -- Estado segun el indice. El disparador de reparto asigna solo las
    -- que entran como pendientes.
    insert into public.users (id, email, rol, estado, created_at)
    values (v_id, v_email, 'cliente',
            -- El enum no acepta un case de texto sin decirle su tipo.
            (case when i <= 6 then 'pendiente'
                  when i <= 8 then 'observado'
                  else 'activo' end)::public.estado_usuario,
            v_cuando);

    insert into public.perfiles_cliente (
      user_id, nombres, apellidos, dni, telefono, direccion, codigo_promo,
      bloque_id, validado_por, fecha_validacion, motivo_observacion, created_at)
    values (
      v_id, v_nombres[i], v_apellidos[i], v_dni,
      '+519' || lpad((10000000 + i * 1373)::text, 8, '0'),
      'Av. Los Álamos ' || (100 + i * 17) || ', ' || v_distritos[1 + ((i * 3) % 10)],
      'DATOS_PRUEBA',
      case when i > 8 then
        case when i >= 20 then v_bloque_pref else v_bloque_def end
      end,
      case when i > 8 then v_admin end,
      case when i > 8 then v_cuando + interval '2 hours' end,
      case when i between 7 and 8
           then 'La foto del DNI salió movida y no se leen los apellidos. Vuelve a tomarla con buena luz.' end,
      v_cuando)
    returning id into v_perfil;

    v_creados := v_creados + 1;
    continue when i <= 8;

    -- ── Cuenta bancaria del mismo banco de su tarjeta ──
    insert into public.cuentas_bancarias (cliente_id, banco, numero_cuenta, tipo, activa)
    values (v_perfil, v_banco,
            lpad((19100000000000 + i * 7919)::text, 14, '0'), 'ahorros', true);

    -- Uno de cada seis se queda sin cuenta del segundo banco: sirve para
    -- ver el bloqueo al enviar y el aviso de "falta tu cuenta".
    if i % 6 <> 0 then
      insert into public.cuentas_bancarias (cliente_id, banco, numero_cuenta, tipo, activa)
      values (v_perfil, v_banco2,
              lpad((19200000000000 + i * 6221)::text, 14, '0'), 'interbancaria', true);
    end if;

    -- ── Tarjeta principal, ya verificada ──
    insert into public.tarjetas (cliente_id, banco, ultimos_4, foto_tarjeta, estado,
                                 activa, revisado_por, fecha_revision, created_at)
    values (v_perfil, v_banco, lpad(((i * 37) % 10000)::text, 4, '0'),
            'prueba/sin-imagen.jpg', 'aprobado', true,
            v_gestores[1 + (i % array_length(v_gestores, 1))],
            v_cuando + interval '3 hours', v_cuando + interval '1 hour')
    returning id into v_tarjeta;

    -- ── Tarjetas por verificar: la cola del gestor ──
    if i between 9 and 14 then
      insert into public.tarjetas (cliente_id, banco, ultimos_4, foto_tarjeta,
                                   foto_reverso, estado, activa, created_at)
      values (v_perfil, v_banco2, lpad(((i * 91) % 10000)::text, 4, '0'),
              'prueba/sin-imagen.jpg',
              case when i % 2 = 0 then 'prueba/sin-imagen-reverso.jpg' end,
              'pendiente', true, now() - (i * interval '11 minutes'));
    end if;

    -- Una rechazada, para ver el motivo en el app.
    if i = 15 then
      insert into public.tarjetas (cliente_id, banco, ultimos_4, foto_tarjeta, estado,
                                   activa, revisado_por, fecha_revision,
                                   motivo_rechazo, created_at)
      values (v_perfil, 'CMR', '4417', 'prueba/sin-imagen.jpg', 'rechazado', true,
              v_gestores[1], now() - interval '2 days',
              'La foto no muestra tu nombre: necesitamos verlo para confirmar que la tarjeta es tuya.',
              now() - interval '2 days');
    end if;

    -- ── Solicitudes ──
    -- Pendientes: entran a la cola y el disparador las reparte.
    if i between 9 and 16 then
      insert into public.solicitudes (codigo, cliente_id, tarjeta_id, banco,
                                      comprobante_url, nota_cliente, estado, created_at)
      values ('PRB-' || lpad(i::text, 2, '0') || '-A', v_perfil, v_tarjeta, v_banco,
              'prueba/sin-imagen.jpg',
              case when i % 3 = 0 then 'La hice desde la app del banco a las 3 p. m.' end,
              'pendiente', now() - (i * interval '17 minutes'));
      v_sols := v_sols + 1;
    end if;

    -- Aprobadas: es lo que ve Pagos para marcar y pagar.
    if i between 9 and 20 then
      insert into public.solicitudes (codigo, cliente_id, tarjeta_id, banco,
                                      comprobante_url, estado, revisado_por,
                                      fecha_revision, created_at)
      values ('PRB-' || lpad(i::text, 2, '0') || '-B', v_perfil, v_tarjeta, v_banco,
              'prueba/sin-imagen.jpg', 'aprobado',
              v_gestores[1 + (i % array_length(v_gestores, 1))],
              now() - (i * interval '13 minutes'),
              now() - (i * interval '40 minutes'))
      returning id into v_sol;
      v_sols := v_sols + 1;
      -- Las primeras se marcaran como ya pagadas, mas abajo.
      if i between 9 and 12 then
        v_pagadas := v_pagadas || v_sol;
      end if;
    end if;

    -- Rechazada, con motivo que el cliente lee en su app.
    if i = 17 then
      insert into public.solicitudes (codigo, cliente_id, tarjeta_id, banco,
                                      comprobante_url, estado, revisado_por,
                                      fecha_revision, motivo_rechazo, created_at)
      values ('PRB-17-C', v_perfil, v_tarjeta, v_banco, 'prueba/sin-imagen.jpg',
              'rechazado', v_gestores[1], now() - interval '1 day',
              'El comprobante no corresponde a la tarjeta que elegiste. Revisa y vuelve a enviarlo.',
              now() - interval '1 day 1 hour');
      v_sols := v_sols + 1;
    end if;

    -- Comisiones especiales: las excepciones que el masivo no debe tocar.
    if i in (10, 21) then
      insert into public.comisiones_cliente (cliente_id, banco, porcentaje, motivo, asignado_por)
      values (v_perfil, v_banco, 0.60, 'Acuerdo por volumen mensual.', v_admin)
      on conflict (cliente_id, banco) do nothing;
    end if;

    -- Avisos en la campana del cliente.
    insert into public.notificaciones (user_id, tipo, titulo, cuerpo, leida)
    values (v_id, 'kyc_aprobado', 'Cuenta verificada',
            'Tu identidad fue verificada. Ya puedes registrar tu tarjeta y operar.',
            i % 3 = 0);
  end loop;

  -- ══════════ UN LOTE YA PAGADO, PARA EL HISTORIAL ══════════
  if array_length(v_pagadas, 1) > 0 and v_pagos1 is not null then
    insert into public.lotes_pago (creado_por, cantidad, bancos, creado_en)
    values (v_pagos1, array_length(v_pagadas, 1),
            (select array_agg(distinct banco) from public.solicitudes where id = any(v_pagadas)),
            now() - interval '3 hours')
    returning id into v_lote;

    update public.solicitudes
       set estado = 'pagado', pagado_por = v_pagos1,
           pagado_en = now() - interval '3 hours', lote_id = v_lote
     where id = any(v_pagadas);

    insert into public.pagos_eventos (solicitud_id, lote_id, accion, usuario_id, creado_en)
    select unnest(v_pagadas), v_lote, 'pagado', v_pagos1, now() - interval '3 hours';

    -- Una cancelada dentro de ese lote: asi el historial muestra los dos
    -- casos y la solicitud vuelve a la cola de pagos.
    update public.solicitudes
       set estado = 'aprobado', pagado_por = null, pagado_en = null, lote_id = null
     where id = v_pagadas[1];
    insert into public.pagos_eventos (solicitud_id, lote_id, accion, usuario_id, motivo, creado_en)
    values (v_pagadas[1], v_lote, 'cancelado', v_pagos1,
            'La transferencia fue rechazada por el banco: cuenta con datos desactualizados.',
            now() - interval '2 hours');
  end if;

  -- ══════════ CASOS VENCIDOS, ESPERANDO EN LA BOLSA ══════════
  -- Se les envejece la asignacion para que cualquiera pueda tomarlos:
  -- es lo que pasa cuando un gestor toma un caso y se desconecta.
  update public.users
     set asignado_en = now() - interval '45 minutes'
   where id in (select id from public.users
                 where rol = 'cliente' and estado = 'pendiente'
                   and email like '%@prueba.altoque.pe'
                 order by created_at limit 2);

  update public.solicitudes
     set asignado_en = now() - interval '40 minutes'
   where id in (select id from public.solicitudes
                 where estado = 'pendiente' and codigo like 'PRB-%'
                 order by created_at limit 2);

  raise notice 'Clientes creados: % (saltados: %), solicitudes: %, lote pagado: %',
    v_creados, v_saltados, v_sols, v_lote;
end $$;
