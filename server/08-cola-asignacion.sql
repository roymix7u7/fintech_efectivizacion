-- ============================================================
--  COLA CON ASIGNACION AUTOMATICA
--
--  El problema: con 15 personas mirando la misma cola ordenada
--  igual, todas abren el primer caso y catorce pierden el tiempo.
--
--  La solucion: el trabajador pide el siguiente caso y el sistema
--  se lo entrega en exclusiva. FOR UPDATE SKIP LOCKED garantiza
--  que dos personas jamas reciban el mismo, aunque pulsen en el
--  mismo milisegundo: Postgres salta las filas que otra sesion ya
--  esta tocando en vez de esperarlas.
--
--  Si alguien toma un caso y se va a almorzar, el caso vuelve
--  solo a la bolsa pasado el tiempo de reserva.
--
--  Ejecutar entero. Es seguro correrlo dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Columnas de asignacion
-- ------------------------------------------------------------
alter table public.solicitudes
  add column if not exists asignado_a  uuid references public.users(id),
  add column if not exists asignado_en timestamptz;

alter table public.tarjetas
  add column if not exists asignado_a  uuid references public.users(id),
  add column if not exists asignado_en timestamptz;

-- El KYC se revisa sobre la fila de users, no sobre el perfil.
alter table public.users
  add column if not exists asignado_a  uuid references public.users(id),
  add column if not exists asignado_en timestamptz;

-- Indices parciales: solo interesan las filas que siguen en cola.
create index if not exists solicitudes_cola
  on public.solicitudes (asignado_en, created_at)
  where estado = 'pendiente';

create index if not exists tarjetas_cola
  on public.tarjetas (asignado_en, created_at)
  where estado = 'pendiente' and activa = true;

create index if not exists users_cola
  on public.users (asignado_en, created_at)
  where rol = 'cliente' and estado = 'pendiente';


-- ------------------------------------------------------------
-- 2) Cuanto dura la reserva
--    Veinte minutos. Suficiente para revisar con calma, poco
--    para que un caso quede secuestrado si alguien se desconecta.
-- ------------------------------------------------------------
create or replace function public.reserva_minutos()
returns integer language sql immutable as $$ select 20 $$;


-- ------------------------------------------------------------
-- 3) Pedir el siguiente caso
--
--    p_tipo: 'solicitud', 'tarjeta' o 'kyc'.
--    Devuelve el id entregado, o null si no queda nada libre.
--
--    Primero devuelve lo que el trabajador ya tenia tomado, para
--    que recargar la pagina no le quite su caso.
-- ------------------------------------------------------------
create or replace function public.tomar_siguiente(p_tipo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_yo      uuid := auth.uid();
  v_vence   timestamptz := now() - (public.reserva_minutos() || ' minutes')::interval;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  if p_tipo = 'solicitud' then
    select id into v_id from public.solicitudes
     where estado = 'pendiente' and asignado_a = v_yo and asignado_en > v_vence
     order by asignado_en limit 1;
    if v_id is not null then return v_id; end if;

    select id into v_id from public.solicitudes
     where estado = 'pendiente'
       and (asignado_a is null or asignado_en <= v_vence)
     order by created_at
     for update skip locked
     limit 1;
    if v_id is not null then
      update public.solicitudes
         set asignado_a = v_yo, asignado_en = now()
       where id = v_id;
    end if;

  elsif p_tipo = 'tarjeta' then
    select id into v_id from public.tarjetas
     where estado = 'pendiente' and activa = true
       and asignado_a = v_yo and asignado_en > v_vence
     order by asignado_en limit 1;
    if v_id is not null then return v_id; end if;

    select id into v_id from public.tarjetas
     where estado = 'pendiente' and activa = true
       and (asignado_a is null or asignado_en <= v_vence)
     order by created_at
     for update skip locked
     limit 1;
    if v_id is not null then
      update public.tarjetas
         set asignado_a = v_yo, asignado_en = now()
       where id = v_id;
    end if;

  elsif p_tipo = 'kyc' then
    select id into v_id from public.users
     where rol = 'cliente' and estado = 'pendiente'
       and asignado_a = v_yo and asignado_en > v_vence
     order by asignado_en limit 1;
    if v_id is not null then return v_id; end if;

    select id into v_id from public.users
     where rol = 'cliente' and estado = 'pendiente'
       and (asignado_a is null or asignado_en <= v_vence)
     order by created_at
     for update skip locked
     limit 1;
    if v_id is not null then
      update public.users
         set asignado_a = v_yo, asignado_en = now()
       where id = v_id;
    end if;

  else
    raise exception 'Tipo desconocido: %', p_tipo;
  end if;

  return v_id;
end;
$$;


-- ------------------------------------------------------------
-- 4) Soltar un caso
--    El trabajador lo devuelve a la bolsa. Un administrador puede
--    soltar el de cualquiera para desatascar.
-- ------------------------------------------------------------
create or replace function public.soltar_caso(p_tipo text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo   uuid := auth.uid();
  v_jefe boolean := public.es_admin();
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  if p_tipo = 'solicitud' then
    update public.solicitudes set asignado_a = null, asignado_en = null
     where id = p_id and (v_jefe or asignado_a = v_yo);
  elsif p_tipo = 'tarjeta' then
    update public.tarjetas set asignado_a = null, asignado_en = null
     where id = p_id and (v_jefe or asignado_a = v_yo);
  elsif p_tipo = 'kyc' then
    update public.users set asignado_a = null, asignado_en = null
     where id = p_id and (v_jefe or asignado_a = v_yo);
  else
    raise exception 'Tipo desconocido: %', p_tipo;
  end if;

  return found;
end;
$$;


-- ------------------------------------------------------------
-- 5) Como va la cola
--    Cuantos hay pendientes, cuantos tomados y cuantos libres.
--    Alimenta el contador de la barra lateral y el boton.
-- ------------------------------------------------------------
create or replace function public.estado_cola()
returns table (
  tipo       text,
  pendientes bigint,
  tomados    bigint,
  libres     bigint,
  mios       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (select now() - (public.reserva_minutos() || ' minutes')::interval as vence)
  select 'solicitud'::text,
         count(*),
         count(*) filter (where s.asignado_a is not null and s.asignado_en > v.vence),
         count(*) filter (where s.asignado_a is null or s.asignado_en <= v.vence),
         count(*) filter (where s.asignado_a = auth.uid() and s.asignado_en > v.vence)
    from public.solicitudes s, v
   where s.estado = 'pendiente'
   group by v.vence
  union all
  select 'tarjeta',
         count(*),
         count(*) filter (where t.asignado_a is not null and t.asignado_en > v.vence),
         count(*) filter (where t.asignado_a is null or t.asignado_en <= v.vence),
         count(*) filter (where t.asignado_a = auth.uid() and t.asignado_en > v.vence)
    from public.tarjetas t, v
   where t.estado = 'pendiente' and t.activa = true
   group by v.vence
  union all
  select 'kyc',
         count(*),
         count(*) filter (where u.asignado_a is not null and u.asignado_en > v.vence),
         count(*) filter (where u.asignado_a is null or u.asignado_en <= v.vence),
         count(*) filter (where u.asignado_a = auth.uid() and u.asignado_en > v.vence)
    from public.users u, v
   where u.rol = 'cliente' and u.estado = 'pendiente'
   group by v.vence;
$$;


-- ------------------------------------------------------------
-- 6) Rendimiento del equipo
--    Con 15 personas hace falta medir: sin esto no se puede
--    repartir bien ni detectar a quien aprueba sin mirar.
-- ------------------------------------------------------------
create or replace function public.rendimiento_equipo(p_dias integer default 7)
returns table (
  usuario_id      uuid,
  email           text,
  resueltas       bigint,
  aprobadas       bigint,
  rechazadas      bigint,
  minutos_promedio numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         u.email,
         count(*),
         count(*) filter (where s.estado = 'aprobado'),
         count(*) filter (where s.estado = 'rechazado'),
         round(avg(extract(epoch from (s.fecha_revision - s.created_at)) / 60)::numeric, 1)
    from public.solicitudes s
    join public.users u on u.id = s.revisado_por
   where s.fecha_revision >= now() - (p_dias || ' days')::interval
   group by u.id, u.email
   order by count(*) desc;
$$;


-- ------------------------------------------------------------
-- 7) Permisos
-- ------------------------------------------------------------
revoke execute on function public.tomar_siguiente(text) from anon;
revoke execute on function public.soltar_caso(text, uuid) from anon;
revoke execute on function public.estado_cola() from anon;
revoke execute on function public.rendimiento_equipo(integer) from anon;


-- ------------------------------------------------------------
-- 8) Comprobacion
-- ------------------------------------------------------------
select * from public.estado_cola();
