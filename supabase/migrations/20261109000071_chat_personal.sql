-- ============================================================
--  QUIÉN DEL PERSONAL ATIENDE EL CHAT (Chatwoot)
-- ============================================================
--  El panel pasa a ser la única fuente del personal del chat: en Equipo
--  se marca "Atiende chat" y el panel lo invita a Chatwoot con su mismo
--  correo, su rol (supervisor → jefe, gestor → asesor) y su sede. Al
--  quitarle la marca o bloquearlo, sale del chat.
--
--  Va en una tabla propia y no en users: así nadie puede marcarse a sí
--  mismo (la protección de users deja que cada uno edite sus propias
--  columnas) y no se despiertan los paneles que escuchan users en vivo.
--  Solo se escribe con fijar_chat_personal(), con la misma regla que
--  bloquear: el administrador, sobre cualquiera del personal; el
--  supervisor, sobre los gestores de su sede.
--
--  Requiere la migración 070. Se puede ejecutar más de una vez.
-- ============================================================

create table if not exists public.chat_personal (
  user_id         uuid primary key references public.users(id) on delete cascade,
  activo          boolean not null default false,
  actualizado_por uuid references public.users(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);

comment on table public.chat_personal is
  'Quién del personal atiende el chat. Se escribe solo con fijar_chat_personal().';

alter table public.chat_personal enable row level security;

drop policy if exists chat_personal_lectura on public.chat_personal;
create policy chat_personal_lectura on public.chat_personal
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.es_admin())
    or (
      (select public.es_supervisor())
      and exists (
        select 1 from public.users u
         where u.id = chat_personal.user_id
           and u.sede_id is not distinct from (select public.mi_sede())
           and u.sede_id is not null
      )
    )
  );

revoke all on public.chat_personal from anon;
revoke insert, update, delete on public.chat_personal from authenticated;
grant select on public.chat_personal to authenticated;

-- ------------------------------------------------------------
-- Marcar o desmarcar a alguien
-- ------------------------------------------------------------
create or replace function public.fijar_chat_personal(p_user uuid, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino public.users;
begin
  select * into v_destino from public.users where id = p_user;
  if v_destino.id is null or v_destino.rol = 'cliente' then
    raise exception 'Esa persona no es del personal.' using errcode = '22023';
  end if;

  if not (
    public.es_admin()
    or (
      public.es_supervisor()
      and v_destino.rol = 'gestor'
      and v_destino.sede_id is not null
      and v_destino.sede_id is not distinct from public.mi_sede()
    )
  ) then
    raise exception 'No puedes cambiar quién atiende el chat de esa persona.' using errcode = '42501';
  end if;

  insert into public.chat_personal as c (user_id, activo, actualizado_por, actualizado_en)
  values (p_user, coalesce(p_activo, false), auth.uid(), now())
  on conflict (user_id) do update
     set activo          = excluded.activo,
         actualizado_por = excluded.actualizado_por,
         actualizado_en  = now();

  return jsonb_build_object('user_id', p_user, 'activo', coalesce(p_activo, false));
end;
$$;

-- ------------------------------------------------------------
-- Equipo devuelve también si atiende el chat
-- ------------------------------------------------------------
drop function if exists public.listar_equipo();
create function public.listar_equipo()
returns table (
  id uuid, email text, rol text, estado text, sede_id uuid, sede text, created_at timestamptz,
  disponibilidad text, disponibilidad_desde timestamptz, atiende_chat boolean
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
         end,
         coalesce(c.activo, false)
    from public.users u
    left join public.sedes s on s.id = u.sede_id
    left join public.disponibilidad_personal d on d.user_id = u.id
    left join public.chat_personal c on c.user_id = u.id
   where u.rol <> 'cliente'
     and public.es_supervisor()
     and (public.es_admin() or u.sede_id = public.mi_sede())
   order by u.rol, u.email;
$$;

revoke execute on function public.fijar_chat_personal(uuid, boolean) from public, anon;
revoke execute on function public.listar_equipo() from public, anon;
grant execute on function public.fijar_chat_personal(uuid, boolean) to authenticated;
grant execute on function public.listar_equipo() to authenticated;

notify pgrst, 'reload schema';
