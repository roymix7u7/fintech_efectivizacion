-- ============================================================
--  MIS DATOS: DESCARGA Y ELIMINACIÓN DE CUENTA
--
--  Ley 29733 (derechos del titular) y las tiendas: Google Play y la
--  App Store exigen que la cuenta se pueda eliminar desde la app.
--
--  Descargar: mis_datos() junta todo lo que hay del cliente, al
--    instante, sin pasar por nadie.
--  Eliminar: el cliente lo pide (solicitar_eliminacion) y el equipo lo
--    ejecuta desde el panel, porque antes hay que cerrar lo que esté
--    en curso (una solicitud aprobada que falta pagar). Eliminar es:
--      - borrar las fotos del documento, la selfie y las tarjetas
--        (eso lo hace la función eliminar-cuenta: la base no puede
--        borrar archivos),
--      - anonimizar los datos personales (anonimizar_cliente),
--      - quitar el acceso (se borra el usuario de Auth).
--    Se CONSERVAN el registro de operaciones, sus comprobantes y las
--    constancias de consentimiento: la prevención del lavado de
--    activos obliga a guardar las operaciones por años. Así se le
--    explica al cliente antes de pedirlo.
-- ============================================================

-- Días hábiles (lunes a viernes; los feriados no se descuentan).
create or replace function public.sumar_dias_habiles(p_desde timestamptz, p_dias int)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v timestamptz := p_desde;
  n int := 0;
begin
  while n < p_dias loop
    v := v + interval '1 day';
    if extract(isodow from v) < 6 then
      n := n + 1;
    end if;
  end loop;
  return v;
end;
$$;

create table if not exists public.solicitudes_datos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id),
  tipo          text not null default 'eliminacion' check (tipo in ('eliminacion')),
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'en_proceso', 'completada', 'rechazada', 'cancelada')),
  motivo        text check (motivo is null or length(motivo) <= 500),
  respuesta     text check (respuesta is null or length(respuesta) <= 500),
  creada_en     timestamptz not null default now(),
  -- Plazo de respuesta: 10 días hábiles. [Confirmar con asesoría legal.]
  vence_en      timestamptz not null default public.sumar_dias_habiles(now(), 10),
  atendida_por  uuid references public.users(id),
  atendida_en   timestamptz
);

-- Una sola solicitud abierta por persona.
create unique index if not exists solicitudes_datos_una_abierta
  on public.solicitudes_datos (user_id, tipo) where estado in ('pendiente', 'en_proceso');

alter table public.solicitudes_datos enable row level security;

drop policy if exists solicitudes_datos_lectura on public.solicitudes_datos;
create policy solicitudes_datos_lectura on public.solicitudes_datos
  for select to authenticated using (user_id = auth.uid() or public.es_admin() or public.es_supervisor());

-- Sin políticas de escritura: todo pasa por las funciones de abajo.
grant select on public.solicitudes_datos to authenticated;

-- ── El cliente pide eliminar su cuenta ──
create or replace function public.solicitar_eliminacion(p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_rol text;
  v_fila public.solicitudes_datos;
begin
  select rol::text into v_rol from public.users where id = v_yo;
  if v_rol is distinct from 'cliente' then
    raise exception 'Solo un cliente puede pedir eliminar su cuenta desde la app.' using errcode = '42501';
  end if;

  select * into v_fila from public.solicitudes_datos
  where user_id = v_yo and tipo = 'eliminacion' and estado in ('pendiente', 'en_proceso');
  if found then
    return jsonb_build_object('ok', false, 'motivo', 'YA_PEDIDA', 'vence_en', v_fila.vence_en);
  end if;

  insert into public.solicitudes_datos (user_id, motivo)
  values (v_yo, nullif(trim(coalesce(p_motivo, '')), ''))
  returning * into v_fila;

  insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
  values (v_yo, 'cuenta', 'Recibimos tu pedido de eliminar tu cuenta',
          format('Te responderemos a más tardar el %s. Puedes cancelarlo desde Mi cuenta > Mis datos mientras tanto.',
                 to_char(v_fila.vence_en at time zone 'America/Lima', 'DD/MM/YYYY')));

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (v_yo, 'PEDIR_ELIMINACION', 'solicitudes_datos', v_fila.id, jsonb_build_object('vence_en', v_fila.vence_en));

  return jsonb_build_object('ok', true, 'id', v_fila.id, 'vence_en', v_fila.vence_en);
end;
$$;

-- ── El cliente se arrepiente (solo mientras nadie la atiende) ──
create or replace function public.cancelar_eliminacion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.solicitudes_datos
  set estado = 'cancelada', atendida_en = now()
  where user_id = auth.uid() and tipo = 'eliminacion' and estado = 'pendiente'
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'NO_CANCELABLE');
  end if;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id)
  values (auth.uid(), 'CANCELAR_ELIMINACION', 'solicitudes_datos', v_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ── El equipo la toma o la rechaza (con respuesta para el cliente) ──
create or replace function public.atender_solicitud_datos(p_id uuid, p_estado text, p_respuesta text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.solicitudes_datos;
  v_resp text := nullif(trim(coalesce(p_respuesta, '')), '');
begin
  if not public.es_admin() then
    raise exception 'Atender estas solicitudes es del administrador.' using errcode = '42501';
  end if;
  if p_estado not in ('en_proceso', 'rechazada') then
    raise exception 'Estado no válido.' using errcode = 'P0001';
  end if;
  if p_estado = 'rechazada' and (v_resp is null or length(v_resp) < 10) then
    raise exception 'Explica al cliente por qué (al menos 10 letras).' using errcode = 'P0001';
  end if;

  update public.solicitudes_datos
  set estado = p_estado,
      respuesta = coalesce(v_resp, respuesta),
      atendida_por = auth.uid(),
      atendida_en = case when p_estado = 'rechazada' then now() else atendida_en end
  where id = p_id and estado in ('pendiente', 'en_proceso')
  returning * into v;

  if v.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'YA_CERRADA');
  end if;

  insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
  values (v.user_id, 'cuenta',
          case when p_estado = 'rechazada' then 'No pudimos eliminar tu cuenta todavía'
               else 'Estamos eliminando tu cuenta' end,
          coalesce(v_resp, 'Te avisaremos cuando terminemos.'));

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'ATENDER_SOLICITUD_DATOS', 'solicitudes_datos', v.id,
          jsonb_build_object('estado', p_estado, 'respuesta', v_resp));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Anonimizar (lo llama la función eliminar-cuenta, con la sesión del
--    administrador, después de borrar los archivos) ──
create or replace function public.anonimizar_cliente(p_solicitud uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.solicitudes_datos;
  v_perfil uuid;
  v_abiertas int;
begin
  if not public.es_admin() then
    raise exception 'Eliminar cuentas es del administrador.' using errcode = '42501';
  end if;

  select * into v from public.solicitudes_datos where id = p_solicitud for update;
  if v.id is null then
    raise exception 'Esa solicitud no existe.' using errcode = 'P0001';
  end if;
  if v.estado = 'completada' then
    return jsonb_build_object('ok', true, 'motivo', 'YA_COMPLETADA');
  end if;
  if v.estado not in ('pendiente', 'en_proceso') then
    raise exception 'La solicitud está %, no se puede ejecutar.', v.estado using errcode = 'P0001';
  end if;

  select id into v_perfil from public.perfiles_cliente where user_id = v.user_id;

  -- Lo que está en curso se termina antes: no se deja a nadie sin pagar.
  select count(*) into v_abiertas from public.solicitudes
  where cliente_id = v_perfil and estado in ('pendiente', 'aprobado');
  if v_abiertas > 0 then
    raise exception 'Tiene % solicitud(es) en curso. Resuélvelas antes de eliminar la cuenta.', v_abiertas
      using errcode = 'P0001';
  end if;

  if v_perfil is not null then
    update public.perfiles_cliente set
      nombres = 'Cuenta',
      apellidos = 'eliminada',
      tipo_documento = 'dni',
      dni = '00000000',
      telefono = null,
      direccion = null,
      codigo_promo = null,
      foto_dni_frontal = null,
      foto_dni_posterior = null,
      foto_selfie = null,
      motivo_observacion = null,
      motivo_bloqueo = 'Cuenta eliminada a pedido del titular',
      bloqueado_por = auth.uid(),
      bloqueado_en = now()
    where id = v_perfil;

    -- Las tarjetas y cuentas quedan solo como referencia de operaciones
    -- pasadas: sin fotos, sin nombre y dadas de baja.
    update public.tarjetas set foto_tarjeta = null, foto_reverso = null, nombre_impreso = null, activa = false
    where cliente_id = v_perfil;
    update public.cuentas_bancarias set activa = false where cliente_id = v_perfil;
    delete from public.comisiones_cliente where cliente_id = v_perfil;
  end if;

  -- El correo es único: se reemplaza para que la persona pueda volver
  -- a registrarse si quiere.
  update public.users
  set estado = 'bloqueado', email = 'eliminado+' || v.user_id::text || '@altoqueperu.invalid'
  where id = v.user_id;

  delete from public.notificaciones where user_id = v.user_id;
  delete from public.push_tokens where user_id = v.user_id;
  delete from public.alertas_vistas where user_id = v.user_id;

  update public.solicitudes_datos
  set estado = 'completada', atendida_por = auth.uid(), atendida_en = now()
  where id = v.id;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'ELIMINAR_CUENTA', 'solicitudes_datos', v.id,
          jsonb_build_object('cliente', v.user_id, 'perfil', v_perfil));

  return jsonb_build_object('ok', true, 'user_id', v.user_id);
end;
$$;

-- ── Todo lo que hay del cliente, para descargarlo ──
create or replace function public.mis_datos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (select * from public.perfiles_cliente where user_id = auth.uid())
  select jsonb_build_object(
    'generado_en', now(),
    'cuenta', (select jsonb_build_object('correo', u.email, 'estado', u.estado, 'creada_en', u.created_at)
               from public.users u where u.id = auth.uid()),
    'perfil', (select jsonb_build_object(
                 'nombres', p.nombres, 'apellidos', p.apellidos, 'tipo_documento', p.tipo_documento,
                 'documento', p.dni, 'celular', p.telefono, 'direccion', p.direccion,
                 'codigo_promocional', p.codigo_promo, 'verificado_el', p.fecha_validacion,
                 'fotos_guardadas', jsonb_build_object(
                   'documento_frente', p.foto_dni_frontal is not null,
                   'documento_reverso', p.foto_dni_posterior is not null,
                   'selfie', p.foto_selfie is not null))
               from p),
    'tarjetas', coalesce((select jsonb_agg(jsonb_build_object(
                  'banco', t.banco, 'ultimos_4', t.ultimos_4, 'nombre_impreso', t.nombre_impreso,
                  'estado', t.estado, 'activa', t.activa, 'registrada_el', t.created_at,
                  'con_foto', t.foto_tarjeta is not null) order by t.created_at)
                from public.tarjetas t join p on t.cliente_id = p.id), '[]'::jsonb),
    'cuentas', coalesce((select jsonb_agg(jsonb_build_object(
                  'banco', c.banco, 'tipo', c.tipo, 'numero', c.numero_cuenta, 'activa', c.activa,
                  'registrada_el', c.created_at) order by c.created_at)
                from public.cuentas_bancarias c join p on c.cliente_id = p.id), '[]'::jsonb),
    'solicitudes', coalesce((select jsonb_agg(jsonb_build_object(
                  'codigo', s.codigo, 'banco', s.banco, 'estado', s.estado, 'nota', s.nota_cliente,
                  'motivo_rechazo', s.motivo_rechazo, 'enviada_el', s.created_at,
                  'revisada_el', s.fecha_revision, 'pagada_el', s.pagado_en) order by s.created_at)
                from public.solicitudes s join p on s.cliente_id = p.id), '[]'::jsonb),
    'comisiones', public.mis_comisiones(),
    'consentimientos', coalesce((select jsonb_agg(jsonb_build_object(
                  'documento', c.tipo, 'version', c.version, 'aceptado_el', c.aceptado_en) order by c.aceptado_en)
                from public.consentimientos c where c.user_id = auth.uid()), '[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(jsonb_build_object(
                  'titulo', n.titulo, 'mensaje', n.cuerpo, 'fecha', n.created_at) order by n.created_at)
                from public.notificaciones n where n.user_id = auth.uid()), '[]'::jsonb),
    'pedidos_de_eliminacion', coalesce((select jsonb_agg(jsonb_build_object(
                  'estado', d.estado, 'pedido_el', d.creada_en, 'respuesta', d.respuesta) order by d.creada_en)
                from public.solicitudes_datos d where d.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

revoke all on function public.solicitar_eliminacion(text) from public, anon;
revoke all on function public.cancelar_eliminacion() from public, anon;
revoke all on function public.atender_solicitud_datos(uuid, text, text) from public, anon;
revoke all on function public.anonimizar_cliente(uuid) from public, anon;
revoke all on function public.mis_datos() from public, anon;
grant execute on function public.solicitar_eliminacion(text) to authenticated;
grant execute on function public.cancelar_eliminacion() to authenticated;
grant execute on function public.atender_solicitud_datos(uuid, text, text) to authenticated;
grant execute on function public.anonimizar_cliente(uuid) to authenticated;
grant execute on function public.mis_datos() to authenticated;
