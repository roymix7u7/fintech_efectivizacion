-- ============================================================
--  AVISOS EN VIVO Y FECHA DE DEPÓSITO EN LA NOTIFICACIÓN
--
--  1) La campana se actualiza al instante. La tabla notificaciones no
--     estaba en realtime: la web ya escuchaba sus cambios pero nunca le
--     llegaba nada, y el app solo la volvía a contar al cambiar de
--     pantalla o al volver al frente. Cada cliente recibe solo sus
--     avisos (la política notificaciones_lectura se aplica también en
--     realtime).
--
--  2) "Solicitud aprobada" sale con la fecha de depósito. La fecha se
--     agregaba después (tr_solicitudes_aviso_fecha, migración 65), pero
--     la notificación al teléfono se envía al guardarse el aviso, así
--     que llegaba "Pronto recibirás el pago" sin fecha. La fecha ya se
--     fija al crear la solicitud, así que resolver_caso escribe el aviso
--     completo de una vez y el trigger que lo corregía ya no hace falta.
-- ============================================================

-- 1) Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones'
  ) then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end $$;


-- 2) El aviso de aprobación ya trae la fecha
drop trigger if exists tr_solicitudes_aviso_fecha on public.solicitudes;
drop function if exists public.solicitudes_aviso_fecha();

create or replace function public.resolver_caso(p_tipo text, p_id uuid, p_aprobar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo      uuid := auth.uid();
  v_vence   timestamptz := now() - (public.reserva_minutos() || ' minutes')::interval;
  v_estado  text;
  v_quien   uuid;
  v_desde   timestamptz;
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
  v_cliente uuid;
  v_user    uuid;
  v_codigo  text;
  v_reviso  uuid;
  v_fecha   date;
  v_modalidad text;
begin
  -- Resolver es del gestor; el supervisor solo mira. El admin puede,
  -- como salida de emergencia.
  if not public.puede_resolver() then
    raise exception 'Un supervisor puede ver la cola, pero resolver es del gestor.'
      using errcode = '42501';
  end if;
  if not p_aprobar and (v_motivo is null or length(v_motivo) < 10) then
    raise exception 'Escribe el motivo del rechazo (al menos 10 letras).' using errcode = 'P0001';
  end if;

  -- Se bloquea la fila antes de mirarla: si dos llegan a la vez, la
  -- segunda espera aqui y encuentra el caso ya resuelto.
  if p_tipo = 'solicitud' then
    select estado, asignado_a, asignado_en, cliente_id, codigo, revisado_por, fecha_deposito, modalidad
      into v_estado, v_quien, v_desde, v_cliente, v_codigo, v_reviso, v_fecha, v_modalidad
      from public.solicitudes where id = p_id for update;
  elsif p_tipo = 'tarjeta' then
    select estado, asignado_a, asignado_en, cliente_id, revisado_por
      into v_estado, v_quien, v_desde, v_cliente, v_reviso
      from public.tarjetas where id = p_id for update;
  elsif p_tipo = 'kyc' then
    select u.estado::text, u.asignado_a, u.asignado_en, p.validado_por
      into v_estado, v_quien, v_desde, v_reviso
      from public.users u
      left join public.perfiles_cliente p on p.user_id = u.id
      where u.id = p_id for update of u;
    v_user := p_id;
  else
    raise exception 'Tipo no valido: %', p_tipo;
  end if;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'motivo', 'NO_EXISTE');
  end if;

  if p_tipo = 'kyc' then
    if v_estado not in ('pendiente', 'observado') then
      return jsonb_build_object('ok', false, 'motivo', 'RESUELTO', 'estado', v_estado,
        'quien', (select email from public.users where id = v_reviso));
    end if;
  elsif v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'RESUELTO', 'estado', v_estado,
      'quien', (select email from public.users where id = v_reviso));
  end if;

  -- El caso es de otro y su reserva sigue viva.
  if v_quien is not null and v_quien <> v_yo and v_desde > v_vence then
    return jsonb_build_object(
      'ok', false, 'motivo', 'TOMADO',
      'quien', (select email from public.users where id = v_quien),
      -- Minutos que faltan para que vuelva a la bolsa.
      'libre_en', ceil(extract(epoch from (v_desde - v_vence)) / 60)
    );
  end if;

  if p_tipo = 'solicitud' then
    update public.solicitudes
       set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
           motivo_rechazo = case when p_aprobar then null else v_motivo end,
           revisado_por = v_yo,
           fecha_revision = now(),
           asignado_a = v_yo,
           asignado_en = now()
     where id = p_id;

    select user_id into v_user from public.perfiles_cliente where id = v_cliente;
    if v_user is not null then
      -- Aprobada: dice cuándo se deposita (una fecha ya pasada se
      -- deposita hoy, y entonces no se dice "como elegiste"). Las
      -- solicitudes sin fecha mantienen el texto de siempre.
      insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
      values (v_user,
              case when p_aprobar then 'solicitud_aprobada' else 'solicitud_rechazada' end,
              case when p_aprobar then 'Solicitud aprobada' else 'Solicitud rechazada' end,
              case
                when not p_aprobar then
                  'Tu solicitud ' || v_codigo || ' fue rechazada: ' || v_motivo
                when v_fecha is null then
                  'Tu solicitud ' || v_codigo || ' fue aprobada. Pronto recibirás el pago.'
                else
                  'Tu solicitud ' || v_codigo || ' fue aprobada. Te depositaremos '
                  || public.texto_fecha_deposito(greatest(v_fecha, public.hoy_lima()))
                  || case when v_modalidad = 'siguiente' and v_fecha > public.hoy_lima()
                          then ', como elegiste.' else '.' end
              end);
    end if;

  elsif p_tipo = 'tarjeta' then
    update public.tarjetas
       set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
           motivo_rechazo = case when p_aprobar then null else v_motivo end,
           revisado_por = v_yo,
           fecha_revision = now(),
           asignado_a = v_yo,
           asignado_en = now()
     where id = p_id;

    select user_id into v_user from public.perfiles_cliente where id = v_cliente;
    if v_user is not null then
      insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
      values (v_user,
              case when p_aprobar then 'tarjeta_aprobada' else 'tarjeta_rechazada' end,
              case when p_aprobar then 'Tarjeta verificada' else 'Tarjeta rechazada' end,
              case when p_aprobar
                   then 'Tu tarjeta quedó verificada. Ya puedes enviar comprobantes con ella.'
                   else 'Tu tarjeta fue rechazada: ' || v_motivo end);
    end if;

  else -- kyc
    if p_aprobar then
      update public.users set estado = 'activo', asignado_a = v_yo, asignado_en = now()
       where id = p_id;
      update public.perfiles_cliente
         set validado_por = v_yo, fecha_validacion = now(), motivo_observacion = null
       where user_id = p_id;
      insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
      values (p_id, 'kyc_aprobado', 'Cuenta verificada',
              'Tu identidad fue verificada. Ya puedes registrar tu tarjeta y operar.');
    else
      update public.users set estado = 'observado', asignado_a = v_yo, asignado_en = now()
       where id = p_id;
      update public.perfiles_cliente set motivo_observacion = v_motivo where user_id = p_id;
      insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
      values (p_id, 'kyc_observado', 'Revisa tus documentos',
              'Necesitamos que reenvíes tus documentos: ' || v_motivo);
    end if;
  end if;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (v_yo,
          upper(case when p_aprobar then 'APROBAR_' else 'RECHAZAR_' end || p_tipo),
          case p_tipo when 'kyc' then 'users' when 'tarjeta' then 'tarjetas' else 'solicitudes' end,
          p_id,
          jsonb_build_object('motivo', v_motivo));

  return jsonb_build_object('ok', true);
end;
$$;

notify pgrst, 'reload schema';
