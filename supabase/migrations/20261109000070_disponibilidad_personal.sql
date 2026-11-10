-- ============================================================
--  DISPONIBILIDAD DEL PERSONAL (en línea / ocupado / desconectado)
-- ============================================================
--  Hasta ahora el reparto automático (gestor_menos_cargado) le daba
--  cada caso nuevo al gestor activo con menos carga, estuviera o no
--  trabajando: si estaba en refrigerio o ya se había ido, el caso
--  quedaba reservado para él y el cliente esperaba sin que nadie lo
--  viera. Ahora cada uno marca su estado, como en el chat:
--
--    · en_linea:     atiende; recibe casos nuevos.
--    · ocupado:      está, pero no quiere más por ahora; conserva los suyos.
--    · desconectado: fuera de turno.
--
--  El panel manda una señal cada minuto mientras está abierto. Sin
--  señal por 10 minutos (cerró el panel, se apagó la PC) la persona
--  cuenta como desconectada, aunque haya dejado "en línea".
--
--  Va en una tabla propia y no en users: users está en la publicación
--  de tiempo real y la pantalla de Verificación escucha todos sus
--  cambios; una señal por minuto ahí recargaría todos los paneles.
--
--  Se puede ejecutar más de una vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla y lectura
-- ------------------------------------------------------------
create table if not exists public.disponibilidad_personal (
  user_id      uuid primary key references public.users(id) on delete cascade,
  estado       text not null default 'desconectado'
               check (estado in ('en_linea', 'ocupado', 'desconectado')),
  desde        timestamptz not null default now(),
  ultima_senal timestamptz not null default now()
);

comment on table public.disponibilidad_personal is
  'Estado de trabajo del personal. Se escribe solo con fijar_disponibilidad() y senal_disponibilidad().';

alter table public.disponibilidad_personal enable row level security;

-- Cada uno ve el suyo; el administrador, el de todos; el supervisor,
-- el de su sede. Nadie escribe directo: solo por las funciones.
drop policy if exists disponibilidad_lectura on public.disponibilidad_personal;
create policy disponibilidad_lectura on public.disponibilidad_personal
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.es_admin())
    or (
      (select public.es_supervisor())
      and exists (
        select 1 from public.users u
         where u.id = disponibilidad_personal.user_id
           and u.sede_id is not distinct from (select public.mi_sede())
           and u.sede_id is not null
      )
    )
  );

revoke all on public.disponibilidad_personal from anon;
revoke insert, update, delete on public.disponibilidad_personal from authenticated;
grant select on public.disponibilidad_personal to authenticated;

-- ------------------------------------------------------------
-- 2) Reglas comunes
-- ------------------------------------------------------------
-- Minutos sin señal para dar a alguien por desconectado.
create or replace function public.minutos_sin_senal()
returns integer
language sql
immutable
set search_path = public
as $$ select 10 $$;

-- El estado que vale: "en línea" sin señal reciente es desconectado.
create or replace function public.disponibilidad_vigente(p_estado text, p_senal timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select case
           when p_estado is null then 'desconectado'
           when p_estado <> 'desconectado'
                and p_senal < now() - make_interval(mins => public.minutos_sin_senal())
             then 'desconectado'
           else p_estado
         end;
$$;

-- ------------------------------------------------------------
-- 3) Cambiar el propio estado
-- ------------------------------------------------------------
create or replace function public.fijar_disponibilidad(p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol  text;
  v_fila public.disponibilidad_personal;
begin
  if p_estado not in ('en_linea', 'ocupado', 'desconectado') then
    raise exception 'Estado no válido: %', p_estado using errcode = '22023';
  end if;

  select rol::text into v_rol
    from public.users
   where id = auth.uid() and estado <> 'bloqueado';

  if v_rol is null or v_rol not in ('admin', 'supervisor', 'gestor', 'pagos') then
    raise exception 'Solo el personal tiene disponibilidad.' using errcode = '42501';
  end if;

  insert into public.disponibilidad_personal as d (user_id, estado, desde, ultima_senal)
  values (auth.uid(), p_estado, now(), now())
  on conflict (user_id) do update
     set estado       = excluded.estado,
         -- "desde" solo se mueve si el estado cambia de verdad.
         desde        = case
                          when public.disponibilidad_vigente(d.estado, d.ultima_senal) = excluded.estado
                            then d.desde
                          else now()
                        end,
         ultima_senal = now()
  returning * into v_fila;

  return jsonb_build_object('estado', v_fila.estado, 'desde', v_fila.desde);
end;
$$;

-- ------------------------------------------------------------
-- 4) Señal de "sigo aquí" (el panel la manda cada minuto)
-- ------------------------------------------------------------
-- Si llegó tarde (la PC estuvo dormida más de 10 minutos), se deja
-- constancia de que quedó desconectado: el panel se lo dice y vuelve
-- a marcarse en línea cuando quiera.
create or replace function public.senal_disponibilidad()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila public.disponibilidad_personal;
begin
  update public.disponibilidad_personal d
     set estado       = public.disponibilidad_vigente(d.estado, d.ultima_senal),
         desde        = case
                          when public.disponibilidad_vigente(d.estado, d.ultima_senal) <> d.estado
                            then now()
                          else d.desde
                        end,
         ultima_senal = now()
   where d.user_id = auth.uid()
  returning * into v_fila;

  if v_fila.user_id is null then
    return jsonb_build_object('estado', 'desconectado', 'desde', null);
  end if;
  return jsonb_build_object('estado', v_fila.estado, 'desde', v_fila.desde);
end;
$$;

-- ------------------------------------------------------------
-- 5) Limpieza: quien dejó de mandar señal queda desconectado
-- ------------------------------------------------------------
-- El reparto ya ignora a quien no tiene señal reciente; esto además
-- deja el estado guardado al día para que Equipo lo muestre bien.
create or replace function public.desconectar_inactivos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.disponibilidad_personal
     set estado = 'desconectado',
         desde  = now()
   where estado <> 'desconectado'
     and ultima_senal < now() - make_interval(mins => public.minutos_sin_senal());
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'desconectar-inactivos') then
    perform cron.unschedule('desconectar-inactivos');
  end if;
  perform cron.schedule('desconectar-inactivos', '*/2 * * * *',
                        'select public.desconectar_inactivos();');
end $$;

-- ------------------------------------------------------------
-- 6) El reparto solo a gestores en línea
-- ------------------------------------------------------------
-- Si nadie está en línea devuelve null y los dos repartos
-- (repartir_caso, repartir_kyc_reenvio) dejan el caso en la cola
-- general, sin dueño, para el primero que lo tome.
--
-- Transición: mientras ningún gestor haya usado todavía la
-- disponibilidad (panel anterior), se reparte como antes, para que
-- aplicar esta migración no deje los casos sin asignar.
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
  en_uso as (
    select exists (
      select 1 from public.disponibilidad_personal d
        join public.users u on u.id = d.user_id
       where u.rol = 'gestor'
    ) as si
  ),
  gestores as (
    select u.id
      from public.users u
      left join public.disponibilidad_personal d on d.user_id = u.id
      cross join en_uso
     where u.rol = 'gestor'
       and u.estado = 'activo'
       and (
         not en_uso.si
         or public.disponibilidad_vigente(d.estado, d.ultima_senal) = 'en_linea'
       )
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
-- 7) Equipo muestra el estado de cada uno
-- ------------------------------------------------------------
-- Cambia lo que devuelve: hay que borrarla y crearla de nuevo.
drop function if exists public.listar_equipo();
create function public.listar_equipo()
returns table (
  id uuid, email text, rol text, estado text, sede_id uuid, sede text, created_at timestamptz,
  disponibilidad text, disponibilidad_desde timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.rol::text, u.estado::text,
         u.sede_id, s.nombre, u.created_at,
         public.disponibilidad_vigente(d.estado, d.ultima_senal),
         case
           when public.disponibilidad_vigente(d.estado, d.ultima_senal) = d.estado then d.desde
           else d.ultima_senal + make_interval(mins => public.minutos_sin_senal())
         end
    from public.users u
    left join public.sedes s on s.id = u.sede_id
    left join public.disponibilidad_personal d on d.user_id = u.id
   where u.rol <> 'cliente'
     and public.es_supervisor()
     and (public.es_admin() or u.sede_id = public.mi_sede())
   order by u.rol, u.email;
$$;

-- ------------------------------------------------------------
-- 8) Permisos
-- ------------------------------------------------------------
revoke execute on function public.fijar_disponibilidad(text) from public, anon;
revoke execute on function public.senal_disponibilidad() from public, anon;
revoke execute on function public.desconectar_inactivos() from public, anon, authenticated;
revoke execute on function public.listar_equipo() from public, anon;
grant execute on function public.fijar_disponibilidad(text) to authenticated;
grant execute on function public.senal_disponibilidad() to authenticated;
grant execute on function public.listar_equipo() to authenticated;
grant execute on function public.disponibilidad_vigente(text, timestamptz) to authenticated;
grant execute on function public.minutos_sin_senal() to authenticated;

notify pgrst, 'reload schema';
