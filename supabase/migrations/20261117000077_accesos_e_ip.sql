-- ============================================================
--  ACCESOS POR PANTALLA Y RESTRICCIÓN POR IP DEL PERSONAL
--
--  1) Accesos por pantalla
--     El rol (administrador, supervisor, gestor, pagos) sigue siendo el
--     perfil base y el tope de lo que la base de datos entrega. Encima,
--     el administrador puede, persona por persona, quitar una pantalla
--     ("no") o dejarla en solo lectura ("ver"). Lo que no se toca queda
--     como lo trae el rol. Nunca da más de lo que el rol permite.
--     Lo aplica el panel (menú, direcciones y botones de acción).
--
--  2) Restricción por IP
--     · Cada sede puede tener sus IP (sedes.ips).
--     · Cada persona puede quedar: libre (sin nada), atada a las IP de
--       su sede (ip_sede), con IP propias (ips), o las dos cosas.
--     Se aplica en la base de datos, no solo en el panel: es_staff(),
--     es_supervisor(), es_admin() y es_pagos() dejan de dar permiso si
--     la persona está restringida y la petición llega desde otra IP.
--     Así tampoco sirve entrar directo a la base con su usuario y clave
--     desde otro lugar.
--
--     Seguros para que nadie se quede fuera sin querer:
--       · Sin IP configuradas, todo sigue como antes.
--       · Atado a una sede que todavía no tiene IP = libre.
--       · El administrador no puede guardarse a sí mismo (ni a su sede,
--         si está atado a ella) una lista que excluya la IP desde la
--         que está conectado en ese momento.
--       · La consola SQL de Supabase y la clave de servicio no se ven
--         afectadas: desde ahí siempre se puede corregir.
--
--     Las rutas del servidor del panel (Vercel) y las funciones de
--     Supabase hablan con la base desde sus propias máquinas. Para que
--     se evalúe la IP de la persona y no la del servidor, mandan la IP
--     real junto con una clave; aquí solo se guarda la huella (SHA-256)
--     de esa clave, no la clave.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Datos
-- ------------------------------------------------------------
alter table public.sedes
  add column if not exists ips text[] not null default '{}';

create table if not exists public.permisos_personal (
  user_id         uuid primary key references public.users(id) on delete cascade,
  permisos        jsonb not null default '{}'::jsonb,   -- { "pantalla": "no" | "ver" }
  ip_sede         boolean not null default false,       -- atado a las IP de su sede
  ips             text[] not null default '{}',         -- IP propias (o rangos, 190.1.2.0/24)
  actualizado_por uuid references public.users(id),
  updated_at      timestamptz not null default now()
);

alter table public.permisos_personal enable row level security;

create table if not exists public.config_servidor (
  id         integer primary key default 1 check (id = 1),
  clave_hash text not null
);
alter table public.config_servidor enable row level security;
revoke all on public.config_servidor from anon, authenticated;

insert into public.config_servidor (id, clave_hash)
values (1, '8c18773107bb3007d173382fca971bb8816ea191f3e723fa3eab462fa302d574')
on conflict (id) do update set clave_hash = excluded.clave_hash;


-- ------------------------------------------------------------
-- 2) Desde qué IP llega la petición
-- ------------------------------------------------------------
create or replace function public.ip_actual()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  h     jsonb;
  clave text;
  v     text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  if h is null then return null; end if;

  -- Servidor de confianza (panel en Vercel, funciones de Supabase): manda la IP de la persona.
  clave := nullif(h ->> 'x-atk-clave', '');
  if clave is not null and exists (
    select 1 from public.config_servidor c
    where c.clave_hash = encode(sha256(convert_to(clave, 'UTF8')), 'hex')
  ) then
    v := nullif(trim(h ->> 'x-atk-ip'), '');
  end if;

  -- Petición directa del navegador: la IP que ve la entrada de Supabase.
  if v is null then
    v := coalesce(
      nullif(trim(h ->> 'cf-connecting-ip'), ''),
      nullif(trim(h ->> 'x-real-ip'), ''),
      nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), '')
    );
  end if;
  if v is null then return null; end if;

  begin
    return host(v::inet);
  exception when others then
    return null;
  end;
end;
$$;

-- ¿Está p_ip dentro de alguna de las IP o rangos de p_lista?
create or replace function public.ip_en_lista(p_ip text, p_lista text[])
returns boolean
language plpgsql
immutable
as $$
declare
  x  text;
  ip inet;
begin
  begin
    ip := p_ip::inet;
  exception when others then
    return false;
  end;
  if ip is null then return false; end if;
  foreach x in array coalesce(p_lista, '{}') loop
    begin
      if ip <<= x::inet then return true; end if;
    exception when others then
      null; -- una entrada mal escrita no deja pasar ni tumba la consulta
    end;
  end loop;
  return false;
end;
$$;

-- Las IP que valen para una persona (vacío = sin restricción).
create or replace function public.ips_de(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(p.ips, '{}')
         || case when coalesce(p.ip_sede, false)
                 then coalesce((select s.ips from public.sedes s where s.id = u.sede_id), '{}')
                 else '{}'::text[] end
  from public.users u
  left join public.permisos_personal p on p.user_id = u.id
  where u.id = p_user;
$$;

create or replace function public.ip_permitida()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  lista text[];
begin
  if public.es_servicio() then return true; end if;
  lista := public.ips_de(auth.uid());
  if lista is null or cardinality(lista) = 0 then return true; end if;
  return public.ip_en_lista(public.ip_actual(), lista);
end;
$$;


-- ------------------------------------------------------------
-- 3) Los permisos del personal dependen también de la IP
-- ------------------------------------------------------------
create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.es_servicio() or (coalesce((
    select rol in ('admin', 'supervisor', 'gestor') and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false) and public.ip_permitida());
$$;

create or replace function public.es_supervisor()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.es_servicio() or (coalesce((
    select rol in ('admin', 'supervisor') and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false) and public.ip_permitida());
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.es_servicio() or (coalesce((
    select rol = 'admin' and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false) and public.ip_permitida());
$$;

create or replace function public.es_pagos()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select rol = 'pagos' and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false) and public.ip_permitida();
$$;


-- ------------------------------------------------------------
-- 4) Lo que el panel pregunta al entrar
--    No depende de es_staff(): tiene que poder decirle a alguien que
--    está fuera de su red, y desde qué IP lo ve la base.
-- ------------------------------------------------------------
create or replace function public.mi_acceso()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'permisos', coalesce((select p.permisos from public.permisos_personal p where p.user_id = auth.uid()), '{}'::jsonb),
    'ip', public.ip_actual(),
    'restringida', cardinality(coalesce(public.ips_de(auth.uid()), '{}')) > 0,
    'permitida', public.ip_permitida()
  );
$$;


-- ------------------------------------------------------------
-- 5) Lo que configura el administrador
-- ------------------------------------------------------------
drop policy if exists permisos_personal_lectura on public.permisos_personal;
create policy permisos_personal_lectura on public.permisos_personal
  for select to authenticated
  using (user_id = auth.uid() or public.es_admin());

grant select on public.permisos_personal to authenticated;

-- Limpia y valida una lista de IP: sin repetidas, sin vacías, todas legibles.
create or replace function public.limpiar_ips(p_ips text[])
returns text[]
language plpgsql
immutable
as $$
declare
  x     text;
  v     text;
  salida text[] := '{}';
begin
  foreach x in array coalesce(p_ips, '{}') loop
    v := trim(x);
    if v = '' then continue; end if;
    begin
      perform v::inet;
    exception when others then
      raise exception 'La IP "%" no es válida. Ejemplo: 190.235.10.20', v using errcode = 'P0001';
    end;
    if not v = any (salida) then salida := salida || v; end if;
  end loop;
  if cardinality(salida) > 20 then
    raise exception 'Son demasiadas IP (máximo 20).' using errcode = 'P0001';
  end if;
  return salida;
end;
$$;

create or replace function public.guardar_acceso(
  p_user     uuid,
  p_permisos jsonb,
  p_ip_sede  boolean,
  p_ips      text[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol      text;
  v_sede     uuid;
  v_ips      text[];
  v_permisos jsonb := '{}'::jsonb;
  v_lista    text[];
  k          text;
  val        text;
begin
  if not public.es_admin() then
    raise exception 'Los accesos los configura el administrador.' using errcode = '42501';
  end if;

  select rol::text, sede_id into v_rol, v_sede from public.users where id = p_user;
  if v_rol is null or v_rol = 'cliente' then
    raise exception 'Esa persona no es del equipo.' using errcode = 'P0001';
  end if;

  -- Solo se guardan los recortes: "no" (no la ve) y "ver" (solo lectura).
  for k, val in select key, value from jsonb_each_text(coalesce(p_permisos, '{}'::jsonb)) loop
    if val in ('no', 'ver') and k ~ '^[a-z-]{1,40}$' then
      v_permisos := v_permisos || jsonb_build_object(k, val);
    end if;
  end loop;

  v_ips := public.limpiar_ips(p_ips);

  if p_user = auth.uid() then
    if v_permisos <> '{}'::jsonb then
      raise exception 'No puedes quitarte pantallas a ti mismo: pídeselo a otro administrador.' using errcode = 'P0001';
    end if;
    v_lista := v_ips || case when coalesce(p_ip_sede, false)
                             then coalesce((select s.ips from public.sedes s where s.id = v_sede), '{}')
                             else '{}'::text[] end;
    if cardinality(v_lista) > 0 and not public.ip_en_lista(public.ip_actual(), v_lista) then
      raise exception 'Te quedarías fuera: tu IP actual (%) no está en la lista. Agrégala antes de guardar.',
        coalesce(public.ip_actual(), 'no detectada') using errcode = 'P0001';
    end if;
  end if;

  insert into public.permisos_personal (user_id, permisos, ip_sede, ips, actualizado_por, updated_at)
  values (p_user, v_permisos, coalesce(p_ip_sede, false), v_ips, auth.uid(), now())
  on conflict (user_id) do update
    set permisos = excluded.permisos,
        ip_sede = excluded.ip_sede,
        ips = excluded.ips,
        actualizado_por = excluded.actualizado_por,
        updated_at = now();

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'CAMBIAR_ACCESOS', 'permisos_personal', p_user,
          jsonb_build_object('permisos', v_permisos, 'ip_sede', coalesce(p_ip_sede, false), 'ips', v_ips));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.guardar_ips_sede(p_sede uuid, p_ips text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ips   text[];
  v_mias  record;
  v_lista text[];
begin
  if not public.es_admin() then
    raise exception 'Las IP de una sede las configura el administrador.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sedes where id = p_sede) then
    raise exception 'Esa sede no existe.' using errcode = 'P0001';
  end if;

  v_ips := public.limpiar_ips(p_ips);

  -- Si quien guarda está atado a esta sede, la lista nueva tiene que incluir su IP actual.
  select u.sede_id, coalesce(p.ip_sede, false) as ip_sede, coalesce(p.ips, '{}') as ips
    into v_mias
  from public.users u left join public.permisos_personal p on p.user_id = u.id
  where u.id = auth.uid();
  if v_mias.ip_sede and v_mias.sede_id = p_sede then
    v_lista := v_mias.ips || v_ips;
    if cardinality(v_lista) > 0 and not public.ip_en_lista(public.ip_actual(), v_lista) then
      raise exception 'Te quedarías fuera: tu IP actual (%) no está en la lista de tu sede. Agrégala antes de guardar.',
        coalesce(public.ip_actual(), 'no detectada') using errcode = 'P0001';
    end if;
  end if;

  update public.sedes set ips = v_ips, updated_at = now() where id = p_sede;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'CAMBIAR_IPS_SEDE', 'sedes', p_sede, jsonb_build_object('ips', v_ips));

  return jsonb_build_object('ok', true);
end;
$$;

-- Diagnóstico para el administrador: qué ve la base de la petición.
create or replace function public.ip_diagnostico()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  h jsonb;
begin
  if not public.es_admin() then return null; end if;
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  return jsonb_build_object(
    'ip', public.ip_actual(),
    'cf_connecting_ip', h ->> 'cf-connecting-ip',
    'x_real_ip', h ->> 'x-real-ip',
    'x_forwarded_for', h ->> 'x-forwarded-for',
    'por_servidor', (h ->> 'x-atk-ip') is not null
  );
end;
$$;

revoke all on function public.guardar_acceso(uuid, jsonb, boolean, text[]) from public, anon;
revoke all on function public.guardar_ips_sede(uuid, text[]) from public, anon;
revoke all on function public.mi_acceso() from public, anon;
revoke all on function public.ip_diagnostico() from public, anon;
grant execute on function public.guardar_acceso(uuid, jsonb, boolean, text[]) to authenticated;
grant execute on function public.guardar_ips_sede(uuid, text[]) to authenticated;
grant execute on function public.mi_acceso() to authenticated;
grant execute on function public.ip_diagnostico() to authenticated;

-- Las IP permitidas de otra persona no son para cualquiera: solo las usan las funciones de arriba.
revoke all on function public.ips_de(uuid) from public, anon, authenticated;
