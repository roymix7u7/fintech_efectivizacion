-- ============================================================
--  PASO 2 DE 2 — Ejecutar DESPUÉS de 09a-rol-supervisor.sql
--
--  Sedes, tres roles de staff y gestión de equipo.
--
--  Estructura: cada sede tiene un supervisor y debajo sus
--  gestores. El reparto de casos sigue siendo global a
--  propósito: si cada sede tuviera su propia cola, una sede
--  con poco personal dejaría casos esperando mientras otra
--  está desocupada. La sede sirve para saber quién supervisa
--  a quién y para medir por equipo.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Sedes
-- ------------------------------------------------------------
create table if not exists public.sedes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  ciudad     text,
  direccion  text,
  telefono   text,
  activa     boolean not null default true,
  creada_por uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

drop trigger if exists tr_sedes_updated on public.sedes;
create trigger tr_sedes_updated
  before update on public.sedes
  for each row execute function public.update_updated_at();

-- A qué sede pertenece cada persona del staff.
alter table public.users
  add column if not exists sede_id uuid references public.sedes(id);

create index if not exists users_sede
  on public.users (sede_id) where rol <> 'cliente';


-- ------------------------------------------------------------
-- 2) Quién es quién
--    es_staff incluye ahora a supervisor. es_supervisor cubre
--    supervisor y admin, porque el admin puede todo lo del
--    supervisor. es_admin sigue siendo solo admin.
-- ------------------------------------------------------------
create or replace function public.es_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select rol in ('admin', 'supervisor', 'gestor') and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false);
$$;

create or replace function public.es_supervisor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select rol in ('admin', 'supervisor') and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false);
$$;

/** Sede del usuario actual. Null para el admin, que ve todas. */
create or replace function public.mi_sede()
returns uuid
language sql stable security definer set search_path = public
as $$
  select sede_id from public.users where id = auth.uid();
$$;

revoke execute on function public.es_supervisor() from anon;
revoke execute on function public.mi_sede() from anon;


-- ------------------------------------------------------------
-- 3) Quién puede cambiar el rol de quién
--
--    ESTO CORRIGE UN HUECO: el trigger anterior dejaba que
--    cualquier miembro del staff cambiara roles, así que un
--    gestor podía ascenderse a administrador él mismo.
--
--    Ahora:
--      · el admin puede todo,
--      · el supervisor solo nombra o quita gestores de SU sede,
--      · el gestor no toca ningún rol,
--      · nadie se cambia el rol a sí mismo.
-- ------------------------------------------------------------
create or replace function public.users_proteger_columnas()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_yo        uuid    := auth.uid();
  v_admin     boolean := public.es_admin();
  v_supervisa boolean := public.es_supervisor();
  v_mi_sede   uuid    := public.mi_sede();
begin
  -- El administrador tiene mando completo.
  if v_admin then
    return new;
  end if;

  -- Nadie se asciende a sí mismo, ni siquiera un supervisor.
  if new.id = v_yo then
    new.rol := old.rol;
    if not (old.estado = 'observado' and new.estado = 'pendiente') then
      new.estado := old.estado;
    end if;
    return new;
  end if;

  if v_supervisa then
    -- El supervisor solo mueve gestores dentro de su propia sede, y
    -- nunca puede crear otro admin ni otro supervisor.
    if new.rol not in ('gestor', 'cliente') or old.rol not in ('gestor', 'cliente') then
      new.rol := old.rol;
    end if;
    if old.sede_id is distinct from v_mi_sede
       and new.sede_id is distinct from v_mi_sede then
      new.rol     := old.rol;
      new.sede_id := old.sede_id;
    end if;
    return new;
  end if;

  -- Gestor: puede tocar el estado de clientes, nunca roles.
  new.rol := old.rol;
  if not (old.estado = 'observado' and new.estado = 'pendiente') then
    new.estado := old.estado;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_users_proteger_columnas on public.users;
create trigger tr_users_proteger_columnas
  before update on public.users
  for each row execute function public.users_proteger_columnas();


-- ------------------------------------------------------------
-- 4) Permisos sobre sedes
-- ------------------------------------------------------------
alter table public.sedes enable row level security;

drop policy if exists sedes_lectura on public.sedes;
create policy sedes_lectura on public.sedes
  for select to authenticated using (public.es_staff());

drop policy if exists sedes_escritura on public.sedes;
create policy sedes_escritura on public.sedes
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());


-- ------------------------------------------------------------
-- 5) Rendimiento por persona y por sede
--    Con 15 trabajadores hace falta medir para repartir bien y
--    para notar a quien aprueba sin mirar.
-- ------------------------------------------------------------
create or replace function public.rendimiento_equipo(
  p_dias  integer default 7,
  p_sede  uuid default null
)
returns table (
  usuario_id       uuid,
  email            text,
  rol              text,
  sede             text,
  resueltas        bigint,
  aprobadas        bigint,
  rechazadas       bigint,
  minutos_promedio numeric
)
language sql stable security definer set search_path = public
as $$
  select u.id,
         u.email,
         u.rol::text,
         s.nombre,
         count(sol.id),
         count(sol.id) filter (where sol.estado = 'aprobado'),
         count(sol.id) filter (where sol.estado = 'rechazado'),
         round(avg(extract(epoch from (sol.fecha_revision - sol.created_at)) / 60)::numeric, 1)
    from public.users u
    left join public.sedes s on s.id = u.sede_id
    left join public.solicitudes sol
           on sol.revisado_por = u.id
          and sol.fecha_revision >= now() - (p_dias || ' days')::interval
   where u.rol <> 'cliente'
     and (p_sede is null or u.sede_id = p_sede)
     and public.es_supervisor()
   group by u.id, u.email, u.rol, s.nombre
   order by count(sol.id) desc;
$$;

revoke execute on function public.rendimiento_equipo(integer, uuid) from anon;


-- ------------------------------------------------------------
-- 6) Listado del equipo
--    Devuelve el personal con su sede. El admin ve a todos; el
--    supervisor solo a los de su sede.
-- ------------------------------------------------------------
create or replace function public.listar_equipo()
returns table (
  id         uuid,
  email      text,
  rol        text,
  estado     text,
  sede_id    uuid,
  sede       text,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select u.id, u.email, u.rol::text, u.estado::text,
         u.sede_id, s.nombre, u.created_at
    from public.users u
    left join public.sedes s on s.id = u.sede_id
   where u.rol <> 'cliente'
     and public.es_supervisor()
     and (public.es_admin() or u.sede_id = public.mi_sede())
   order by u.rol, u.email;
$$;

revoke execute on function public.listar_equipo() from anon;


-- ------------------------------------------------------------
-- 7) Comprobación
-- ------------------------------------------------------------
select rol::text as rol, count(*) as cuantos
from public.users group by rol order by rol;
