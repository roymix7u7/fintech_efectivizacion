-- ============================================================
--  CUPONES CON VIGENCIA
--
--  La tarifa estándar (el bloque predeterminado) no es un cupón: es la
--  tarifa de siempre y no vence. Un cupón es cualquier otro bloque y
--  tiene una duración (por ejemplo 365 días). Al asignárselo a un
--  cliente se guarda desde y hasta cuándo rige; cuando vence, el
--  cliente vuelve solo a la tarifa estándar. No hace falta ningún
--  proceso programado: la vigencia se mira cada vez que se calcula.
--
--  Si un cupón no define un banco, ese banco se cobra con la tarifa
--  estándar (antes quedaba sin tarifa).
--
--  Además, el cliente ya no puede escribir su cupón ni sus fechas al
--  crear su perfil (antes solo se protegía al editarlo).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Duración del cupón y vigencia por cliente
-- ------------------------------------------------------------
alter table public.bloques_comision
  add column if not exists duracion_dias integer;
alter table public.bloques_comision
  drop constraint if exists bloques_duracion_valida;
alter table public.bloques_comision
  add constraint bloques_duracion_valida check (duracion_dias is null or duracion_dias between 1 and 3650);

alter table public.perfiles_cliente
  add column if not exists cupon_desde timestamptz,
  add column if not exists cupon_hasta timestamptz;

create index if not exists perfiles_cupon_hasta_idx on public.perfiles_cliente (cupon_hasta) where cupon_hasta is not null;


-- ------------------------------------------------------------
-- 2) El cupón que rige hoy para un cliente
--    Su bloque si es el estándar o si su cupón no venció; si no, el
--    estándar.
-- ------------------------------------------------------------
create or replace function public.bloque_vigente(p_cliente uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.bloque_id
       from public.perfiles_cliente p
       join public.bloques_comision b on b.id = p.bloque_id
      where p.id = p_cliente
        and (b.es_default or p.cupon_hasta is null or p.cupon_hasta > now())),
    (select id from public.bloques_comision where es_default limit 1)
  );
$$;

revoke all on function public.bloque_vigente(uuid) from public, anon;
grant execute on function public.bloque_vigente(uuid) to authenticated;


-- ------------------------------------------------------------
-- 3) La tarifa que aplica de verdad
--      1. su comisión especial
--      2. su cupón vigente
--      3. la tarifa estándar (si el cupón no tiene ese banco o venció)
--      4. compatibilidad con lo antiguo
-- ------------------------------------------------------------
create or replace function public.comision_efectiva(p_cliente uuid, p_banco text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select porcentaje from public.comisiones_cliente
      where cliente_id = p_cliente and banco = p_banco),
    (select bb.porcentaje from public.bloques_comision_banco bb
      where bb.bloque_id = public.bloque_vigente(p_cliente) and bb.banco = p_banco),
    (select bb.porcentaje from public.bloques_comision_banco bb
       join public.bloques_comision b on b.id = bb.bloque_id
      where b.es_default and bb.banco = p_banco),
    (select porcentaje from public.comisiones_banco
      where banco = p_banco and activa = true),
    (select tasa_comision from public.perfiles_cliente where id = p_cliente),
    0
  );
$$;

create or replace function public.origen_comision(p_cliente uuid, p_banco text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.comisiones_cliente
                  where cliente_id = p_cliente and banco = p_banco) then 'especial'
    when exists (select 1 from public.bloques_comision_banco bb
                  where bb.bloque_id = public.bloque_vigente(p_cliente) and bb.banco = p_banco) then 'bloque'
    when exists (select 1 from public.bloques_comision_banco bb
                   join public.bloques_comision b on b.id = bb.bloque_id
                  where b.es_default and bb.banco = p_banco) then 'bloque'
    when exists (select 1 from public.comisiones_banco
                  where banco = p_banco and activa = true) then 'general'
    else 'perfil'
  end;
$$;


-- ------------------------------------------------------------
-- 4) Lo que ve el cliente: su tarifa, su mínimo y su cupón vigente
-- ------------------------------------------------------------
create or replace function public.mis_comisiones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente  uuid;
  v_vigente  uuid;
  v_estandar uuid;
  v_nombre   text;
  v_cupon    boolean;
  v_hasta    timestamptz;
begin
  select id, cupon_hasta into v_cliente, v_hasta from public.perfiles_cliente where user_id = auth.uid();
  if v_cliente is null then
    return jsonb_build_object('bloque', null, 'cupon', null, 'bancos', '[]'::jsonb);
  end if;

  v_vigente := public.bloque_vigente(v_cliente);
  select id into v_estandar from public.bloques_comision where es_default limit 1;
  select nombre, not es_default into v_nombre, v_cupon from public.bloques_comision where id = v_vigente;

  return jsonb_build_object(
    'bloque', v_nombre,
    'cupon', case when v_cupon then jsonb_build_object('nombre', v_nombre, 'hasta', v_hasta) else null end,
    'bancos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'banco', x.banco,
               'porcentaje', public.comision_efectiva(v_cliente, x.banco),
               'especial', x.especial,
               'minimo', case when x.especial then null when bv.banco is not null then bv.minimo else be.minimo end,
               'limite', case when x.especial then null when bv.banco is not null then bv.limite else be.limite end,
               'con_tarjeta', x.con_tarjeta
             ) order by x.con_tarjeta desc, x.banco)
      from (
        select y.banco,
               exists (select 1 from public.comisiones_cliente c
                        where c.cliente_id = v_cliente and c.banco = y.banco) as especial,
               exists (select 1 from public.tarjetas t
                        where t.cliente_id = v_cliente and t.activa = true
                          and t.estado = 'aprobado' and t.banco = y.banco) as con_tarjeta
        from (
          select banco from public.bloques_comision_banco where bloque_id in (v_vigente, v_estandar)
          union
          select banco from public.comisiones_cliente where cliente_id = v_cliente
          union
          select banco from public.tarjetas
           where cliente_id = v_cliente and activa = true and estado = 'aprobado'
        ) y
      ) x
      left join public.bloques_comision_banco bv on bv.bloque_id = v_vigente and bv.banco = x.banco
      left join public.bloques_comision_banco be on be.bloque_id = v_estandar and be.banco = x.banco
    ), '[]'::jsonb)
  );
end;
$$;


-- ------------------------------------------------------------
-- 5) Crear o editar un cupón (nombre, descripción, duración)
-- ------------------------------------------------------------
create or replace function public.guardar_cupon(
  p_id            uuid,
  p_nombre        text,
  p_descripcion   text default null,
  p_activo        boolean default true,
  p_duracion_dias integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_default boolean := false;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador crea o cambia cupones.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El cupón necesita un nombre de al menos 3 letras.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bloques_comision
              where lower(trim(nombre)) = lower(trim(p_nombre)) and id is distinct from p_id) then
    raise exception 'Ya hay un cupón con ese nombre.' using errcode = 'P0001';
  end if;
  if p_id is not null then
    select es_default into v_default from public.bloques_comision where id = p_id;
    if not found then
      raise exception 'Ese cupón no existe.' using errcode = 'P0001';
    end if;
  end if;
  -- La tarifa estándar no vence ni se desactiva.
  if not v_default and (p_duracion_dias is null or p_duracion_dias < 1 or p_duracion_dias > 3650) then
    raise exception 'La duración del cupón debe estar entre 1 y 3650 días.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.bloques_comision (nombre, descripcion, creado_por, duracion_dias)
    values (trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''), auth.uid(), p_duracion_dias)
    returning id into v_id;
  else
    update public.bloques_comision
       set nombre        = trim(p_nombre),
           descripcion   = nullif(trim(coalesce(p_descripcion, '')), ''),
           activo        = case when v_default then true else p_activo end,
           duracion_dias = case when v_default then null else p_duracion_dias end
     where id = p_id
    returning id into v_id;
  end if;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), case when p_id is null then 'CREAR_CUPON' else 'EDITAR_CUPON' end, 'bloques_comision', v_id,
          jsonb_build_object('nombre', trim(p_nombre), 'duracion_dias', p_duracion_dias, 'activo', p_activo));
  return v_id;
end;
$$;

revoke all on function public.guardar_cupon(uuid, text, text, boolean, integer) from public, anon;
grant execute on function public.guardar_cupon(uuid, text, text, boolean, integer) to authenticated;


-- ------------------------------------------------------------
-- 6) Asignar (o renovar) un cupón a clientes
--    El cupón corre desde hoy por su duración, salvo que se indiquen
--    otros días. Asignar la tarifa estándar quita el cupón.
-- ------------------------------------------------------------
create or replace function public.asignar_cupon(p_clientes uuid[], p_cupon uuid, p_dias integer default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default  boolean;
  v_activo   boolean;
  v_duracion integer;
  v_dias     integer;
  v_n        integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador asigna cupones.' using errcode = '42501';
  end if;
  select es_default, activo, duracion_dias into v_default, v_activo, v_duracion
    from public.bloques_comision where id = p_cupon;
  if not found then
    raise exception 'Ese cupón no existe.' using errcode = 'P0001';
  end if;
  if not v_activo then
    raise exception 'Ese cupón está desactivado.' using errcode = 'P0001';
  end if;

  v_dias := case when v_default then null else coalesce(p_dias, v_duracion) end;
  if not v_default and v_dias is not null and (v_dias < 1 or v_dias > 3650) then
    raise exception 'Los días del cupón deben estar entre 1 y 3650.' using errcode = 'P0001';
  end if;

  update public.perfiles_cliente
     set bloque_id   = p_cupon,
         cupon_desde = case when v_default then null else now() end,
         cupon_hasta = case when v_default or v_dias is null then null else now() + make_interval(days => v_dias) end
   where id = any(p_clientes);
  get diagnostics v_n = row_count;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'ASIGNAR_CUPON', 'perfiles_cliente', p_cupon,
          jsonb_build_object('clientes', v_n, 'dias', v_dias, 'estandar', v_default));
  return v_n;
end;
$$;

revoke all on function public.asignar_cupon(uuid[], uuid, integer) from public, anon;
grant execute on function public.asignar_cupon(uuid[], uuid, integer) to authenticated;

-- Si el cupón se cambia por otro camino (la aprobación de identidad lo
-- escribe directo), las fechas se calculan igual.
create or replace function public.perfiles_vigencia_cupon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default  boolean;
  v_duracion integer;
begin
  if tg_op = 'UPDATE'
     and new.bloque_id is not distinct from old.bloque_id then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.cupon_hasta is distinct from old.cupon_hasta or new.cupon_desde is distinct from old.cupon_desde) then
    return new; -- quien cambió el cupón ya puso sus fechas (asignar_cupon)
  end if;
  if new.bloque_id is null then
    new.cupon_desde := null;
    new.cupon_hasta := null;
    return new;
  end if;
  select es_default, duracion_dias into v_default, v_duracion from public.bloques_comision where id = new.bloque_id;
  if coalesce(v_default, true) then
    new.cupon_desde := null;
    new.cupon_hasta := null;
  else
    new.cupon_desde := now();
    new.cupon_hasta := case when v_duracion is null then null else now() + make_interval(days => v_duracion) end;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_perfiles_cupon on public.perfiles_cliente;
create trigger tr_perfiles_cupon
  before update of bloque_id on public.perfiles_cliente
  for each row execute function public.perfiles_vigencia_cupon();


-- ------------------------------------------------------------
-- 7) El cliente no escribe su cupón ni sus fechas
-- ------------------------------------------------------------
create or replace function public.perfiles_proteger_validacion()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then
    new.validado_por     := old.validado_por;
    new.fecha_validacion := old.fecha_validacion;
    new.tasa_comision    := old.tasa_comision;
    new.user_id          := old.user_id;
    -- El documento no se cambia solo: identifica al titular ya verificado.
    new.dni              := old.dni;
    new.tipo_documento   := old.tipo_documento;
    -- Sus condiciones comerciales las pone el staff.
    new.bloque_id        := old.bloque_id;
    new.cupon_desde      := old.cupon_desde;
    new.cupon_hasta      := old.cupon_hasta;
    -- El motivo del bloqueo lo escribe quien bloquea.
    new.motivo_bloqueo   := old.motivo_bloqueo;
    new.bloqueado_por    := old.bloqueado_por;
    new.bloqueado_en     := old.bloqueado_en;
  end if;
  return new;
end;
$$;

-- Al crear su perfil tampoco: antes solo se protegía al editarlo.
create or replace function public.perfiles_proteger_alta()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then
    new.validado_por     := null;
    new.fecha_validacion := null;
    new.bloque_id        := null;
    new.cupon_desde      := null;
    new.cupon_hasta      := null;
    new.motivo_bloqueo   := null;
    new.bloqueado_por    := null;
    new.bloqueado_en     := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_perfiles_proteger_alta on public.perfiles_cliente;
create trigger tr_perfiles_proteger_alta
  before insert on public.perfiles_cliente
  for each row execute function public.perfiles_proteger_alta();


-- ------------------------------------------------------------
-- 8) Listados del panel con la vigencia
-- ------------------------------------------------------------
create or replace function public.listar_bloques()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.es_staff() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id,
      'nombre', b.nombre,
      'descripcion', b.descripcion,
      'es_default', b.es_default,
      'activo', b.activo,
      'duracion_dias', b.duracion_dias,
      'clientes', (select count(*) from public.perfiles_cliente p
                    where p.bloque_id = b.id and (b.es_default or p.cupon_hasta is null or p.cupon_hasta > now())),
      'vencidos', (select count(*) from public.perfiles_cliente p
                    where p.bloque_id = b.id and not b.es_default and p.cupon_hasta <= now()),
      'bancos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'banco', bb.banco, 'porcentaje', bb.porcentaje,
                 'minimo', bb.minimo, 'limite', bb.limite)
               order by bb.banco)
        from public.bloques_comision_banco bb where bb.bloque_id = b.id
      ), '[]'::jsonb)
    ) order by b.es_default desc, b.activo desc, b.nombre)
    from public.bloques_comision b
    where b.activo or public.es_supervisor()
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;

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
      'tarifa_bloque', coalesce(
        (select bb.porcentaje from public.bloques_comision_banco bb
          where bb.bloque_id = public.bloque_vigente(p.id) and bb.banco = c.banco),
        (select bb.porcentaje from public.bloques_comision_banco bb
           join public.bloques_comision d on d.id = bb.bloque_id
          where d.es_default and bb.banco = c.banco)),
      'asignado_por', (select u.email from public.users u where u.id = c.asignado_por),
      'actualizado', c.updated_at
    ) order by p.apellidos, c.banco)
    from public.comisiones_cliente c
    join public.perfiles_cliente p on p.id = c.cliente_id
    left join public.bloques_comision b on b.id = public.bloque_vigente(p.id)
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;


-- ------------------------------------------------------------
-- 9) Ver las fotos de identidad queda registrado
-- ------------------------------------------------------------
create or replace function public.registrar_vista_fotos(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo puede ver las fotos de un cliente.' using errcode = '42501';
  end if;
  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'VER_FOTOS_CLIENTE', 'perfiles_cliente', p_cliente, '{}'::jsonb);
end;
$$;

revoke all on function public.registrar_vista_fotos(uuid) from public, anon;
grant execute on function public.registrar_vista_fotos(uuid) to authenticated;


-- ------------------------------------------------------------
-- 10) Los clientes que ya estaban en un cupón distinto del estándar
--     quedan sin vencimiento (null) hasta que se les renueve con
--     duración. Nadie pierde su tarifa por esta migración.
-- ------------------------------------------------------------

notify pgrst, 'reload schema';
