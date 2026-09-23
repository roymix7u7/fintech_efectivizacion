-- ============================================================
--  COMISIONES POR BLOQUES
--
--  Antes habia dos niveles sueltos: una tarifa general por banco y
--  una especial por cliente. La tarifa que el gestor escribia al
--  aprobar la identidad era un tercer numero que no se conectaba
--  con ninguno de los dos.
--
--  Ahora hay bloques. Un bloque es un juego completo de tarifas,
--  una por banco: "General" para la mayoria, y los que hagan falta
--  para otros tipos de cliente. El gestor, al aprobar, solo elige a
--  que bloque pertenece; no inventa numeros.
--
--  Quien manda sobre la tarifa de un cliente en un banco:
--
--    1. su comision especial, si tiene           (supervisor o admin)
--    2. la tarifa del bloque al que pertenece    (admin)
--    3. la tarifa general vieja, si quedo alguna (compatibilidad)
--    4. su tasa suelta del perfil                (compatibilidad)
--
--  Por eso cambiar un bloque mueve a todos sus clientes de una vez,
--  pero nunca pisa a quien tiene una especial: esa se quito a mano y
--  volver a ponerla tambien es a mano.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Bloques y sus tarifas
-- ------------------------------------------------------------
create table if not exists public.bloques_comision (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  descripcion     text,
  es_default      boolean not null default false,
  activo          boolean not null default true,
  creado_por      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Un solo bloque predeterminado: el que reciben los clientes que
-- nadie clasifico.
create unique index if not exists bloques_comision_default_unico
  on public.bloques_comision (es_default) where es_default;

create table if not exists public.bloques_comision_banco (
  bloque_id   uuid not null references public.bloques_comision(id) on delete cascade,
  banco       text not null,
  porcentaje  numeric(5,2) not null
                check (porcentaje >= 0 and porcentaje <= 100),
  updated_at  timestamptz not null default now(),
  primary key (bloque_id, banco)
);

alter table public.perfiles_cliente
  add column if not exists bloque_id uuid references public.bloques_comision(id);

create index if not exists perfiles_bloque_idx
  on public.perfiles_cliente (bloque_id);

drop trigger if exists tr_bloques_updated on public.bloques_comision;
create trigger tr_bloques_updated
  before update on public.bloques_comision
  for each row execute function public.update_updated_at();

drop trigger if exists tr_bloques_banco_updated on public.bloques_comision_banco;
create trigger tr_bloques_banco_updated
  before update on public.bloques_comision_banco
  for each row execute function public.update_updated_at();


-- ------------------------------------------------------------
-- 2) El bloque General, armado con lo que ya existia
--    Se copian las tarifas generales por banco que ya estaban
--    puestas, para que nadie cambie de tarifa por esta migracion.
-- ------------------------------------------------------------
insert into public.bloques_comision (nombre, descripcion, es_default)
select 'General', 'Tarifas por banco para la mayoría de clientes.', true
where not exists (select 1 from public.bloques_comision);

insert into public.bloques_comision_banco (bloque_id, banco, porcentaje)
select b.id, c.banco, c.porcentaje
from public.bloques_comision b
cross join public.comisiones_banco c
where b.es_default
on conflict (bloque_id, banco) do nothing;

-- Los clientes que no tienen bloque pasan al predeterminado.
update public.perfiles_cliente p
   set bloque_id = (select id from public.bloques_comision where es_default limit 1)
 where p.bloque_id is null;


-- ------------------------------------------------------------
-- 3) La tarifa que aplica de verdad
-- ------------------------------------------------------------
create or replace function public.comision_efectiva(
  p_cliente uuid,
  p_banco   text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select porcentaje from public.comisiones_cliente
      where cliente_id = p_cliente and banco = p_banco),
    (select bb.porcentaje
       from public.perfiles_cliente p
       join public.bloques_comision_banco bb on bb.bloque_id = p.bloque_id
      where p.id = p_cliente and bb.banco = p_banco),
    (select porcentaje from public.comisiones_banco
      where banco = p_banco and activa = true),
    (select tasa_comision from public.perfiles_cliente where id = p_cliente),
    0
  );
$$;

/** De donde sale esa tarifa. Sirve para explicarla en pantalla. */
create or replace function public.origen_comision(
  p_cliente uuid,
  p_banco   text
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.comisiones_cliente
                  where cliente_id = p_cliente and banco = p_banco) then 'especial'
    when exists (select 1 from public.perfiles_cliente p
                  join public.bloques_comision_banco bb on bb.bloque_id = p.bloque_id
                 where p.id = p_cliente and bb.banco = p_banco) then 'bloque'
    when exists (select 1 from public.comisiones_banco
                  where banco = p_banco and activa = true) then 'general'
    else 'perfil'
  end;
$$;


-- ------------------------------------------------------------
-- 4) Lo que ve el cliente en "Mis datos"
--    Devuelve su tarifa banco por banco, marcando primero los
--    bancos donde tiene tarjeta aprobada, que son los que usa.
-- ------------------------------------------------------------
create or replace function public.mis_comisiones()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_cliente uuid;
  v_bloque  text;
begin
  select id into v_cliente from public.perfiles_cliente where user_id = auth.uid();
  if v_cliente is null then
    return jsonb_build_object('bloque', null, 'bancos', '[]'::jsonb);
  end if;

  select b.nombre into v_bloque
  from public.perfiles_cliente p
  join public.bloques_comision b on b.id = p.bloque_id
  where p.id = v_cliente;

  return jsonb_build_object(
    'bloque', v_bloque,
    'bancos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'banco', x.banco,
               'porcentaje', public.comision_efectiva(v_cliente, x.banco),
               'especial', public.origen_comision(v_cliente, x.banco) = 'especial',
               'con_tarjeta', x.con_tarjeta
             ) order by x.con_tarjeta desc, x.banco)
      from (
        select bb.banco,
               exists (select 1 from public.tarjetas t
                        where t.cliente_id = v_cliente and t.activa = true
                          and t.estado = 'aprobado' and t.banco = bb.banco) as con_tarjeta
        from (
          select banco from public.bloques_comision_banco bb2
          join public.perfiles_cliente p on p.bloque_id = bb2.bloque_id
          where p.id = v_cliente
          union
          select banco from public.comisiones_cliente where cliente_id = v_cliente
          union
          select banco from public.tarjetas
           where cliente_id = v_cliente and activa = true and estado = 'aprobado'
        ) bb
      ) x
    ), '[]'::jsonb)
  );
end;
$$;


-- ------------------------------------------------------------
-- 5) Mantenimiento de bloques (admin)
-- ------------------------------------------------------------
create or replace function public.listar_bloques()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.es_supervisor() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id,
      'nombre', b.nombre,
      'descripcion', b.descripcion,
      'es_default', b.es_default,
      'activo', b.activo,
      'clientes', (select count(*) from public.perfiles_cliente p where p.bloque_id = b.id),
      'bancos', coalesce((
        select jsonb_agg(jsonb_build_object('banco', bb.banco, 'porcentaje', bb.porcentaje)
                         order by bb.banco)
        from public.bloques_comision_banco bb where bb.bloque_id = b.id
      ), '[]'::jsonb)
    ) order by b.es_default desc, b.nombre)
    from public.bloques_comision b
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;

/** Crea o renombra un bloque. Devuelve su id. */
create or replace function public.guardar_bloque(
  p_id          uuid,
  p_nombre      text,
  p_descripcion text default null,
  p_activo      boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador cambia los bloques.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El bloque necesita un nombre de al menos 3 letras.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.bloques_comision (nombre, descripcion, creado_por)
    values (trim(p_nombre), p_descripcion, auth.uid())
    returning id into v_id;
  else
    update public.bloques_comision
       set nombre = trim(p_nombre), descripcion = p_descripcion, activo = p_activo
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

/** Pone la tarifa de un banco dentro de un bloque. */
create or replace function public.guardar_tarifa_bloque(
  p_bloque     uuid,
  p_banco      text,
  p_porcentaje numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador cambia las tarifas de un bloque.' using errcode = '42501';
  end if;
  if p_porcentaje is null or p_porcentaje < 0 or p_porcentaje > 100 then
    raise exception 'El porcentaje debe estar entre 0 y 100.' using errcode = 'P0001';
  end if;

  insert into public.bloques_comision_banco (bloque_id, banco, porcentaje)
  values (p_bloque, p_banco, p_porcentaje)
  on conflict (bloque_id, banco) do update set porcentaje = excluded.porcentaje;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'TARIFA_BLOQUE', 'bloques_comision', p_bloque,
          jsonb_build_object('banco', p_banco, 'porcentaje', p_porcentaje));
end;
$$;

/**
 * Mueve clientes de bloque.
 *
 * Es el cambio masivo: al cambiar la tarifa del bloque cambian todos
 * los que estan dentro. Los que tienen comision especial en un banco
 * conservan esa especial, por definicion.
 */
create or replace function public.asignar_bloque(
  p_clientes uuid[],
  p_bloque   uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador mueve clientes de bloque.' using errcode = '42501';
  end if;

  update public.perfiles_cliente
     set bloque_id = p_bloque
   where id = any(p_clientes);
  get diagnostics v_n = row_count;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'ASIGNAR_BLOQUE', 'perfiles_cliente', p_bloque,
          jsonb_build_object('clientes', v_n));
  return v_n;
end;
$$;


-- ------------------------------------------------------------
-- 6) Comision especial de un cliente (supervisor o admin)
--    Es el ajuste fino, uno por uno. Queda fuera de los cambios
--    masivos a proposito: se puso a mano y se quita a mano.
-- ------------------------------------------------------------
create or replace function public.fijar_comision_especial(
  p_cliente    uuid,
  p_banco      text,
  p_porcentaje numeric,
  p_motivo     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_supervisor() then
    raise exception 'Solo un supervisor o el administrador cambian una comisión individual.'
      using errcode = '42501';
  end if;
  if p_porcentaje is null or p_porcentaje < 0 or p_porcentaje > 100 then
    raise exception 'El porcentaje debe estar entre 0 y 100.' using errcode = 'P0001';
  end if;

  insert into public.comisiones_cliente (cliente_id, banco, porcentaje, motivo, asignado_por)
  values (p_cliente, p_banco, p_porcentaje, nullif(trim(coalesce(p_motivo, '')), ''), auth.uid())
  on conflict (cliente_id, banco) do update
    set porcentaje = excluded.porcentaje,
        motivo = excluded.motivo,
        asignado_por = excluded.asignado_por;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'COMISION_ESPECIAL', 'comisiones_cliente', p_cliente,
          jsonb_build_object('banco', p_banco, 'porcentaje', p_porcentaje));
end;
$$;

/** Quita la especial: el cliente vuelve a la tarifa de su bloque. */
create or replace function public.quitar_comision_especial(
  p_banco    text,
  p_clientes uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.es_supervisor() then
    raise exception 'Solo un supervisor o el administrador quitan una comisión individual.'
      using errcode = '42501';
  end if;

  delete from public.comisiones_cliente
   where banco = p_banco and cliente_id = any(p_clientes);
  get diagnostics v_n = row_count;

  insert into public.auditoria_logs (usuario_id, accion, entidad, datos_despues)
  values (auth.uid(), 'QUITAR_COMISION_ESPECIAL', 'comisiones_cliente',
          jsonb_build_object('banco', p_banco, 'clientes', v_n));
  return v_n;
end;
$$;

/** Quien tiene tarifas especiales, para que el admin las vea juntas. */
create or replace function public.listar_especiales()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.es_supervisor() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'cliente_id', c.cliente_id,
      'nombres', p.nombres,
      'apellidos', p.apellidos,
      'dni', p.dni,
      'banco', c.banco,
      'porcentaje', c.porcentaje,
      'motivo', c.motivo,
      'bloque', b.nombre,
      'tarifa_bloque', (select bb.porcentaje from public.bloques_comision_banco bb
                         where bb.bloque_id = p.bloque_id and bb.banco = c.banco),
      'asignado_por', (select u.email from public.users u where u.id = c.asignado_por),
      'actualizado', c.updated_at
    ) order by p.apellidos, c.banco)
    from public.comisiones_cliente c
    join public.perfiles_cliente p on p.id = c.cliente_id
    left join public.bloques_comision b on b.id = p.bloque_id
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;


-- ------------------------------------------------------------
-- 7) Permisos
-- ------------------------------------------------------------
alter table public.bloques_comision enable row level security;
alter table public.bloques_comision_banco enable row level security;

drop policy if exists bloques_lectura on public.bloques_comision;
create policy bloques_lectura on public.bloques_comision
  for select to authenticated using (public.es_staff());

drop policy if exists bloques_banco_lectura on public.bloques_comision_banco;
create policy bloques_banco_lectura on public.bloques_comision_banco
  for select to authenticated using (public.es_staff());

grant select on public.bloques_comision to authenticated;
grant select on public.bloques_comision_banco to authenticated;

-- La escritura pasa solo por las funciones de arriba, que comprueban
-- el rol por su cuenta.
drop policy if exists comisiones_cliente_escritura on public.comisiones_cliente;
create policy comisiones_cliente_escritura on public.comisiones_cliente
  for all to authenticated
  using (public.es_supervisor()) with check (public.es_supervisor());

grant execute on function public.mis_comisiones() to authenticated;
grant execute on function public.origen_comision(uuid, text) to authenticated;
grant execute on function public.listar_bloques() to authenticated;
grant execute on function public.listar_especiales() to authenticated;
grant execute on function public.guardar_bloque(uuid, text, text, boolean) to authenticated;
grant execute on function public.guardar_tarifa_bloque(uuid, text, numeric) to authenticated;
grant execute on function public.asignar_bloque(uuid[], uuid) to authenticated;
grant execute on function public.fijar_comision_especial(uuid, text, numeric, text) to authenticated;
grant execute on function public.quitar_comision_especial(text, uuid[]) to authenticated;

revoke execute on function public.mis_comisiones() from anon;
revoke execute on function public.listar_bloques() from anon;
revoke execute on function public.listar_especiales() from anon;

notify pgrst, 'reload schema';
