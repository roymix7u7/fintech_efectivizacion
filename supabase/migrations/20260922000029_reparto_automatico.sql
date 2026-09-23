-- ============================================================
--  REPARTO AUTOMATICO Y CANDADO AL RESOLVER
--
--  Antes el trabajo estaba en una bolsa comun y cada gestor pedia
--  el siguiente. Ahora el caso va solo al gestor mas desocupado en
--  cuanto llega, y aparece en su pantalla sin que lo pida.
--
--  Si no lo atiende en 10 minutos, vuelve a la bolsa y cualquiera
--  que este libre puede tomarlo. Asi nadie retiene trabajo por
--  estar desconectado, y nadie se queda mirando una cola vacia
--  mientras otro acumula.
--
--  Ademas, resolver pasa por una funcion que comprueba quien tiene
--  el caso. Dos gestores sobre la misma fila ya no es posible: al
--  segundo la base le responde quien lo esta atendiendo, y el panel
--  se lo dice en pantalla en vez de pisar la decision del primero.
--
--  Las tarjetas las revisan tambien los gestores.
-- ============================================================


-- ------------------------------------------------------------
-- 1) La reserva baja a 10 minutos
-- ------------------------------------------------------------
create or replace function public.reserva_minutos()
returns integer language sql immutable as $$ select 10 $$;


-- ------------------------------------------------------------
-- 2) A quien le toca
--
--    Al gestor activo con menos casos en mano ahora mismo. Si
--    empatan, al que lleva mas tiempo sin recibir uno: con carga
--    pareja, el reparto termina siendo por turnos.
--
--    Solo gestores: supervisores y administradores revisan cuando
--    hace falta, pero no se les llena la bandeja sin pedirlo.
-- ------------------------------------------------------------
create or replace function public.gestor_menos_cargado()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with vence as (
    select now() - (public.reserva_minutos() || ' minutes')::interval as t
  ),
  gestores as (
    select id from public.users
     where rol = 'gestor' and estado = 'activo'
  ),
  carga as (
    select g.id,
           (select count(*) from public.solicitudes s, vence v
             where s.estado = 'pendiente' and s.asignado_a = g.id and s.asignado_en > v.t)
         + (select count(*) from public.tarjetas t, vence v
             where t.estado = 'pendiente' and t.activa = true
               and t.asignado_a = g.id and t.asignado_en > v.t)
         + (select count(*) from public.users u, vence v
             where u.rol = 'cliente' and u.estado = 'pendiente'
               and u.asignado_a = g.id and u.asignado_en > v.t) as casos,
           greatest(
             coalesce((select max(s.asignado_en) from public.solicitudes s where s.asignado_a = g.id), 'epoch'::timestamptz),
             coalesce((select max(t.asignado_en) from public.tarjetas t where t.asignado_a = g.id), 'epoch'::timestamptz),
             coalesce((select max(u.asignado_en) from public.users u where u.asignado_a = g.id), 'epoch'::timestamptz)
           ) as ultimo
    from gestores g
  )
  select id from carga order by casos asc, ultimo asc limit 1;
$$;


-- ------------------------------------------------------------
-- 3) Repartir en cuanto llega
--
--    Un disparador por cola. Si no hay ningun gestor activo, la
--    fila queda sin asignar y espera en la bolsa: es preferible a
--    perderla o a dejarla en manos de alguien bloqueado.
-- ------------------------------------------------------------
create or replace function public.repartir_caso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gestor uuid;
begin
  -- Solo al entrar en cola, y sin pisar una asignacion existente.
  if new.asignado_a is not null then
    return new;
  end if;

  v_gestor := public.gestor_menos_cargado();
  if v_gestor is null then
    return new;
  end if;

  new.asignado_a := v_gestor;
  new.asignado_en := now();
  return new;
end;
$$;

drop trigger if exists tr_repartir_solicitud on public.solicitudes;
create trigger tr_repartir_solicitud
  before insert on public.solicitudes
  for each row
  when (new.estado = 'pendiente')
  execute function public.repartir_caso();

drop trigger if exists tr_repartir_tarjeta on public.tarjetas;
create trigger tr_repartir_tarjeta
  before insert on public.tarjetas
  for each row
  when (new.estado = 'pendiente')
  execute function public.repartir_caso();

-- El KYC entra por dos caminos: al crearse el usuario y al volver
-- de "observado" a "pendiente" cuando el cliente reenvia sus
-- documentos. El segundo caso tiene que repartirse igual.
drop trigger if exists tr_repartir_kyc on public.users;
create trigger tr_repartir_kyc
  before insert on public.users
  for each row
  when (new.rol = 'cliente' and new.estado = 'pendiente')
  execute function public.repartir_caso();

create or replace function public.repartir_kyc_reenvio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gestor uuid;
begin
  if new.estado = 'pendiente' and old.estado is distinct from 'pendiente' then
    -- Se reasigna aunque ya tuviera dueno: quien lo observo puede
    -- estar de vacaciones, y el caso vuelve a empezar.
    v_gestor := public.gestor_menos_cargado();
    if v_gestor is not null then
      new.asignado_a := v_gestor;
      new.asignado_en := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_repartir_kyc_reenvio on public.users;
create trigger tr_repartir_kyc_reenvio
  before update on public.users
  for each row
  when (new.rol = 'cliente')
  execute function public.repartir_kyc_reenvio();


-- ------------------------------------------------------------
-- 4) Quien tiene un caso ahora
--    Devuelve null si esta libre, o el correo de quien lo tiene.
-- ------------------------------------------------------------
create or replace function public.quien_atiende(p_tipo text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quien uuid;
  v_desde timestamptz;
  v_vence timestamptz := now() - (public.reserva_minutos() || ' minutes')::interval;
begin
  if p_tipo = 'solicitud' then
    select asignado_a, asignado_en into v_quien, v_desde
      from public.solicitudes where id = p_id;
  elsif p_tipo = 'tarjeta' then
    select asignado_a, asignado_en into v_quien, v_desde
      from public.tarjetas where id = p_id;
  elsif p_tipo = 'kyc' then
    select asignado_a, asignado_en into v_quien, v_desde
      from public.users where id = p_id;
  else
    raise exception 'Tipo no valido: %', p_tipo;
  end if;

  if v_quien is null or v_quien = auth.uid() or v_desde <= v_vence then
    return null;
  end if;
  return (select email from public.users where id = v_quien);
end;
$$;


-- ------------------------------------------------------------
-- 5) Resolver con candado
--
--    Una sola puerta para aprobar o rechazar. Comprueba, en la
--    misma transaccion:
--      · que el caso siga pendiente (nadie lo resolvio antes),
--      · que lo tenga quien lo esta resolviendo, o este libre.
--
--    Si falla, devuelve el codigo TOMADO o RESUELTO y el correo de
--    quien lo tiene, para que el panel pueda decirlo con nombre.
-- ------------------------------------------------------------
create or replace function public.resolver_caso(
  p_tipo    text,
  p_id      uuid,
  p_aprobar boolean,
  p_motivo  text default null
)
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
begin
  if not public.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not p_aprobar and (v_motivo is null or length(v_motivo) < 10) then
    raise exception 'Escribe el motivo del rechazo (al menos 10 letras).' using errcode = 'P0001';
  end if;

  -- Se bloquea la fila antes de mirarla: si dos llegan a la vez, la
  -- segunda espera aqui y encuentra el caso ya resuelto.
  if p_tipo = 'solicitud' then
    select estado, asignado_a, asignado_en, cliente_id, codigo
      into v_estado, v_quien, v_desde, v_cliente, v_codigo
      from public.solicitudes where id = p_id for update;
  elsif p_tipo = 'tarjeta' then
    select estado, asignado_a, asignado_en, cliente_id
      into v_estado, v_quien, v_desde, v_cliente
      from public.tarjetas where id = p_id for update;
  elsif p_tipo = 'kyc' then
    select estado::text, asignado_a, asignado_en
      into v_estado, v_quien, v_desde
      from public.users where id = p_id for update;
    v_user := p_id;
  else
    raise exception 'Tipo no valido: %', p_tipo;
  end if;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'motivo', 'NO_EXISTE');
  end if;

  if p_tipo = 'kyc' then
    if v_estado not in ('pendiente', 'observado') then
      return jsonb_build_object('ok', false, 'motivo', 'RESUELTO', 'estado', v_estado);
    end if;
  elsif v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'RESUELTO', 'estado', v_estado);
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
      insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
      values (v_user,
              case when p_aprobar then 'solicitud_aprobada' else 'solicitud_rechazada' end,
              case when p_aprobar then 'Solicitud aprobada' else 'Solicitud rechazada' end,
              case when p_aprobar
                   then 'Tu solicitud ' || v_codigo || ' fue aprobada. Pronto recibirás el pago.'
                   else 'Tu solicitud ' || v_codigo || ' fue rechazada: ' || v_motivo end);
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


-- ------------------------------------------------------------
-- 6) Mis casos asignados
--    Lo que el gestor tiene ahora en su bandeja, ya repartido.
-- ------------------------------------------------------------
create or replace function public.mis_casos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (select now() - (public.reserva_minutos() || ' minutes')::interval as vence)
  select jsonb_build_object(
    'solicitudes', (select count(*) from public.solicitudes s, v
                     where s.estado = 'pendiente' and s.asignado_a = auth.uid()
                       and s.asignado_en > v.vence),
    'tarjetas', (select count(*) from public.tarjetas t, v
                  where t.estado = 'pendiente' and t.activa = true
                    and t.asignado_a = auth.uid() and t.asignado_en > v.vence),
    'kyc', (select count(*) from public.users u, v
             where u.rol = 'cliente' and u.estado = 'pendiente'
               and u.asignado_a = auth.uid() and u.asignado_en > v.vence)
  );
$$;


-- ------------------------------------------------------------
-- 7) Pagos: las marcas ya no caducan
--
--    Revisar una foto lleva minutos; hacer transferencias, lo que
--    haga falta. Que una marca venciera a mitad de una tanda
--    obligaba a marcar de nuevo lo ya pagado. Ahora lo marcado
--    queda hasta que se confirme o se quite a mano.
--
--    El plazo se deja en un ano en vez de en cero porque las otras
--    funciones de pagos comparan "marcada_en > ahora menos el
--    plazo": con cero, ninguna marca se veria nunca.
-- ------------------------------------------------------------
create or replace function public.pagos_reserva_minutos()
returns integer language sql immutable as $$ select 525600 $$;

create or replace function public.pagos_marcar(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_hechas uuid[];
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with candidatas as (
    select id from public.solicitudes
     where id = any(p_ids)
       and estado = 'aprobado'
       and (v_admin or banco = any(v_mis))
       -- Sin caducidad: solo se puede tomar lo libre o lo propio.
       and (marcada_por is null or marcada_por = v_yo)
     for update skip locked
  ),
  hechas as (
    update public.solicitudes s
       set marcada_por = v_yo, marcada_en = now()
      from candidatas c
     where s.id = c.id
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_hechas from hechas;

  return jsonb_build_object(
    'marcadas',   to_jsonb(v_hechas),
    'rechazadas', to_jsonb(array(select unnest(p_ids) except select unnest(v_hechas)))
  );
end;
$$;


-- ------------------------------------------------------------
-- 8) Permisos
-- ------------------------------------------------------------
grant execute on function public.gestor_menos_cargado() to authenticated;
grant execute on function public.quien_atiende(text, uuid) to authenticated;
grant execute on function public.resolver_caso(text, uuid, boolean, text) to authenticated;
grant execute on function public.mis_casos() to authenticated;

revoke execute on function public.gestor_menos_cargado() from anon;
revoke execute on function public.quien_atiende(text, uuid) from anon;
revoke execute on function public.resolver_caso(text, uuid, boolean, text) from anon;
revoke execute on function public.mis_casos() from anon;

notify pgrst, 'reload schema';
