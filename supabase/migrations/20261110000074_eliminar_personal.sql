-- ============================================================
--  ELIMINAR PERSONAL (Equipo → Eliminar)
-- ============================================================
--  La función eliminar-staff (Supabase) comprueba que quien pide sea
--  administrador y llama a dar_de_baja_personal con la clave de servicio:
--
--  · Primero suelta lo que la persona tenía tomado (clientes, solicitudes
--    y tarjetas asignadas vuelven a la cola).
--  · Si nunca hizo nada en el sistema (cuenta de prueba sin uso), se
--    BORRA por completo → devuelve 'borrar' y la función borra su acceso.
--  · Si ya tiene trabajo registrado (revisó, pagó, aparece en la
--    auditoría...), se da de BAJA: queda bloqueada, sale de la lista de
--    Equipo y su correo se libera para poder crear otra cuenta con él.
--    Su historial se conserva → devuelve 'baja'.
--
--  Se puede ejecutar más de una vez.
-- ============================================================

begin;

alter table public.users add column if not exists baja_en timestamptz;

-- Equipo ya no muestra a quien fue dado de baja.
create or replace function public.listar_equipo()
returns table(id uuid, email text, rol text, estado text, sede_id uuid, sede text, created_at timestamptz,
              disponibilidad text, disponibilidad_desde timestamptz, atiende_chat boolean)
language sql
stable security definer
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
     and u.baja_en is null
     and public.es_supervisor()
     and (public.es_admin() or u.sede_id = public.mi_sede())
   order by u.rol, u.email;
$$;

-- ¿En cuántos registros aparece esta persona como autora? Recorre todas
-- las claves foráneas hacia users que impiden borrar (no las que se borran
-- o se vacían solas), así una tabla nueva queda cubierta sin tocar esto.
create or replace function public.actividad_personal(p_user uuid)
returns bigint
language plpgsql
stable security definer
set search_path = public
as $$
declare
  fk record;
  v_total bigint := 0;
  v_n bigint;
begin
  for fk in
    select c.conrelid::regclass as tabla, a.attname as columna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.confrelid in ('public.users'::regclass, 'auth.users'::regclass)
       and c.confdeltype in ('a', 'r')
       and c.connamespace = 'public'::regnamespace
  loop
    execute format('select count(*) from %s where %I = $1', fk.tabla, fk.columna) into v_n using p_user;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end;
$$;

create or replace function public.dar_de_baja_personal(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.users%rowtype;
begin
  select * into v_u from public.users where id = p_user for update;
  if not found then
    return 'no_existe';
  end if;
  if v_u.rol = 'cliente' then
    raise exception 'Esta cuenta es de un cliente, no del personal.' using errcode = '22023';
  end if;
  if v_u.baja_en is not null then
    return 'baja'; -- ya estaba: se puede repetir sin efecto
  end if;

  -- Lo que tenía tomado vuelve a la cola.
  update public.users set asignado_a = null where asignado_a = p_user;
  update public.solicitudes set asignado_a = null where asignado_a = p_user;
  update public.tarjetas set asignado_a = null where asignado_a = p_user;

  if public.actividad_personal(p_user) = 0 then
    delete from public.users where id = p_user;
    return 'borrar';
  end if;

  update public.users
     set estado = 'bloqueado',
         baja_en = now(),
         -- El correo queda libre para otra cuenta; aquí se sigue leyendo quién era.
         email = v_u.email || ' (baja ' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD') || ' ' || left(p_user::text, 8) || ')'
   where id = p_user;
  delete from public.chat_personal where user_id = p_user;
  return 'baja';
end;
$$;

revoke execute on function public.actividad_personal(uuid) from public, anon, authenticated;
revoke execute on function public.dar_de_baja_personal(uuid) from public, anon, authenticated;
grant execute on function public.actividad_personal(uuid) to service_role;
grant execute on function public.dar_de_baja_personal(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
