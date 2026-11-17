-- ============================================================
--  IDENTIDAD, LISTA DE BLOQUEO Y CUENTAS DUPLICADAS
--
--  1) Nombre contra DNI
--     La función verificar-dni (Supabase) consulta el DNI en un
--     proveedor gratuito (Decolecta o APIsPERU) y compara el nombre
--     oficial con el que escribió el cliente. El resultado queda en
--     revision_identidad. No bloquea: avisa al personal.
--     Cada DNI se consulta una sola vez (consultas_dni), para no gastar
--     la cuota gratuita del proveedor.
--
--  2) Lista de bloqueo
--     DNI, celulares y cuentas bancarias de casos de fraude ya
--     confirmados. Si vuelven a aparecer en otro cliente, se avisa.
--
--  3) Datos compartidos
--     El mismo celular o la misma cuenta de depósito registrados por
--     más de un cliente.
--
--  Todo se muestra como alertas en Verificación, Clientes y
--  Solicitudes (función alertas_cliente). El personal decide.
-- ============================================================

-- Solo dígitos (DNI, cuentas). Para celulares, los últimos 9.
create or replace function public.solo_digitos(p text)
returns text
language sql
immutable
as $$ select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), ''); $$;

create or replace function public.celular_norm(p text)
returns text
language sql
immutable
as $$ select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), ''); $$;


-- ------------------------------------------------------------
-- 1) Nombre contra DNI
-- ------------------------------------------------------------
create table if not exists public.consultas_dni (
  dni              text primary key,
  encontrado       boolean not null,
  nombres          text,
  apellido_paterno text,
  apellido_materno text,
  fuente           text not null,
  consultado_en    timestamptz not null default now()
);
alter table public.consultas_dni enable row level security;
revoke all on public.consultas_dni from anon, authenticated;

create table if not exists public.revision_identidad (
  user_id           uuid primary key references public.users(id) on delete cascade,
  dni               text not null,
  nombre_registrado text,
  nombre_oficial    text,
  -- coincide | parcial | no_coincide | no_encontrado | no_aplica | error
  resultado         text not null,
  detalle           text,
  fuente            text,
  revisado_en       timestamptz not null default now()
);
alter table public.revision_identidad enable row level security;
revoke all on public.revision_identidad from anon, authenticated;
grant select on public.revision_identidad to authenticated;

drop policy if exists revision_identidad_lectura on public.revision_identidad;
create policy revision_identidad_lectura on public.revision_identidad
  for select to authenticated
  using (public.es_staff() or public.es_pagos());


-- ------------------------------------------------------------
-- 2) Lista de bloqueo
-- ------------------------------------------------------------
create table if not exists public.lista_bloqueo (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('dni', 'celular', 'cuenta')),
  valor       text not null,
  motivo      text not null,
  cliente_id  uuid references public.users(id) on delete set null,  -- de quién salió el dato
  creado_por  uuid references public.users(id),
  creado_en   timestamptz not null default now(),
  activo      boolean not null default true,
  quitado_por uuid references public.users(id),
  quitado_en  timestamptz
);
create unique index if not exists lista_bloqueo_unico on public.lista_bloqueo (tipo, valor) where activo;

alter table public.lista_bloqueo enable row level security;
revoke all on public.lista_bloqueo from anon, authenticated;
grant select on public.lista_bloqueo to authenticated;

drop policy if exists lista_bloqueo_lectura on public.lista_bloqueo;
create policy lista_bloqueo_lectura on public.lista_bloqueo
  for select to authenticated
  using (public.es_supervisor());

-- Agregar un dato a mano (administrador o supervisor).
create or replace function public.agregar_bloqueo(p_tipo text, p_valor text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_valor  text;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not public.es_supervisor() then
    raise exception 'La lista de bloqueo la manejan el supervisor y el administrador.' using errcode = '42501';
  end if;
  if p_tipo not in ('dni', 'celular', 'cuenta') then
    raise exception 'Tipo no válido.' using errcode = 'P0001';
  end if;
  v_valor := case when p_tipo = 'celular' then public.celular_norm(p_valor) else public.solo_digitos(p_valor) end;
  if v_valor is null
     or (p_tipo = 'dni' and length(v_valor) not between 8 and 12)
     or (p_tipo = 'celular' and length(v_valor) <> 9)
     or (p_tipo = 'cuenta' and length(v_valor) < 8) then
    raise exception 'Revisa el número: no tiene el largo de un % válido.', p_tipo using errcode = 'P0001';
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Escribe el motivo (al menos 10 letras).' using errcode = 'P0001';
  end if;

  insert into public.lista_bloqueo (tipo, valor, motivo, creado_por)
  values (p_tipo, v_valor, v_motivo, auth.uid())
  on conflict (tipo, valor) where activo do nothing;

  insert into public.auditoria_logs (usuario_id, accion, entidad, datos_despues)
  values (auth.uid(), 'AGREGAR_LISTA_BLOQUEO', 'lista_bloqueo', jsonb_build_object('tipo', p_tipo, 'valor', v_valor, 'motivo', v_motivo));

  return jsonb_build_object('ok', true);
end;
$$;

-- Pasar a la lista el DNI, el celular y las cuentas de un cliente.
create or replace function public.bloquear_datos_cliente(p_user uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_perfil record;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_n      integer := 0;
  v_c      record;
begin
  if not public.es_supervisor() then
    raise exception 'La lista de bloqueo la manejan el supervisor y el administrador.' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Escribe el motivo (al menos 10 letras).' using errcode = 'P0001';
  end if;
  select id, dni, telefono into v_perfil from public.perfiles_cliente where user_id = p_user;
  if v_perfil.id is null then
    raise exception 'Ese cliente no tiene perfil.' using errcode = 'P0001';
  end if;

  if public.solo_digitos(v_perfil.dni) is not null then
    insert into public.lista_bloqueo (tipo, valor, motivo, cliente_id, creado_por)
    values ('dni', public.solo_digitos(v_perfil.dni), v_motivo, p_user, auth.uid())
    on conflict (tipo, valor) where activo do nothing;
    v_n := v_n + 1;
  end if;
  if public.celular_norm(v_perfil.telefono) is not null then
    insert into public.lista_bloqueo (tipo, valor, motivo, cliente_id, creado_por)
    values ('celular', public.celular_norm(v_perfil.telefono), v_motivo, p_user, auth.uid())
    on conflict (tipo, valor) where activo do nothing;
    v_n := v_n + 1;
  end if;
  for v_c in select distinct public.solo_digitos(numero_cuenta) as n from public.cuentas_bancarias where cliente_id = v_perfil.id loop
    if v_c.n is not null then
      insert into public.lista_bloqueo (tipo, valor, motivo, cliente_id, creado_por)
      values ('cuenta', v_c.n, v_motivo, p_user, auth.uid())
      on conflict (tipo, valor) where activo do nothing;
      v_n := v_n + 1;
    end if;
  end loop;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'BLOQUEAR_DATOS_CLIENTE', 'lista_bloqueo', p_user, jsonb_build_object('datos', v_n, 'motivo', v_motivo));

  return jsonb_build_object('ok', true, 'datos', v_n);
end;
$$;

create or replace function public.quitar_bloqueo(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.es_supervisor() then
    raise exception 'La lista de bloqueo la manejan el supervisor y el administrador.' using errcode = '42501';
  end if;
  update public.lista_bloqueo set activo = false, quitado_por = auth.uid(), quitado_en = now()
  where id = p_id and activo;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id)
  values (auth.uid(), 'QUITAR_LISTA_BLOQUEO', 'lista_bloqueo', p_id);

  return jsonb_build_object('ok', true);
end;
$$;


-- ------------------------------------------------------------
-- 3) Alertas de un cliente (identidad, lista de bloqueo, datos
--    compartidos). p_id puede ser el usuario o su perfil.
-- ------------------------------------------------------------
create or replace function public.alertas_cliente(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_p      record;
  v_rev    record;
  v_out    jsonb := '[]'::jsonb;
  v_b      record;
  v_otros  jsonb;
  v_cuenta record;
begin
  if not (public.es_staff() or public.es_pagos()) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select p.id, p.user_id, p.dni, p.telefono, p.tipo_documento
    into v_p
  from public.perfiles_cliente p
  where p.user_id = p_id or p.id = p_id
  limit 1;
  if v_p.id is null then return jsonb_build_object('alertas', v_out, 'identidad', null); end if;

  -- Identidad
  select * into v_rev from public.revision_identidad where user_id = v_p.user_id;
  if v_rev.user_id is not null and v_rev.dni = public.solo_digitos(v_p.dni) then
    if v_rev.resultado = 'no_coincide' then
      v_out := v_out || jsonb_build_object('nivel', 'rojo', 'tipo', 'identidad',
        'texto', 'El nombre registrado no coincide con el del DNI. Según el DNI: ' || coalesce(v_rev.nombre_oficial, '—') || '.');
    elsif v_rev.resultado = 'parcial' then
      v_out := v_out || jsonb_build_object('nivel', 'amarillo', 'tipo', 'identidad',
        'texto', 'El nombre coincide solo en parte con el DNI. Según el DNI: ' || coalesce(v_rev.nombre_oficial, '—') || '.');
    elsif v_rev.resultado = 'no_encontrado' then
      v_out := v_out || jsonb_build_object('nivel', 'rojo', 'tipo', 'identidad',
        'texto', 'El DNI ' || v_rev.dni || ' no aparece en la consulta: puede no existir.');
    end if;
  end if;

  -- Lista de bloqueo
  for v_b in
    select tipo, valor, motivo from public.lista_bloqueo
    where activo and coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_p.user_id
      and ((tipo = 'dni' and valor = public.solo_digitos(v_p.dni))
        or (tipo = 'celular' and valor = public.celular_norm(v_p.telefono))
        or (tipo = 'cuenta' and valor in (select public.solo_digitos(numero_cuenta) from public.cuentas_bancarias where cliente_id = v_p.id)))
  loop
    v_out := v_out || jsonb_build_object('nivel', 'rojo', 'tipo', 'bloqueo',
      'texto', case v_b.tipo when 'dni' then 'Su DNI' when 'celular' then 'Su celular' else 'Su cuenta ' || v_b.valor end
               || ' está en la lista de bloqueo. Motivo: ' || v_b.motivo);
  end loop;

  -- El mismo celular en otros clientes
  if public.celular_norm(v_p.telefono) is not null then
    select jsonb_agg(jsonb_build_object('user_id', o.user_id, 'nombre', trim(coalesce(o.nombres, '') || ' ' || coalesce(o.apellidos, '')), 'dni', o.dni))
      into v_otros
    from public.perfiles_cliente o
    where o.id <> v_p.id and public.celular_norm(o.telefono) = public.celular_norm(v_p.telefono);
    if v_otros is not null then
      v_out := v_out || jsonb_build_object('nivel', 'amarillo', 'tipo', 'celular',
        'texto', 'Su celular también lo registró otro cliente.', 'otros', v_otros);
    end if;
  end if;

  -- La misma cuenta de depósito en otros clientes
  for v_cuenta in
    select distinct c.banco, public.solo_digitos(c.numero_cuenta) as n
    from public.cuentas_bancarias c where c.cliente_id = v_p.id and public.solo_digitos(c.numero_cuenta) is not null
  loop
    select jsonb_agg(distinct jsonb_build_object('user_id', o.user_id, 'nombre', trim(coalesce(o.nombres, '') || ' ' || coalesce(o.apellidos, '')), 'dni', o.dni))
      into v_otros
    from public.cuentas_bancarias c2
    join public.perfiles_cliente o on o.id = c2.cliente_id
    where c2.cliente_id <> v_p.id and public.solo_digitos(c2.numero_cuenta) = v_cuenta.n;
    if v_otros is not null then
      v_out := v_out || jsonb_build_object('nivel', 'rojo', 'tipo', 'cuenta',
        'texto', 'Su cuenta ' || v_cuenta.banco || ' terminada en ' || right(v_cuenta.n, 4) || ' también la registró otro cliente.', 'otros', v_otros);
    end if;
  end loop;

  return jsonb_build_object(
    'user_id', v_p.user_id,
    'alertas', v_out,
    'identidad', case when v_rev.user_id is null or v_rev.dni <> public.solo_digitos(v_p.dni) then null
                      else jsonb_build_object('resultado', v_rev.resultado, 'nombre_oficial', v_rev.nombre_oficial,
                                              'detalle', v_rev.detalle, 'revisado_en', v_rev.revisado_en) end,
    'dni_peruano', coalesce(v_p.tipo_documento, 'dni') <> 'ce'
  );
end;
$$;

revoke all on function public.agregar_bloqueo(text, text, text) from public, anon;
revoke all on function public.bloquear_datos_cliente(uuid, text) from public, anon;
revoke all on function public.quitar_bloqueo(uuid) from public, anon;
revoke all on function public.alertas_cliente(uuid) from public, anon;
grant execute on function public.agregar_bloqueo(text, text, text) to authenticated;
grant execute on function public.bloquear_datos_cliente(uuid, text) to authenticated;
grant execute on function public.quitar_bloqueo(uuid) to authenticated;
grant execute on function public.alertas_cliente(uuid) to authenticated;

-- Permisos detallados (migración 078): la lista de bloqueo es una parte de Clientes.
insert into public.permisos_api (objeto, clave, escritura) values
  ('rpc/agregar_bloqueo',        'clientes.lista-bloqueo', true),
  ('rpc/bloquear_datos_cliente', 'clientes.lista-bloqueo', true),
  ('rpc/quitar_bloqueo',         'clientes.lista-bloqueo', true)
on conflict (objeto, clave) do nothing;
