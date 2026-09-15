-- ============================================================
--  DATOS DE PRUEBA: 40 CLIENTES PENDIENTES DE REVISION (KYC)
--
--  Para probar como se reparte la cola de revision de identidad
--  entre los gestores. Cada cliente tiene las mismas cuatro piezas
--  que deja un registro real desde el app:
--
--    auth.users       cuenta de acceso (puede iniciar sesion)
--    auth.identities  identidad de correo, sin ella no hay login
--    public.users     rol cliente, estado pendiente
--    perfiles_cliente nombres, DNI, telefono, direccion
--
--  Sin fotos de DNI ni selfie: no hacen falta para probar el reparto.
--
--  Todos quedan marcados para borrarlos sin tocar datos reales:
--    · correo  cliente.pruebaNN@prueba.altoque.pe
--    · codigo_promo = 'DATOS_PRUEBA'
--    · DNI entre 90000001 y 90000040
--  Para borrarlos: server/semillas/limpiar-clientes-prueba.sql
--
--  Contrasena de todos: Prueba2026!
--
--  Llegan escalonados, uno cada 6 minutos hacia atras desde ahora:
--  la cola atiende primero al mas antiguo, asi se ve el orden.
--
--  Se puede ejecutar dos veces: si un correo o DNI ya existe, ese
--  cliente se salta.
-- ============================================================

do $$
declare
  v_nombres text[] := array[
    'Lucía', 'Mateo', 'Valentina', 'Santiago', 'Camila', 'Sebastián',
    'Daniela', 'Diego', 'Fernanda', 'Joaquín', 'Isabella', 'Rodrigo',
    'Mariana', 'Gabriel', 'Andrea', 'Adrián', 'Sofía', 'Emilio',
    'Renata', 'Nicolás', 'Ximena', 'Alonso', 'Paula', 'Bruno',
    'Carolina', 'Martín', 'Alessandra', 'Tomás', 'Micaela', 'Gonzalo',
    'Antonella', 'Iván', 'Natalia', 'Franco', 'Luciana', 'Héctor',
    'Brenda', 'Julio', 'Milagros', 'Walter'];
  v_apellidos text[] := array[
    'Quispe Mamani', 'Flores Huamán', 'Rojas Chávez', 'Torres Vargas',
    'Ramírez Castillo', 'Mendoza Salazar', 'Gutiérrez Paredes',
    'Díaz Cárdenas', 'Sánchez Ríos', 'Vásquez León', 'Castro Aguilar',
    'Herrera Ramos', 'Espinoza Luna', 'Morales Cruz', 'Ortiz Medina',
    'Silva Campos', 'Palacios Soto', 'Navarro Cáceres', 'Reyes Pinto',
    'Delgado Farfán', 'Cabrera Tapia', 'Benites Arroyo', 'Zapata Olivares',
    'Chumpitaz Villa', 'Lozano Peña', 'Poma Condori', 'Guerrero Molina',
    'Cruz Saavedra', 'Valdivia Ponce', 'Acosta Lazo', 'Huaylla Ccori',
    'Neyra Bustamante', 'Carrillo Uribe', 'Ayala Montes', 'Salas Rivera',
    'Paz Cornejo', 'Ugarte Rosales', 'Llanos Meza', 'Ccahuana Rojas',
    'Tello Carranza'];
  v_calles text[] := array[
    'Av. Arequipa', 'Jr. de la Unión', 'Av. Brasil', 'Av. Javier Prado',
    'Av. La Marina', 'Jr. Huancavelica', 'Av. Túpac Amaru', 'Av. Angamos',
    'Av. Universitaria', 'Calle Los Pinos'];
  v_distritos text[] := array[
    'Lima', 'Miraflores', 'San Juan de Lurigancho', 'Los Olivos', 'Surco',
    'Comas', 'San Miguel', 'Ate', 'Chorrillos', 'Independencia'];

  v_id       uuid;
  v_email    text;
  v_dni      text;
  v_cuando   timestamptz;
  v_creados  int := 0;
  v_saltados int := 0;
begin
  for i in 1..40 loop
    v_email  := 'cliente.prueba' || lpad(i::text, 2, '0') || '@prueba.altoque.pe';
    v_dni    := (90000000 + i)::text;
    v_cuando := now() - ((41 - i) * interval '6 minutes');

    if exists (select 1 from auth.users where email = v_email)
       or exists (select 1 from public.users where email = v_email)
       or exists (select 1 from public.perfiles_cliente where dni = v_dni)
    then
      v_saltados := v_saltados + 1;
      continue;
    end if;

    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      -- GoTrue falla el login si estos quedan en null.
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated',
      'authenticated', v_email,
      extensions.crypt('Prueba2026!', extensions.gen_salt('bf')),
      v_cuando, '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, v_cuando, v_cuando,
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      v_cuando, v_cuando, v_cuando
    );

    insert into public.users (id, email, rol, estado, created_at)
    values (v_id, v_email, 'cliente', 'pendiente', v_cuando);

    insert into public.perfiles_cliente (
      user_id, nombres, apellidos, dni, telefono, direccion,
      codigo_promo, created_at
    ) values (
      v_id,
      v_nombres[i],
      v_apellidos[i],
      v_dni,
      '+519' || lpad((10000000 + i * 1373)::text, 8, '0'),
      v_calles[1 + (i % 10)] || ' ' || (100 + i * 17) || ', ' || v_distritos[1 + ((i * 3) % 10)],
      'DATOS_PRUEBA',
      v_cuando
    );

    v_creados := v_creados + 1;
  end loop;

  raise notice 'Clientes de prueba creados: %, ya existian: %', v_creados, v_saltados;
end $$;
