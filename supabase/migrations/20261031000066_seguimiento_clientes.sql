-- ============================================================
--  SEGUIMIENTO DE CLIENTES (POSVENTA) Y RECORDATORIOS
--
--  Muchos clientes se registran y no llegan a operar. Para recuperarlos:
--
--  1. Etapa de cada cliente, calculada al momento:
--       sin_verificar        su identidad aún no se aprueba
--       sin_tarjeta          verificado, sin tarjeta verificada ni en revisión
--       tarjeta_en_revision  su tarjeta la está revisando el equipo
--       sin_cuenta           tarjeta verificada, falta la cuenta donde depositarle
--       sin_operar           todo listo, nunca envió una solicitud
--       opera                envió una solicitud en los últimos 30 días
--       inactivo             operó alguna vez, pero no en los últimos 30 días
--       bloqueado
--
--  2. Clientes › Seguimiento: la lista por etapa para llamar o escribir,
--     con el registro de cada contacto (resultado, nota y cuándo volver
--     a llamar). La ven administrador, supervisor y pagos.
--
--  3. Recordatorios en la app y la web (campana + notificación push):
--     - a mano desde el panel, a uno o a varios;
--     - automáticos, de lunes a sábado a las 10 a. m. (Lima): a quien
--       está en sin_tarjeta, sin_cuenta o sin_operar, como máximo 3
--       veces y con 3 días entre uno y otro. A los inactivos, uno cada
--       30 días y solo si aceptó recibir novedades.
--     Nunca más de un recordatorio cada 3 días por cliente.
--
--  4. La ficha del cliente trae las fotos de sus tarjetas (al pedirlas,
--     como las de identidad) y pagos puede verlas.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Etapa del cliente
-- ------------------------------------------------------------
create or replace function public.etapa_cliente(p_cliente uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when u.estado::text = 'bloqueado' then 'bloqueado'
    when u.estado::text in ('pendiente', 'observado') then 'sin_verificar'
    when exists (select 1 from public.solicitudes s
                  where s.cliente_id = pc.id and s.estado <> 'rechazado') then
      case when (select max(s.created_at) from public.solicitudes s
                  where s.cliente_id = pc.id and s.estado <> 'rechazado') > now() - interval '30 days'
           then 'opera' else 'inactivo' end
    when not exists (select 1 from public.tarjetas t
                      where t.cliente_id = pc.id and t.activa and t.estado = 'aprobado') then
      case when exists (select 1 from public.tarjetas t
                         where t.cliente_id = pc.id and t.activa and t.estado = 'pendiente')
           then 'tarjeta_en_revision' else 'sin_tarjeta' end
    -- Alguna tarjeta verificada con dónde recibir (misma regla que al
    -- crear una solicitud: ahorros del mismo banco, o de cualquiera con
    -- CMR u otros).
    when not exists (
      select 1 from public.tarjetas t
        join public.cuentas_bancarias c on c.cliente_id = t.cliente_id
       where t.cliente_id = pc.id and t.activa and t.estado = 'aprobado'
         and c.activa and coalesce(c.tipo, 'ahorros') <> 'interbancaria'
         and (t.banco not in ('BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif') or c.banco = t.banco)
    ) then 'sin_cuenta'
    else 'sin_operar'
  end
  from public.perfiles_cliente pc
  join public.users u on u.id = pc.user_id
  where pc.id = p_cliente;
$$;

revoke all on function public.etapa_cliente(uuid) from public, anon;
grant execute on function public.etapa_cliente(uuid) to authenticated;


-- ------------------------------------------------------------
-- 2) Registro de contactos
-- ------------------------------------------------------------
create table if not exists public.seguimientos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.perfiles_cliente(id) on delete cascade,
  usuario_id  uuid references public.users(id),          -- null: recordatorio automático
  canal       text not null check (canal in ('llamada', 'whatsapp', 'recordatorio')),
  resultado   text not null check (resultado in (
                'interesado', 'no_interesado', 'no_contesto', 'numero_equivocado',
                'volver_a_llamar', 'enviado')),
  nota        text check (nota is null or length(nota) <= 500),
  etapa       text,
  volver_el   date,
  created_at  timestamptz not null default now()
);

create index if not exists seguimientos_cliente_idx on public.seguimientos (cliente_id, created_at desc);

-- Solo se lee y escribe por las funciones de abajo.
alter table public.seguimientos enable row level security;
revoke all on public.seguimientos from anon, authenticated;


-- ------------------------------------------------------------
-- 3) Lista de seguimiento por etapa
-- ------------------------------------------------------------
create or replace function public.clientes_seguimiento(
  p_etapa  text    default null,
  p_buscar text    default null,
  p_limite integer default 30,
  p_desde  integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_buscar  text := nullif(trim(coalesce(p_buscar, '')), '');
  v_hoy     date := (now() at time zone 'America/Lima')::date;
  v_resumen jsonb;
  v_filas   jsonb;
  v_total   bigint;
begin
  if not public.puede_ver_clientes() then
    raise exception 'Tu rol no puede ver clientes.' using errcode = '42501';
  end if;
  p_limite := least(greatest(coalesce(p_limite, 30), 1), 100);
  p_desde  := greatest(coalesce(p_desde, 0), 0);

  -- La etapa se calcula una sola vez por cliente y sirve para el
  -- resumen y para la lista.
  with base as materialized (
    select pc.*, public.etapa_cliente(pc.id) as etapa
      from public.perfiles_cliente pc
  ),
  pagina as (
    select jsonb_build_object(
             'id',                 pc.id,
             'nombres',            pc.nombres,
             'apellidos',          pc.apellidos,
             'tipo_documento',     pc.tipo_documento,
             'dni',                pc.dni,
             'telefono',           pc.telefono,
             'created_at',         pc.created_at,
             'fecha_validacion',   pc.fecha_validacion,
             'acepta_promociones', coalesce(pc.acepta_promociones, false),
             'etapa',              pc.etapa,
             'ultima_operacion',   (select max(s.created_at) from public.solicitudes s
                                     where s.cliente_id = pc.id and s.estado <> 'rechazado'),
             'operaciones',        (select count(*) from public.solicitudes s
                                     where s.cliente_id = pc.id and s.estado = 'pagado'),
             'tarjetas',           (select count(*) from public.tarjetas t
                                     where t.cliente_id = pc.id and t.activa and t.estado = 'aprobado'),
             'ultimo_contacto',    (select jsonb_build_object(
                                       'canal', g.canal, 'resultado', g.resultado, 'nota', g.nota,
                                       'en', g.created_at, 'volver_el', g.volver_el,
                                       'por', (select u.email from public.users u where u.id = g.usuario_id))
                                     from public.seguimientos g
                                    where g.cliente_id = pc.id and g.canal <> 'recordatorio'
                                    order by g.created_at desc limit 1),
             'ultimo_recordatorio', (select max(g.created_at) from public.seguimientos g
                                      where g.cliente_id = pc.id and g.canal = 'recordatorio'),
             'recordatorios',       (select count(*) from public.seguimientos g
                                      where g.cliente_id = pc.id and g.canal = 'recordatorio')
           ) as fila,
           row_number() over (
             order by
               -- Primero a quien toca volver a llamar hoy o antes.
               (select g.volver_el from public.seguimientos g
                 where g.cliente_id = pc.id and g.canal <> 'recordatorio'
                 order by g.created_at desc limit 1) <= v_hoy desc nulls last,
               -- Luego a quien nadie ha contactado.
               exists (select 1 from public.seguimientos g
                        where g.cliente_id = pc.id and g.canal <> 'recordatorio') asc,
               pc.created_at desc
           ) as orden,
           count(*) over () as total
      from base pc
     where (p_etapa is null or pc.etapa = p_etapa)
       and (p_etapa is not null or pc.etapa <> 'bloqueado')
       and (v_buscar is null
            or (pc.nombres || ' ' || pc.apellidos) ilike '%' || v_buscar || '%'
            or pc.dni like v_buscar || '%'
            or pc.telefono like '%' || v_buscar || '%')
     order by orden
     limit p_limite offset p_desde
  )
  select
    (select coalesce(jsonb_object_agg(r.etapa, r.n), '{}'::jsonb)
       from (select etapa, count(*) n from base group by etapa) r),
    (select coalesce(jsonb_agg(x.fila order by x.orden), '[]'::jsonb) from pagina x),
    (select coalesce(max(x.total), 0) from pagina x)
  into v_resumen, v_filas, v_total;

  return jsonb_build_object('resumen', v_resumen, 'total', v_total, 'filas', v_filas);
end;
$$;

revoke all on function public.clientes_seguimiento(text, text, integer, integer) from public, anon;
grant execute on function public.clientes_seguimiento(text, text, integer, integer) to authenticated;


-- ------------------------------------------------------------
-- 4) Registrar una llamada o un mensaje
-- ------------------------------------------------------------
create or replace function public.registrar_seguimiento(
  p_cliente   uuid,
  p_canal     text,
  p_resultado text,
  p_nota      text default null,
  p_volver_el date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
begin
  if not public.puede_ver_clientes() then
    raise exception 'Tu rol no puede registrar contactos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perfiles_cliente where id = p_cliente) then
    raise exception 'Ese cliente no existe.' using errcode = 'P0001';
  end if;
  if p_canal not in ('llamada', 'whatsapp') then
    raise exception 'Elige si fue llamada o WhatsApp.' using errcode = 'P0001';
  end if;
  if p_resultado not in ('interesado', 'no_interesado', 'no_contesto', 'numero_equivocado', 'volver_a_llamar') then
    raise exception 'Elige el resultado del contacto.' using errcode = 'P0001';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota admite hasta 500 caracteres.' using errcode = 'P0001';
  end if;
  if p_volver_el is not null and p_volver_el < (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha para volver a llamar no puede ser pasada.' using errcode = 'P0001';
  end if;
  if p_resultado = 'volver_a_llamar' and p_volver_el is null then
    raise exception 'Indica cuándo volver a llamar.' using errcode = 'P0001';
  end if;

  insert into public.seguimientos (cliente_id, usuario_id, canal, resultado, nota, etapa, volver_el)
  values (p_cliente, auth.uid(), p_canal, p_resultado, v_nota, public.etapa_cliente(p_cliente), p_volver_el);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.registrar_seguimiento(uuid, text, text, text, date) from public, anon;
grant execute on function public.registrar_seguimiento(uuid, text, text, text, date) to authenticated;


-- ------------------------------------------------------------
-- 5) Recordatorios (campana y notificación en el teléfono)
-- ------------------------------------------------------------
-- Manda el recordatorio de su etapa si corresponde. Devuelve null si se
-- envió, o el motivo por el que no.
create or replace function public.recordar_cliente(p_cliente uuid, p_usuario uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa   text := public.etapa_cliente(p_cliente);
  v_user    uuid;
  v_promos  boolean;
  v_titulo  text;
  v_cuerpo  text;
begin
  select user_id, coalesce(acepta_promociones, false) into v_user, v_promos
    from public.perfiles_cliente where id = p_cliente;
  if v_user is null then
    return 'sin cuenta de usuario';
  end if;

  if exists (select 1 from public.seguimientos
              where cliente_id = p_cliente and canal = 'recordatorio'
                and created_at > now() - interval '3 days') then
    return 'ya recibió uno en los últimos 3 días';
  end if;

  case v_etapa
    when 'sin_tarjeta' then
      v_titulo := 'Registra tu tarjeta y empieza a operar';
      v_cuerpo := 'Tu cuenta ya está verificada. Registra tu tarjeta de crédito en un minuto y envía tu primera solicitud.';
    when 'sin_cuenta' then
      v_titulo := 'Te falta tu cuenta de ahorros';
      v_cuerpo := 'Tu tarjeta ya está verificada. Agrega tu cuenta de ahorros a tu nombre para que podamos depositarte.';
    when 'sin_operar' then
      v_titulo := 'Ya puedes enviar tu primera solicitud';
      v_cuerpo := 'Tu tarjeta y tu cuenta están listas. Paga con tu tarjeta, adjunta el comprobante y te depositamos en tu cuenta.';
    when 'inactivo' then
      if not v_promos then
        return 'no aceptó recibir novedades';
      end if;
      v_titulo := '¿Necesitas efectivo?';
      v_cuerpo := 'Seguimos atendiendo de lunes a sábado. Envía tu solicitud desde la app o la web cuando lo necesites.';
    else
      return case v_etapa
        when 'sin_verificar' then 'aún no está verificado'
        when 'tarjeta_en_revision' then 'su tarjeta está en revisión'
        when 'opera' then 'ya opera'
        when 'bloqueado' then 'está bloqueado'
        else 'no aplica' end;
  end case;

  insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
  values (v_user, 'recordatorio', v_titulo, v_cuerpo);

  insert into public.seguimientos (cliente_id, usuario_id, canal, resultado, nota, etapa)
  values (p_cliente, p_usuario, 'recordatorio', 'enviado', v_titulo, v_etapa);

  return null;
end;
$$;

revoke all on function public.recordar_cliente(uuid, uuid) from public, anon, authenticated;

-- Desde el panel, a uno o a varios.
create or replace function public.enviar_recordatorio(p_clientes uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_motivo   text;
  v_enviados int := 0;
  v_omitidos jsonb := '[]'::jsonb;
begin
  if not public.puede_ver_clientes() then
    raise exception 'Tu rol no puede enviar recordatorios.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_clientes, 1), 0) > 200 then
    raise exception 'Como máximo 200 clientes por envío.' using errcode = 'P0001';
  end if;

  foreach v_id in array coalesce(p_clientes, '{}') loop
    v_motivo := public.recordar_cliente(v_id, auth.uid());
    if v_motivo is null then
      v_enviados := v_enviados + 1;
    else
      v_omitidos := v_omitidos || jsonb_build_object('id', v_id, 'motivo', v_motivo);
    end if;
  end loop;

  insert into public.auditoria_logs (usuario_id, accion, entidad, datos_despues)
  values (auth.uid(), 'ENVIAR_RECORDATORIO', 'perfiles_cliente',
          jsonb_build_object('enviados', v_enviados, 'pedidos', coalesce(array_length(p_clientes, 1), 0)));

  return jsonb_build_object('enviados', v_enviados, 'omitidos', v_omitidos);
end;
$$;

revoke all on function public.enviar_recordatorio(uuid[]) from public, anon;
grant execute on function public.enviar_recordatorio(uuid[]) to authenticated;

-- Automáticos: los llama pg_cron cada día hábil.
create or replace function public.recordatorios_automaticos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy  date := (now() at time zone 'America/Lima')::date;
  v_id   uuid;
  v_n    int := 0;
begin
  if extract(isodow from v_hoy) = 7
     or exists (select 1 from public.feriados f where f.fecha = v_hoy) then
    return 0;
  end if;

  for v_id in
    select pc.id
      from public.perfiles_cliente pc
     where pc.fecha_validacion < now() - interval '1 day'
       and public.etapa_cliente(pc.id) in ('sin_tarjeta', 'sin_cuenta', 'sin_operar')
       -- Hasta 3 automáticos por cliente.
       and (select count(*) from public.seguimientos g
             where g.cliente_id = pc.id and g.canal = 'recordatorio' and g.usuario_id is null) < 3
    union
    select pc.id
      from public.perfiles_cliente pc
     where coalesce(pc.acepta_promociones, false)
       and public.etapa_cliente(pc.id) = 'inactivo'
       and not exists (select 1 from public.seguimientos g
                        where g.cliente_id = pc.id and g.canal = 'recordatorio'
                          and g.created_at > now() - interval '30 days')
  loop
    if public.recordar_cliente(v_id, null) is null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.recordatorios_automaticos() from public, anon, authenticated;

-- 10:00 a. m. de Lima (15:00 UTC), de lunes a sábado. Para apagarlos:
--   select cron.unschedule('recordatorios-clientes');
do $$
begin
  if exists (select 1 from cron.job where jobname = 'recordatorios-clientes') then
    perform cron.unschedule('recordatorios-clientes');
  end if;
  perform cron.schedule('recordatorios-clientes', '0 15 * * 1-6',
                        'select public.recordatorios_automaticos();');
end $$;


-- ------------------------------------------------------------
-- 6) Ficha: fotos de las tarjetas y últimos contactos
-- ------------------------------------------------------------
create or replace function public.ficha_cliente(p_cliente uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver_clientes() then
    raise exception 'Tu rol no puede ver clientes.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'etapa', public.etapa_cliente(p_cliente),
    'tarjetas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'banco', t.banco, 'ultimos_4', t.ultimos_4, 'estado', t.estado,
               'foto_tarjeta', t.foto_tarjeta, 'foto_reverso', t.foto_reverso)
             order by t.created_at desc)
        from public.tarjetas t where t.cliente_id = p_cliente and t.activa), '[]'::jsonb),
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'banco', c.banco, 'tipo', c.tipo, 'ultimos_4', right(c.numero_cuenta, 4))
                       order by c.banco)
        from public.cuentas_bancarias c where c.cliente_id = p_cliente and c.activa), '[]'::jsonb),
    'especiales', coalesce((
      select jsonb_agg(jsonb_build_object('banco', e.banco, 'porcentaje', e.porcentaje, 'motivo', e.motivo))
        from public.comisiones_cliente e where e.cliente_id = p_cliente), '[]'::jsonb),
    'seguimientos', coalesce((
      select jsonb_agg(x.s order by x.en desc) from (
        select g.created_at as en,
               jsonb_build_object('canal', g.canal, 'resultado', g.resultado, 'nota', g.nota,
                                  'en', g.created_at, 'volver_el', g.volver_el, 'etapa', g.etapa,
                                  'por', (select u.email from public.users u where u.id = g.usuario_id)) as s
          from public.seguimientos g where g.cliente_id = p_cliente
         order by g.created_at desc limit 15) x), '[]'::jsonb)
  );
end;
$$;

-- Pagos también abre las fotos de las tarjetas (las de identidad ya
-- podía, migración 064).
drop policy if exists storage_tarjetas_pagos on storage.objects;
create policy storage_tarjetas_pagos on storage.objects
  for select to authenticated
  using (bucket_id = 'tarjetas-fotos' and public.es_pagos());

notify pgrst, 'reload schema';
