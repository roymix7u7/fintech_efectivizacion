-- ============================================================
--  MODULO DE PAGOS
--
--  El flujo hasta hoy terminaba en "aprobado". Esto agrega la
--  etapa que seguia fuera del sistema:
--
--    pendiente -> aprobado -> pagado
--                   ^           |
--                   +-----------+  (cancelar un envio)
--
--  Como trabaja Pagos:
--    · cada encargado tiene uno o varios bancos asignados, y un
--      banco puede tener varios encargados;
--    · busca por DNI, marca las solicitudes aprobadas de sus
--      bancos y las va juntando en un lote;
--    · confirma el lote de una vez;
--    · ve lo de sus companeros, pero solo marca y cancela en sus
--      bancos.
--
--  Todo pasa por funciones del servidor en vez de abrirle las
--  tablas: Pagos no necesita leer documentos de identidad ni
--  usuarios, y asi no puede.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Estado nuevo y columnas de la etapa de pago
-- ------------------------------------------------------------
alter table public.solicitudes
  drop constraint if exists solicitudes_estado_check;

alter table public.solicitudes
  add constraint solicitudes_estado_check
  check (estado in ('pendiente', 'aprobado', 'rechazado', 'pagado'));

alter table public.solicitudes
  add column if not exists marcada_por uuid references public.users(id) on delete set null,
  add column if not exists marcada_en  timestamptz,
  add column if not exists pagado_por  uuid references public.users(id) on delete set null,
  add column if not exists pagado_en   timestamptz,
  add column if not exists lote_id     uuid;


-- ------------------------------------------------------------
-- 2) Quien paga que banco
--    Clave compuesta: una persona puede llevar varios bancos y un
--    banco puede tener varias personas. Para cubrir una ausencia,
--    el admin le agrega un banco a alguien y listo.
-- ------------------------------------------------------------
create table if not exists public.pagos_bancos (
  user_id      uuid not null references public.users(id) on delete cascade,
  banco        text not null,
  asignado_en  timestamptz not null default now(),
  primary key (user_id, banco)
);

alter table public.pagos_bancos enable row level security;

drop policy if exists pagos_bancos_lectura on public.pagos_bancos;
create policy pagos_bancos_lectura on public.pagos_bancos
  for select to authenticated
  using (user_id = auth.uid() or public.es_supervisor());

drop policy if exists pagos_bancos_escritura on public.pagos_bancos;
create policy pagos_bancos_escritura on public.pagos_bancos
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

grant select, insert, update, delete on public.pagos_bancos to authenticated;


-- ------------------------------------------------------------
-- 3) Lotes e historial
--    El historial vive en pagos_eventos y no en la solicitud:
--    al cancelar, la solicitud vuelve a "por pagar" y pierde su
--    lote, pero el lote tiene que seguir mostrando que esa
--    solicitud estuvo en el y por que se cancelo.
-- ------------------------------------------------------------
create table if not exists public.lotes_pago (
  id          uuid primary key default gen_random_uuid(),
  creado_por  uuid not null references public.users(id),
  creado_en   timestamptz not null default now(),
  cantidad    integer not null,
  bancos      text[] not null default '{}'
);

alter table public.solicitudes
  drop constraint if exists solicitudes_lote_fk;
alter table public.solicitudes
  add constraint solicitudes_lote_fk
  foreign key (lote_id) references public.lotes_pago(id) on delete set null;

create table if not exists public.pagos_eventos (
  id            bigint generated always as identity primary key,
  solicitud_id  uuid not null references public.solicitudes(id) on delete cascade,
  lote_id       uuid references public.lotes_pago(id) on delete set null,
  accion        text not null check (accion in ('pagado', 'cancelado')),
  usuario_id    uuid not null references public.users(id),
  motivo        text,
  creado_en     timestamptz not null default now()
);

-- Sin politicas: solo se tocan desde las funciones de abajo.
alter table public.lotes_pago enable row level security;
alter table public.pagos_eventos enable row level security;

create index if not exists solicitudes_pago_idx
  on public.solicitudes (banco, estado)
  where estado in ('aprobado', 'pagado');
create index if not exists solicitudes_lote_idx
  on public.solicitudes (lote_id) where lote_id is not null;
create index if not exists pagos_eventos_lote_idx
  on public.pagos_eventos (lote_id);
create index if not exists pagos_eventos_solicitud_idx
  on public.pagos_eventos (solicitud_id);
create index if not exists lotes_pago_fecha_idx
  on public.lotes_pago (creado_en desc);


-- ------------------------------------------------------------
-- 4) Quien es de pagos y que bancos lleva
-- ------------------------------------------------------------
create or replace function public.es_pagos()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select rol = 'pagos' and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false);
$$;

create or replace function public.mis_bancos_pago()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(banco order by banco), '{}')
  from public.pagos_bancos where user_id = auth.uid();
$$;

-- Cuanto dura una marca. Pasado este tiempo sin confirmar, otro
-- encargado del mismo banco puede tomar la solicitud: si alguien
-- marca y se va a almorzar, la solicitud no queda secuestrada.
create or replace function public.pagos_reserva_minutos()
returns integer language sql immutable as $$ select 30 $$;

revoke execute on function public.es_pagos() from anon;
revoke execute on function public.mis_bancos_pago() from anon;


-- ------------------------------------------------------------
-- 5) Resumen por banco, para las pestanas
-- ------------------------------------------------------------
create or replace function public.pagos_resumen()
returns table (
  banco            text,
  por_pagar        bigint,
  en_revision      bigint,
  marcadas_por_mi  bigint,
  pagadas_hoy      bigint,
  es_mio           boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_vence  timestamptz := now() - (public.pagos_reserva_minutos() || ' minutes')::interval;
  -- "Hoy" en Lima, no en UTC: a las 7 de la noche el servidor ya
  -- estaria contando el dia siguiente.
  v_hoy    timestamptz := date_trunc('day', now() at time zone 'America/Lima')
                          at time zone 'America/Lima';
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  with conteo as (
    select s.banco,
           count(*) filter (where s.estado = 'aprobado')                     as c_por_pagar,
           count(*) filter (where s.estado = 'pendiente')                    as c_en_revision,
           count(*) filter (where s.estado = 'aprobado'
                              and s.marcada_por = auth.uid()
                              and s.marcada_en > v_vence)                    as c_mias,
           count(*) filter (where s.estado = 'pagado' and s.pagado_en >= v_hoy) as c_hoy
    from public.solicitudes s
    where s.banco is not null
      and (s.estado in ('pendiente', 'aprobado')
           or (s.estado = 'pagado' and s.pagado_en >= v_hoy))
    group by s.banco
  ),
  lista as (
    select c.banco as b from conteo c
    union
    select unnest(v_mis)
  )
  select l.b,
         coalesce(c.c_por_pagar, 0),
         coalesce(c.c_en_revision, 0),
         coalesce(c.c_mias, 0),
         coalesce(c.c_hoy, 0),
         (v_admin or l.b = any(v_mis))
  from lista l
  left join conteo c on c.banco = l.b
  order by (l.b = any(v_mis)) desc, l.b;
end;
$$;


-- ------------------------------------------------------------
-- 6) La lista de trabajo
--    Una sola llamada con lo que hace falta para pagar: nombre,
--    DNI y las cuentas del cliente. El comprobante va como ruta
--    para abrirlo si hace falta, no como imagen.
-- ------------------------------------------------------------
create or replace function public.pagos_listar(
  p_banco   text    default null,
  p_estado  text    default 'aprobado',
  p_buscar  text    default null,
  p_limite  integer default 50,
  p_desde   integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_vence  timestamptz := now() - (public.pagos_reserva_minutos() || ' minutes')::interval;
  v_buscar text := nullif(trim(coalesce(p_buscar, '')), '');
  v_filas  jsonb;
  v_total  bigint;
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  -- Pagos no tiene nada que hacer con lo rechazado.
  if p_estado not in ('pendiente', 'aprobado', 'pagado') then
    raise exception 'Estado no permitido: %', p_estado;
  end if;

  p_limite := least(greatest(coalesce(p_limite, 50), 1), 200);
  p_desde  := greatest(coalesce(p_desde, 0), 0);

  select coalesce(jsonb_agg(x.fila order by x.orden), '[]'::jsonb),
         coalesce(max(x.total), 0)
    into v_filas, v_total
  from (
    select
      jsonb_build_object(
        'id',              s.id,
        'codigo',          s.codigo,
        'banco',           s.banco,
        'estado',          s.estado,
        'created_at',      s.created_at,
        'fecha_revision',  s.fecha_revision,
        'comprobante_url', s.comprobante_url,
        'nota_cliente',    s.nota_cliente,
        'pagado_en',       s.pagado_en,
        'pagado_por',      (select u.email from public.users u where u.id = s.pagado_por),
        'ultimos_4',       t.ultimos_4,
        -- Una marca vencida se trata como si no existiera.
        'marcada_por',     case when s.marcada_en > v_vence
                             then (select u.email from public.users u where u.id = s.marcada_por) end,
        'marcada_por_mi',  coalesce(s.marcada_por = v_yo and s.marcada_en > v_vence, false),
        'puedo_pagar',     (v_admin or s.banco = any(v_mis)),
        'cliente', jsonb_build_object(
          'nombres',   p.nombres,
          'apellidos', p.apellidos,
          'dni',       p.dni,
          'telefono',  p.telefono
        ),
        'cuentas', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'banco', c.banco, 'numero', c.numero_cuenta, 'tipo', c.tipo
                 ) order by c.banco)
          from public.cuentas_bancarias c
          where c.cliente_id = s.cliente_id and c.activa = true
        ), '[]'::jsonb)
      ) as fila,
      row_number() over (
        order by
          case when p_estado = 'pagado' then s.pagado_en end desc nulls last,
          -- Lo que mas tiempo lleva aprobado se paga primero.
          s.fecha_revision asc nulls last,
          s.created_at asc
      ) as orden,
      count(*) over () as total
    from public.solicitudes s
    join public.perfiles_cliente p on p.id = s.cliente_id
    left join public.tarjetas t on t.id = s.tarjeta_id
    where s.estado = p_estado
      and (p_banco is null or s.banco = p_banco)
      and (
        v_buscar is null
        or p.dni like v_buscar || '%'
        or s.codigo ilike v_buscar || '%'
        or (p.nombres || ' ' || p.apellidos) ilike '%' || v_buscar || '%'
      )
    order by orden
    limit p_limite offset p_desde
  ) x;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;


-- ------------------------------------------------------------
-- 7) Marcar y desmarcar
--    SKIP LOCKED: si dos encargados del mismo banco marcan la
--    misma solicitud al mismo tiempo, uno la obtiene y al otro se
--    le devuelve como rechazada, sin esperas ni bloqueos.
-- ------------------------------------------------------------
create or replace function public.pagos_marcar(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_vence  timestamptz := now() - (public.pagos_reserva_minutos() || ' minutes')::interval;
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
       and (marcada_por is null or marcada_por = v_yo or marcada_en <= v_vence)
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

create or replace function public.pagos_desmarcar(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_n integer;
begin
  if not (public.es_pagos() or public.es_admin()) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  update public.solicitudes
     set marcada_por = null, marcada_en = null
   where id = any(p_ids)
     and estado = 'aprobado'
     and (marcada_por = auth.uid() or public.es_admin());
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ------------------------------------------------------------
-- 8) Confirmar el lote
--    Solo entra lo que sigue marcado por quien confirma. Si una
--    solicitud se la llevo otro encargado entre tanto, no se paga
--    dos veces: se devuelve como omitida para que se vea cual.
-- ------------------------------------------------------------
create or replace function public.pagos_confirmar(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_ids    uuid[];
  v_bancos text[];
  v_lote   uuid;
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- Primero se bloquean las filas, despues se agregan: FOR UPDATE
  -- no se puede combinar con agregados en la misma consulta.
  perform 1 from public.solicitudes
   where id = any(p_ids)
     and estado = 'aprobado'
     and marcada_por = v_yo
     and (v_admin or banco = any(v_mis))
   for update;

  select array_agg(id), array_agg(distinct banco)
    into v_ids, v_bancos
  from public.solicitudes
  where id = any(p_ids)
    and estado = 'aprobado'
    and marcada_por = v_yo
    and (v_admin or banco = any(v_mis));

  if v_ids is null then
    raise exception 'Ninguna de esas solicitudes sigue marcada por ti. Recarga la lista.'
      using errcode = 'P0001';
  end if;

  insert into public.lotes_pago (creado_por, cantidad, bancos)
  values (v_yo, array_length(v_ids, 1), v_bancos)
  returning id into v_lote;

  update public.solicitudes
     set estado = 'pagado',
         pagado_por = v_yo,
         pagado_en = now(),
         lote_id = v_lote,
         marcada_por = null,
         marcada_en = null
   where id = any(v_ids);

  insert into public.pagos_eventos (solicitud_id, lote_id, accion, usuario_id)
  select unnest(v_ids), v_lote, 'pagado', v_yo;

  -- El cliente se entera en su campana.
  insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
  select p.user_id,
         'pago_enviado',
         'Tu pago fue enviado',
         'La solicitud ' || s.codigo || ' ya fue pagada. Revisa tu cuenta bancaria.'
  from public.solicitudes s
  join public.perfiles_cliente p on p.id = s.cliente_id
  where s.id = any(v_ids) and p.user_id is not null;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (v_yo, 'CONFIRMAR_LOTE_PAGO', 'lotes_pago', v_lote,
          jsonb_build_object('cantidad', array_length(v_ids, 1), 'bancos', v_bancos));

  return jsonb_build_object(
    'lote_id',     v_lote,
    'confirmadas', array_length(v_ids, 1),
    'omitidas',    to_jsonb(array(select unnest(p_ids) except select unnest(v_ids)))
  );
end;
$$;


-- ------------------------------------------------------------
-- 9) Cancelar un envio
--    Vuelve a "por pagar" en su banco. El motivo es obligatorio:
--    un pago deshecho sin explicacion es exactamente lo que una
--    auditoria no puede aceptar.
-- ------------------------------------------------------------
create or replace function public.pagos_cancelar(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_sol    record;
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la cancelación.' using errcode = 'P0001';
  end if;

  select s.id, s.banco, s.lote_id, s.codigo, p.user_id
    into v_sol
  from public.solicitudes s
  join public.perfiles_cliente p on p.id = s.cliente_id
  where s.id = p_id and s.estado = 'pagado'
  for update of s;

  if not found then
    raise exception 'Esa solicitud ya no figura como pagada. Recarga la lista.'
      using errcode = 'P0001';
  end if;
  if not (v_admin or v_sol.banco = any(v_mis)) then
    raise exception 'Solo puedes cancelar envíos de tus bancos.' using errcode = '42501';
  end if;

  update public.solicitudes
     set estado = 'aprobado', pagado_por = null, pagado_en = null, lote_id = null
   where id = p_id;

  insert into public.pagos_eventos (solicitud_id, lote_id, accion, usuario_id, motivo)
  values (p_id, v_sol.lote_id, 'cancelado', v_yo, v_motivo);

  if v_sol.user_id is not null then
    insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
    values (v_sol.user_id, 'pago_en_revision', 'Estamos revisando tu pago',
            'El pago de tu solicitud ' || v_sol.codigo
            || ' se está revisando. Te avisaremos cuando vuelva a enviarse.');
  end if;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_antes, datos_despues)
  values (v_yo, 'CANCELAR_PAGO', 'solicitudes', p_id,
          jsonb_build_object('estado', 'pagado', 'lote_id', v_sol.lote_id),
          jsonb_build_object('estado', 'aprobado', 'motivo', v_motivo));
end;
$$;


-- ------------------------------------------------------------
-- 10) Historial de lotes
--     Todo Pagos ve todos los lotes: sirve para revisar el trabajo
--     de los companeros. Cancelar sigue limitado a sus bancos.
-- ------------------------------------------------------------
create or replace function public.pagos_historial(
  p_banco   text    default null,
  p_buscar  text    default null,
  p_limite  integer default 20,
  p_desde   integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_buscar text := nullif(trim(coalesce(p_buscar, '')), '');
  v_total  bigint;
  v_lotes  jsonb;
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  p_limite := least(greatest(coalesce(p_limite, 20), 1), 100);
  p_desde  := greatest(coalesce(p_desde, 0), 0);

  select count(*) into v_total
  from public.lotes_pago l
  where (p_banco is null or p_banco = any(l.bancos))
    and (v_buscar is null or exists (
      select 1 from public.pagos_eventos e
      join public.solicitudes s on s.id = e.solicitud_id
      join public.perfiles_cliente p on p.id = s.cliente_id
      where e.lote_id = l.id and e.accion = 'pagado'
        and (p.dni like v_buscar || '%' or s.codigo ilike v_buscar || '%')
    ));

  select coalesce(jsonb_agg(x.lote order by x.creado_en desc), '[]'::jsonb)
    into v_lotes
  from (
    select l.creado_en,
      jsonb_build_object(
        'id',         l.id,
        'creado_en',  l.creado_en,
        'creado_por', (select u.email from public.users u where u.id = l.creado_por),
        'cantidad',   l.cantidad,
        'bancos',     to_jsonb(l.bancos),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'solicitud_id',   s.id,
            'codigo',         s.codigo,
            'banco',          s.banco,
            'estado',         s.estado,
            'en_este_lote',   coalesce(s.lote_id = l.id, false),
            'puedo_cancelar', (s.estado = 'pagado' and s.lote_id = l.id
                               and (v_admin or s.banco = any(v_mis))),
            'cliente', jsonb_build_object(
              'nombres', p.nombres, 'apellidos', p.apellidos, 'dni', p.dni),
            'cancelacion', (
              select jsonb_build_object(
                'motivo', c.motivo,
                'en',     c.creado_en,
                'por',    (select u.email from public.users u where u.id = c.usuario_id))
              from public.pagos_eventos c
              where c.solicitud_id = s.id and c.lote_id = l.id and c.accion = 'cancelado'
              order by c.creado_en desc limit 1)
          ) order by s.codigo)
          from public.pagos_eventos e
          join public.solicitudes s on s.id = e.solicitud_id
          join public.perfiles_cliente p on p.id = s.cliente_id
          where e.lote_id = l.id and e.accion = 'pagado'
        ), '[]'::jsonb)
      ) as lote
    from public.lotes_pago l
    where (p_banco is null or p_banco = any(l.bancos))
      and (v_buscar is null or exists (
        select 1 from public.pagos_eventos e
        join public.solicitudes s on s.id = e.solicitud_id
        join public.perfiles_cliente p on p.id = s.cliente_id
        where e.lote_id = l.id and e.accion = 'pagado'
          and (p.dni like v_buscar || '%' or s.codigo ilike v_buscar || '%')
      ))
    order by l.creado_en desc
    limit p_limite offset p_desde
  ) x;

  return jsonb_build_object('total', v_total, 'lotes', v_lotes);
end;
$$;


-- ------------------------------------------------------------
-- 11) Permisos de ejecucion
-- ------------------------------------------------------------
grant execute on function public.pagos_resumen() to authenticated;
grant execute on function public.pagos_listar(text, text, text, integer, integer) to authenticated;
grant execute on function public.pagos_marcar(uuid[]) to authenticated;
grant execute on function public.pagos_desmarcar(uuid[]) to authenticated;
grant execute on function public.pagos_confirmar(uuid[]) to authenticated;
grant execute on function public.pagos_cancelar(uuid, text) to authenticated;
grant execute on function public.pagos_historial(text, text, integer, integer) to authenticated;

revoke execute on function public.pagos_resumen() from anon;
revoke execute on function public.pagos_listar(text, text, text, integer, integer) from anon;
revoke execute on function public.pagos_marcar(uuid[]) from anon;
revoke execute on function public.pagos_desmarcar(uuid[]) from anon;
revoke execute on function public.pagos_confirmar(uuid[]) from anon;
revoke execute on function public.pagos_cancelar(uuid, text) from anon;
revoke execute on function public.pagos_historial(text, text, integer, integer) from anon;


-- ------------------------------------------------------------
-- 12) Abrir el comprobante desde Pagos
--     Solo lectura del bucket de comprobantes. Nada de KYC.
-- ------------------------------------------------------------
drop policy if exists storage_pagos_comprobantes on storage.objects;
create policy storage_pagos_comprobantes on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes' and public.es_pagos());


-- ------------------------------------------------------------
-- 13) El inicio del cliente cuenta lo pagado como aprobado
--     Sin esto, una solicitud desapareceria del contador de
--     aprobadas justo en el momento en que se le paga.
-- ------------------------------------------------------------
create or replace function public.resumen_inicio()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_perfil  public.perfiles_cliente%rowtype;
  v_bancos  text[];
begin
  select * into v_perfil
  from public.perfiles_cliente
  where user_id = auth.uid();

  if v_perfil.id is null then
    return jsonb_build_object(
      'perfil', null,
      'stats', jsonb_build_object('pendientes', 0, 'aprobadas', 0, 'tarjetas', 0),
      'bancos', '[]'::jsonb,
      'alertas', '[]'::jsonb,
      'guias', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct banco), '{}')
    into v_bancos
  from public.tarjetas
  where cliente_id = v_perfil.id and activa = true and estado = 'aprobado';

  return jsonb_build_object(
    'perfil', to_jsonb(v_perfil),

    'stats', jsonb_build_object(
      'pendientes', (select count(*) from public.solicitudes
                      where cliente_id = v_perfil.id and estado = 'pendiente'),
      'aprobadas',  (select count(*) from public.solicitudes
                      where cliente_id = v_perfil.id and estado in ('aprobado', 'pagado')),
      'tarjetas',   coalesce(array_length(v_bancos, 1), 0)
    ),

    'bancos', to_jsonb(v_bancos),

    'alertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'titulo', a.titulo, 'mensaje', a.mensaje,
               'tipo', a.tipo, 'created_at', a.created_at,
               'portada', a.imagenes[1]
             ) order by a.fecha_inicio desc)
      from (select * from public.alertas_sistema
             where categoria = 'noticia'
               and public.noticia_vigente(activa, fecha_inicio, fecha_fin)
             order by fecha_inicio desc limit 3) a
    ), '[]'::jsonb),

    'alertas_sin_ver', (
      select count(*)
      from public.alertas_sistema a
      where a.categoria = 'alerta'
        and public.noticia_vigente(a.activa, a.fecha_inicio, a.fecha_fin)
        and not exists (
          select 1 from public.alertas_vistas v
          where v.alerta_id = a.id and v.user_id = auth.uid()
        )
    ),

    'guias', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'banco', g.banco)
                       order by g.banco)
      from public.guias_banco g
      where g.activa = true and g.banco = any(v_bancos)
    ), '[]'::jsonb),

    'hay_guias', exists(select 1 from public.guias_banco where activa = true)
  );
end;
$$;

grant execute on function public.resumen_inicio() to authenticated;
revoke execute on function public.resumen_inicio() from anon;


notify pgrst, 'reload schema';
