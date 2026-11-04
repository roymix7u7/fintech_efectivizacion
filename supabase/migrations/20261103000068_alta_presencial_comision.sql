-- ============================================================
--  ALTA PRESENCIAL: COMISIÓN DEL CLIENTE
--
--  Al registrar al cliente en el local, el gestor elige con qué tarifa
--  empieza: la tarifa estándar (lo normal) o uno de los cupones activos.
--  El cupón rige desde ese momento por los días que define el cupón
--  (o sin vencimiento si el cupón no tiene duración), igual que cuando
--  se asigna desde Clientes. La comisión especial por banco sigue
--  dándola administrador o supervisor desde Clientes.
-- ============================================================

drop function if exists public.registrar_cliente_presencial(uuid, jsonb, jsonb, jsonb);

create or replace function public.registrar_cliente_presencial(
  p_user     uuid,
  p_datos    jsonb,
  p_tarjetas jsonb default '[]'::jsonb,
  p_cuentas  jsonb default '[]'::jsonb,
  p_cupon    uuid  default null
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
  v_bloque     uuid;
  v_desde      timestamptz;
  v_hasta      timestamptz;
  v_cupon      record;
  v_nombre_cupon text;
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

  -- Comisión: la tarifa estándar (sin cupón) o un cupón activo, con la
  -- vigencia que define el cupón.
  if p_cupon is not null then
    select id, nombre, es_default, activo, duracion_dias into v_cupon
      from public.bloques_comision where id = p_cupon;
    if v_cupon.id is null or not v_cupon.activo then
      raise exception 'Ese cupón no existe o ya no está activo.' using errcode = 'P0001';
    end if;
    if not v_cupon.es_default then
      v_bloque := v_cupon.id;
      v_nombre_cupon := v_cupon.nombre;
      v_desde := now();
      v_hasta := case when v_cupon.duracion_dias is null then null
                      else now() + make_interval(days => v_cupon.duracion_dias) end;
    end if;
  end if;

  -- Cliente: activo de una vez y asignado a quien lo registra (así el
  -- reparto automático no lo toca).
  insert into public.users (id, email, rol, estado, asignado_a, asignado_en)
  values (p_user, lower(v_email), 'cliente', 'activo', v_yo, now());

  insert into public.perfiles_cliente (
    user_id, nombres, apellidos, tipo_documento, dni, telefono, direccion,
    acepta_promociones, promociones_actualizado_en,
    foto_dni_frontal, foto_dni_posterior, foto_selfie,
    validado_por, fecha_validacion, origen, registrado_por,
    bloque_id, cupon_desde, cupon_hasta)
  values (
    p_user, v_nombres, v_apellidos, v_tipo, v_dni, v_telefono, v_direccion,
    coalesce((p_datos->>'acepta_promociones')::boolean, false), now(),
    p_datos->>'foto_dni_frontal', p_datos->>'foto_dni_posterior', p_datos->>'foto_selfie',
    v_yo, now(), 'presencial', v_yo,
    v_bloque, v_desde, v_hasta)
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
          jsonb_build_object('user_id', p_user, 'dni', v_dni, 'tarjetas', v_nt, 'cuentas', v_nc,
                             'cupon', coalesce(v_nombre_cupon, 'estándar'),
                             'cupon_hasta', v_hasta));

  return jsonb_build_object('ok', true, 'cliente', v_perfil, 'tarjetas', v_nt, 'cuentas', v_nc,
                            'cupon', v_nombre_cupon,
                            'cupon_hasta', v_hasta);
end;
$$;

revoke all on function public.registrar_cliente_presencial(uuid, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.registrar_cliente_presencial(uuid, jsonb, jsonb, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
