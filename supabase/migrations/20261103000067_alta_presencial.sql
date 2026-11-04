-- ============================================================
--  ALTA PRESENCIAL DE CLIENTES
--
--  En los locales, un gestor registra al cliente que viene en persona:
--  el mismo registro que la app o la web (correo confirmado con código,
--  contraseña, documentos aceptados, fotos de identidad), lo llena el
--  gestor con el cliente al lado y el documento en la mano.
--
--  El alta es del gestor que la hace, de principio a fin: el cliente
--  nunca entra a ninguna cola ni se le reparte a otro gestor.
--    - Durante los pasos solo existe su cuenta de acceso (correo
--      confirmado); no hay fila en users, ni perfil, ni tarjetas, así
--      que no aparece en Verificación ni en Tarjetas.
--    - Al terminar, registrar_cliente_presencial lo crea todo de una vez
--      (cliente activo, perfil validado, tarjetas aprobadas, cuentas),
--      asignado al gestor. Si algo falla, no queda nada a medias.
--
--  Quién lo hizo y cuándo queda en el perfil (origen, registrado_por) y
--  en la auditoría.
-- ============================================================

alter table public.perfiles_cliente
  add column if not exists origen          text,
  add column if not exists registrado_por  uuid references public.users(id);

alter table public.perfiles_cliente drop constraint if exists perfiles_origen_valido;
alter table public.perfiles_cliente
  add constraint perfiles_origen_valido check (origen is null or origen in ('app', 'web', 'presencial'));

-- La versión anterior de este archivo (nunca aplicada) tenía esta función.
drop function if exists public.activar_alta_presencial(uuid);


-- ------------------------------------------------------------
-- 1) ¿Se puede registrar ese correo?
--      libre      nadie lo usa
--      a_medias   tiene acceso confirmado pero nunca terminó el registro
--                 (un alta que quedó a la mitad): se puede retomar
--      cliente    ya es cliente: búscalo en Clientes
--      equipo     es una cuenta del equipo
-- ------------------------------------------------------------
create or replace function public.estado_correo_alta(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id    uuid;
  v_rol   text;
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo.' using errcode = '42501';
  end if;
  select u.id into v_id from auth.users u
   where lower(u.email) = v_email and u.email_confirmed_at is not null
   limit 1;
  if v_id is null then
    return 'libre';
  end if;
  select rol::text into v_rol from public.users where id = v_id;
  if v_rol is null then
    return 'a_medias';
  end if;
  return case when v_rol = 'cliente' then 'cliente' else 'equipo' end;
end;
$$;

revoke all on function public.estado_correo_alta(text) from public, anon;
grant execute on function public.estado_correo_alta(text) to authenticated;


-- ------------------------------------------------------------
-- 2) Registrar al cliente, todo junto y ya activo
--
--  p_datos: { tipo_documento, dni, nombres, apellidos, telefono,
--             direccion, acepta_promociones,
--             foto_dni_frontal, foto_dni_posterior, foto_selfie }
--  p_tarjetas: [{ banco, ultimos_4, nombre_impreso, foto_tarjeta, foto_reverso }]
--  p_cuentas:  [{ banco, tipo, numero_cuenta }]
--
--  Las fotos ya están subidas por la sesión del cliente, en su carpeta.
-- ------------------------------------------------------------
create or replace function public.registrar_cliente_presencial(
  p_user     uuid,
  p_datos    jsonb,
  p_tarjetas jsonb default '[]'::jsonb,
  p_cuentas  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo         uuid := auth.uid();
  v_email      text;
  v_confirmado timestamptz;
  v_tipo       text := coalesce(p_datos->>'tipo_documento', 'dni');
  v_dni        text := trim(coalesce(p_datos->>'dni', ''));
  v_nombres    text := trim(coalesce(p_datos->>'nombres', ''));
  v_apellidos  text := trim(coalesce(p_datos->>'apellidos', ''));
  v_telefono   text := trim(coalesce(p_datos->>'telefono', ''));
  v_direccion  text := trim(coalesce(p_datos->>'direccion', ''));
  v_carpeta    text := p_user::text || '/';
  v_perfil     uuid;
  t            jsonb;
  c            jsonb;
  v_numero     text;
  v_nt         int := 0;
  v_nc         int := 0;
begin
  if not public.es_staff() or public.es_servicio() then
    raise exception 'Solo el equipo puede registrar clientes en persona.' using errcode = '42501';
  end if;

  -- La cuenta de acceso: creada y confirmada hoy, sin registro todavía.
  select email, email_confirmed_at into v_email, v_confirmado from auth.users where id = p_user;
  if v_email is null then
    raise exception 'No encontramos la cuenta del cliente. Vuelve a enviar el código.' using errcode = 'P0001';
  end if;
  if v_confirmado is null then
    raise exception 'El correo del cliente todavía no está confirmado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.users where id = p_user) then
    raise exception 'Ese correo ya tiene un registro. Búscalo en Clientes.' using errcode = 'P0001';
  end if;

  -- Datos
  if v_tipo not in ('dni', 'ce') then
    raise exception 'Tipo de documento no válido.' using errcode = 'P0001';
  end if;
  if (v_tipo = 'dni' and v_dni !~ '^\d{8}$') or (v_tipo = 'ce' and v_dni !~ '^\d{9}$') then
    raise exception 'El número de documento no es válido.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perfiles_cliente where dni = v_dni) then
    raise exception 'Ese documento ya está registrado en otra cuenta.' using errcode = 'P0001';
  end if;
  if length(v_nombres) < 2 or length(v_nombres) > 60 or length(v_apellidos) < 2 or length(v_apellidos) > 60 then
    raise exception 'Revisa los nombres y apellidos.' using errcode = 'P0001';
  end if;
  if v_telefono !~ '^\+519\d{8}$' then
    raise exception 'El celular debe tener 9 dígitos y empezar con 9.' using errcode = 'P0001';
  end if;
  if length(v_direccion) < 5 then
    raise exception 'Falta la dirección.' using errcode = 'P0001';
  end if;

  -- Fotos de identidad: en la carpeta del cliente y ya subidas.
  if exists (
    select 1 from unnest(array[p_datos->>'foto_dni_frontal', p_datos->>'foto_dni_posterior', p_datos->>'foto_selfie']) f
     where f is null or left(f, length(v_carpeta)) <> v_carpeta
        or not exists (select 1 from storage.objects o where o.bucket_id = 'kyc-documentos' and o.name = f)
  ) then
    raise exception 'Faltan las fotos de identidad. Vuelve a pulsar «Activar cliente».' using errcode = 'P0001';
  end if;

  -- Cliente: activo de una vez y asignado a quien lo registra (así el
  -- reparto automático no lo toca).
  insert into public.users (id, email, rol, estado, asignado_a, asignado_en)
  values (p_user, lower(v_email), 'cliente', 'activo', v_yo, now());

  insert into public.perfiles_cliente (
    user_id, nombres, apellidos, tipo_documento, dni, telefono, direccion,
    acepta_promociones, promociones_actualizado_en,
    foto_dni_frontal, foto_dni_posterior, foto_selfie,
    validado_por, fecha_validacion, origen, registrado_por)
  values (
    p_user, v_nombres, v_apellidos, v_tipo, v_dni, v_telefono, v_direccion,
    coalesce((p_datos->>'acepta_promociones')::boolean, false), now(),
    p_datos->>'foto_dni_frontal', p_datos->>'foto_dni_posterior', p_datos->>'foto_selfie',
    v_yo, now(), 'presencial', v_yo)
  returning id into v_perfil;

  -- Tarjetas: el gestor las vio en mano, quedan verificadas.
  for t in select * from jsonb_array_elements(coalesce(p_tarjetas, '[]'::jsonb)) loop
    if (t->>'banco') not in ('BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif', 'CMR', 'iO', 'Otros') then
      raise exception 'Banco de tarjeta no válido: %.', coalesce(t->>'banco', '(vacío)') using errcode = 'P0001';
    end if;
    if coalesce(t->>'ultimos_4', '') !~ '^\d{4}$' then
      raise exception 'Revisa los últimos 4 dígitos de la tarjeta %.', t->>'banco' using errcode = 'P0001';
    end if;
    if length(trim(coalesce(t->>'nombre_impreso', ''))) < 3 then
      raise exception 'Falta el nombre impreso de la tarjeta %.', t->>'banco' using errcode = 'P0001';
    end if;
    if t->>'foto_tarjeta' is null or left(t->>'foto_tarjeta', length(v_carpeta)) <> v_carpeta
       or not exists (select 1 from storage.objects o where o.bucket_id = 'tarjetas-fotos' and o.name = t->>'foto_tarjeta')
       or (t->>'foto_reverso' is not null and (left(t->>'foto_reverso', length(v_carpeta)) <> v_carpeta
           or not exists (select 1 from storage.objects o where o.bucket_id = 'tarjetas-fotos' and o.name = t->>'foto_reverso'))) then
      raise exception 'Falta la foto de la tarjeta % •••• %.', t->>'banco', t->>'ultimos_4' using errcode = 'P0001';
    end if;

    insert into public.tarjetas (
      cliente_id, banco, ultimos_4, nombre_impreso, foto_tarjeta, foto_reverso,
      estado, activa, revisado_por, fecha_revision, asignado_a, asignado_en)
    values (
      v_perfil, t->>'banco', t->>'ultimos_4', upper(trim(t->>'nombre_impreso')),
      t->>'foto_tarjeta', t->>'foto_reverso',
      'aprobado', true, v_yo, now(), v_yo, now());
    v_nt := v_nt + 1;
  end loop;

  -- Cuentas: solo del cliente; la regla de dígitos es la de siempre.
  for c in select * from jsonb_array_elements(coalesce(p_cuentas, '[]'::jsonb)) loop
    v_numero := regexp_replace(coalesce(c->>'numero_cuenta', ''), '\D', '', 'g');
    if (c->>'banco') not in ('BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif') then
      raise exception 'Banco de cuenta no válido: %.', coalesce(c->>'banco', '(vacío)') using errcode = 'P0001';
    end if;
    if (c->>'tipo') not in ('ahorros', 'interbancaria') then
      raise exception 'Tipo de cuenta no válido.' using errcode = 'P0001';
    end if;
    if (c->>'tipo') = 'interbancaria' and v_numero !~ '^\d{20}$' then
      raise exception 'El CCI % debe tener 20 dígitos.', c->>'banco' using errcode = 'P0001';
    end if;
    if (c->>'tipo') = 'ahorros' and v_numero !~ '^\d{10,20}$' then
      raise exception 'La cuenta % debe tener entre 10 y 20 dígitos.', c->>'banco' using errcode = 'P0001';
    end if;

    insert into public.cuentas_bancarias (cliente_id, banco, tipo, numero_cuenta, activa)
    values (v_perfil, c->>'banco', c->>'tipo', v_numero, true);
    v_nc := v_nc + 1;
  end loop;

  insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
  values (p_user, 'kyc_aprobado', 'Tu cuenta está lista',
          'Te registramos en nuestro local. Ya puedes ingresar a la app o la web con tu correo y enviar tus solicitudes.');

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (v_yo, 'ALTA_PRESENCIAL', 'perfiles_cliente', v_perfil,
          jsonb_build_object('user_id', p_user, 'dni', v_dni, 'tarjetas', v_nt, 'cuentas', v_nc));

  return jsonb_build_object('ok', true, 'cliente', v_perfil, 'tarjetas', v_nt, 'cuentas', v_nc);
end;
$$;

revoke all on function public.registrar_cliente_presencial(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_cliente_presencial(uuid, jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
