-- ============================================================
--  DEPÓSITO "PARA HOY" O "AL DÍA SIGUIENTE", Y CUENTA DE DEPÓSITO
--
--  1. En algunos bancos (hoy Scotiabank y BanBif) lo normal es que el
--     depósito llegue el día hábil siguiente con la tarifa del cupón.
--     Si el cliente lo quiere para hoy, paga una tarifa más alta
--     ("para hoy"). Ejemplo, tarifa estándar Scotiabank: 1 % al día
--     siguiente, 1.5 % para hoy. Un cupón con 0.5 % al día siguiente
--     cobra 1 % para hoy.
--
--     - Un banco ofrece las dos opciones si su tarifa estándar tiene
--       "porcentaje_hoy". El porcentaje de siempre es el del día
--       siguiente.
--     - "Para hoy" solo se puede pedir un día hábil antes de las 6 p. m.
--       (hora de Lima).
--     - Día siguiente: el próximo día hábil. Domingo y feriados no
--       cuentan (sábado → lunes; si el lunes es feriado, martes).
--     - La comisión y la fecha las fija la base al crear la solicitud;
--       lo que mande el app o la web se ignora.
--
--  2. Pagos puede depositar en otra cuenta del cliente (siempre suya,
--     nunca de terceros). Por defecto, la cuenta de ahorros del banco de
--     la tarjeta; como último recurso, su CCI. Al confirmar el pago, el
--     aviso dice a qué cuenta se depositó, y si no es la de siempre lo
--     dice claro.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Feriados nacionales (Perú)
-- ------------------------------------------------------------
create table if not exists public.feriados (
  fecha  date primary key,
  nombre text not null
);

alter table public.feriados enable row level security;
drop policy if exists feriados_lectura on public.feriados;
create policy feriados_lectura on public.feriados
  for select to authenticated using (true);
drop policy if exists feriados_admin on public.feriados;
create policy feriados_admin on public.feriados
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
grant select on public.feriados to authenticated;

insert into public.feriados (fecha, nombre) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-04-02', 'Jueves Santo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-06-07', 'Batalla de Arica y Día de la Bandera'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-23', 'Día de la Fuerza Aérea del Perú'),
  ('2026-07-28', 'Fiestas Patrias'),
  ('2026-07-29', 'Fiestas Patrias'),
  ('2026-08-06', 'Batalla de Junín'),
  ('2026-08-30', 'Santa Rosa de Lima'),
  ('2026-10-08', 'Combate de Angamos'),
  ('2026-11-01', 'Día de Todos los Santos'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-09', 'Batalla de Ayacucho'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-03-25', 'Jueves Santo'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-05-01', 'Día del Trabajo'),
  ('2027-06-07', 'Batalla de Arica y Día de la Bandera'),
  ('2027-06-29', 'San Pedro y San Pablo'),
  ('2027-07-23', 'Día de la Fuerza Aérea del Perú'),
  ('2027-07-28', 'Fiestas Patrias'),
  ('2027-07-29', 'Fiestas Patrias'),
  ('2027-08-06', 'Batalla de Junín'),
  ('2027-08-30', 'Santa Rosa de Lima'),
  ('2027-10-08', 'Combate de Angamos'),
  ('2027-11-01', 'Día de Todos los Santos'),
  ('2027-12-08', 'Inmaculada Concepción'),
  ('2027-12-09', 'Batalla de Ayacucho'),
  ('2027-12-25', 'Navidad')
on conflict (fecha) do nothing;


-- ------------------------------------------------------------
-- 2) Días hábiles y hora de Lima
-- ------------------------------------------------------------
create or replace function public.hoy_lima()
returns date
language sql stable
as $$ select (now() at time zone 'America/Lima')::date; $$;

create or replace function public.es_dia_habil(p_fecha date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select extract(isodow from p_fecha) < 7
     and not exists (select 1 from public.feriados f where f.fecha = p_fecha);
$$;

create or replace function public.siguiente_dia_habil(p_desde date)
returns date
language plpgsql stable security definer set search_path = public
as $$
declare
  v date := p_desde + 1;
begin
  while not public.es_dia_habil(v) loop
    v := v + 1;
  end loop;
  return v;
end;
$$;

-- Hasta las 6 p. m. de un día hábil se puede pedir "para hoy".
create or replace function public.se_puede_hoy()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.es_dia_habil(public.hoy_lima())
     and (now() at time zone 'America/Lima')::time < time '18:00';
$$;

-- "hoy", "mañana" o "el lunes 3 de noviembre", para los avisos.
create or replace function public.texto_fecha_deposito(p_fecha date)
returns text
language sql stable
as $$
  select case
    when p_fecha is null then null
    when p_fecha = public.hoy_lima() then 'hoy'
    when p_fecha = public.hoy_lima() + 1 then 'mañana'
    else 'el ' ||
      (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow from p_fecha)::int]
      || ' ' || extract(day from p_fecha)::int || ' de ' ||
      (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
             'septiembre','octubre','noviembre','diciembre'])[extract(month from p_fecha)::int]
  end;
$$;

grant execute on function public.hoy_lima() to authenticated;
grant execute on function public.es_dia_habil(date) to authenticated;
grant execute on function public.siguiente_dia_habil(date) to authenticated;
grant execute on function public.se_puede_hoy() to authenticated;
grant execute on function public.texto_fecha_deposito(date) to authenticated;


-- ------------------------------------------------------------
-- 3) Tarifa "para hoy" en cada cupón
--    El porcentaje de siempre pasa a ser el del día siguiente. En la
--    tarifa estándar, Scotiabank queda en 1 % (día siguiente) y 1.5 %
--    (hoy), que es lo que se cobraba hasta ahora por el mismo día.
--    BanBif y los cupones parten con "hoy" = su porcentaje + 0.5; el
--    administrador lo ajusta en Comisiones.
-- ------------------------------------------------------------
alter table public.bloques_comision_banco
  add column if not exists porcentaje_hoy numeric(5,2);
alter table public.bloques_comision_banco
  drop constraint if exists bloques_banco_hoy_valido;
alter table public.bloques_comision_banco
  add constraint bloques_banco_hoy_valido check (
    porcentaje_hoy is null or (porcentaje_hoy >= porcentaje and porcentaje_hoy <= 100)
  );

do $$
declare
  v_estandar uuid;
begin
  select id into v_estandar from public.bloques_comision where es_default limit 1;

  -- Solo la primera vez: si ya hay alguna tarifa "hoy", no se toca nada.
  if exists (select 1 from public.bloques_comision_banco where porcentaje_hoy is not null) then
    return;
  end if;

  update public.bloques_comision_banco
     set porcentaje = 1.00, porcentaje_hoy = 1.50
   where bloque_id = v_estandar and banco = 'Scotiabank';

  update public.bloques_comision_banco
     set porcentaje_hoy = least(porcentaje + 0.50, 100)
   where banco in ('Scotiabank', 'BanBif') and porcentaje_hoy is null;
end $$;

-- ¿El banco ofrece elegir entre hoy y el día siguiente?
create or replace function public.banco_con_dia_siguiente(p_banco text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.bloques_comision_banco bb
      join public.bloques_comision b on b.id = bb.bloque_id
     where b.es_default and bb.banco = p_banco and bb.porcentaje_hoy is not null
  );
$$;

-- Tarifa "para hoy" del cliente. Null si el banco no tiene las dos
-- opciones. Con comisión especial, se le suma la misma diferencia que
-- tiene la tarifa estándar.
create or replace function public.comision_hoy(p_cliente uuid, p_banco text)
returns numeric
language sql stable security definer set search_path = public
as $$
  with est as (
    select bb.porcentaje, bb.porcentaje_hoy
      from public.bloques_comision_banco bb
      join public.bloques_comision b on b.id = bb.bloque_id
     where b.es_default and bb.banco = p_banco and bb.porcentaje_hoy is not null
  )
  select case when not exists (select 1 from est) then null else
    coalesce(
      (select least(c.porcentaje + (est.porcentaje_hoy - est.porcentaje), 100)
         from public.comisiones_cliente c, est
        where c.cliente_id = p_cliente and c.banco = p_banco),
      (select bb.porcentaje_hoy from public.bloques_comision_banco bb
        where bb.bloque_id = public.bloque_vigente(p_cliente)
          and bb.banco = p_banco and bb.porcentaje_hoy is not null),
      (select porcentaje_hoy from est)
    ) end;
$$;

grant execute on function public.banco_con_dia_siguiente(text) to authenticated;
grant execute on function public.comision_hoy(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 4) Guardar la tarifa de un cupón, ahora con "para hoy"
--    Si no se manda "para hoy" se conserva la que había: así el panel
--    viejo no la borra al cambiar solo el porcentaje.
-- ------------------------------------------------------------
drop function if exists public.guardar_tarifa_cupon(uuid, text, numeric, numeric, numeric);

create or replace function public.guardar_tarifa_cupon(
  p_cupon          uuid,
  p_banco          text,
  p_porcentaje     numeric,
  p_minimo         numeric default null,
  p_limite         numeric default null,
  p_porcentaje_hoy numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy numeric;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador cambia las tarifas de un cupón.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.bloques_comision where id = p_cupon) then
    raise exception 'Ese cupón no existe.' using errcode = 'P0001';
  end if;
  if p_banco is null or p_banco not in ('BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif', 'CMR', 'iO', 'Otros') then
    raise exception 'Banco no válido: %.', coalesce(p_banco, '(vacío)') using errcode = 'P0001';
  end if;
  if p_porcentaje is null or p_porcentaje < 0 or p_porcentaje > 100 then
    raise exception 'El porcentaje de % debe estar entre 0 y 100.', p_banco using errcode = 'P0001';
  end if;
  if round(p_porcentaje, 2) <> p_porcentaje then
    raise exception 'El porcentaje de % admite como máximo dos decimales.', p_banco using errcode = 'P0001';
  end if;
  if (p_minimo is null) <> (p_limite is null) then
    raise exception 'En %, el mínimo y el monto "si opera menos de" van juntos: completa los dos o deja los dos vacíos.', p_banco using errcode = 'P0001';
  end if;
  if p_minimo is not null and (p_minimo <= 0 or p_limite <= 0 or p_minimo >= p_limite) then
    raise exception 'En %, el mínimo debe ser mayor que 0 y menor que el monto límite.', p_banco using errcode = 'P0001';
  end if;

  v_hoy := coalesce(
    p_porcentaje_hoy,
    (select porcentaje_hoy from public.bloques_comision_banco where bloque_id = p_cupon and banco = p_banco)
  );
  -- Un banco con las dos opciones necesita su tarifa "para hoy".
  if v_hoy is null and public.banco_con_dia_siguiente(p_banco) then
    raise exception 'En %, completa también la tarifa para hoy.', p_banco using errcode = 'P0001';
  end if;
  if v_hoy is not null then
    if round(v_hoy, 2) <> v_hoy or v_hoy > 100 then
      raise exception 'En %, la tarifa para hoy admite hasta dos decimales y como máximo 100.', p_banco using errcode = 'P0001';
    end if;
    if v_hoy < p_porcentaje then
      raise exception 'En %, la tarifa para hoy (% %%) no puede ser menor que la del día siguiente (% %%).',
        p_banco, v_hoy, p_porcentaje using errcode = 'P0001';
    end if;
  end if;

  insert into public.bloques_comision_banco (bloque_id, banco, porcentaje, minimo, limite, porcentaje_hoy)
  values (p_cupon, p_banco, p_porcentaje, p_minimo, p_limite, v_hoy)
  on conflict (bloque_id, banco) do update
    set porcentaje     = excluded.porcentaje,
        minimo         = excluded.minimo,
        limite         = excluded.limite,
        porcentaje_hoy = excluded.porcentaje_hoy;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'TARIFA_CUPON', 'bloques_comision', p_cupon,
          jsonb_build_object('banco', p_banco, 'porcentaje', p_porcentaje, 'porcentaje_hoy', v_hoy,
                             'minimo', p_minimo, 'limite', p_limite));
end;
$$;

revoke all on function public.guardar_tarifa_cupon(uuid, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.guardar_tarifa_cupon(uuid, text, numeric, numeric, numeric, numeric) to authenticated;


-- ------------------------------------------------------------
-- 5) Listado de cupones para el panel, con "para hoy"
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
                 'porcentaje_hoy', bb.porcentaje_hoy,
                 'minimo', bb.minimo, 'limite', bb.limite)
               order by bb.banco)
        from public.bloques_comision_banco bb where bb.bloque_id = b.id
      ), '[]'::jsonb)
    ) order by b.es_default desc, b.activo desc, b.nombre)
    from public.bloques_comision b
    where b.activo or public.es_supervisor()
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;


-- ------------------------------------------------------------
-- 6) Lo que ve el cliente: también su tarifa "para hoy"
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
               'porcentaje_hoy', public.comision_hoy(v_cliente, x.banco),
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
-- 7) Opciones de depósito para una nueva solicitud
--    Lo que muestran la web y el app al elegir la tarjeta: si hay
--    elección, las dos tarifas, las fechas y si "hoy" sigue abierto.
-- ------------------------------------------------------------
create or replace function public.opciones_deposito(p_banco text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
  v_hoy     date := public.hoy_lima();
  v_abierto boolean := public.se_puede_hoy();
begin
  select id into v_cliente from public.perfiles_cliente where user_id = auth.uid();
  if v_cliente is null then
    raise exception 'No encontramos tu perfil.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'con_eleccion',          public.banco_con_dia_siguiente(p_banco),
    'porcentaje_siguiente',  public.comision_efectiva(v_cliente, p_banco),
    'porcentaje_hoy',        public.comision_hoy(v_cliente, p_banco),
    'hoy_disponible',        v_abierto,
    'motivo_sin_hoy',        case
                               when v_abierto then null
                               when not public.es_dia_habil(v_hoy) then 'Hoy no es día hábil.'
                               else 'Pasadas las 6:00 p. m. ya no se puede pedir para hoy.'
                             end,
    'fecha_hoy',             v_hoy,
    'fecha_siguiente',       public.siguiente_dia_habil(v_hoy),
    'texto_siguiente',       public.texto_fecha_deposito(public.siguiente_dia_habil(v_hoy))
  );
end;
$$;

revoke all on function public.opciones_deposito(text) from public, anon;
grant execute on function public.opciones_deposito(text) to authenticated;


-- ------------------------------------------------------------
-- 8) La solicitud guarda su modalidad, su comisión, su fecha y la
--    cuenta donde se depositó
-- ------------------------------------------------------------
alter table public.solicitudes
  add column if not exists modalidad           text,
  add column if not exists porcentaje_comision numeric(5,2),
  add column if not exists fecha_deposito      date,
  add column if not exists cuenta_deposito_id  uuid references public.cuentas_bancarias(id),
  add column if not exists deposito_banco      text,
  add column if not exists deposito_tipo       text,
  add column if not exists deposito_ultimos4   text;

alter table public.solicitudes drop constraint if exists solicitudes_modalidad_valida;
alter table public.solicitudes
  add constraint solicitudes_modalidad_valida check (modalidad is null or modalidad in ('hoy', 'siguiente'));

create index if not exists solicitudes_fecha_deposito_idx
  on public.solicitudes (fecha_deposito) where estado = 'aprobado';

-- Al crear la solicitud: la base decide la comisión y la fecha.
create or replace function public.solicitudes_fijar_deposito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := public.hoy_lima();
begin
  -- new.banco ya viene de la tarjeta (tr_solicitudes_validar_alta).
  if public.banco_con_dia_siguiente(new.banco) then
    -- Sin elegir (app antiguo): lo normal, al día siguiente.
    new.modalidad := coalesce(new.modalidad, 'siguiente');
    if new.modalidad = 'hoy' and not public.se_puede_hoy() and not public.es_staff() then
      raise exception 'Ya no se puede pedir para hoy: pasadas las 6:00 p. m. o en día no hábil. Elige "al día siguiente".'
        using errcode = 'P0001';
    end if;
  else
    -- Bancos sin elección: el depósito de siempre, el mismo día.
    new.modalidad := 'hoy';
  end if;

  if new.modalidad = 'hoy' then
    new.porcentaje_comision := coalesce(public.comision_hoy(new.cliente_id, new.banco),
                                        public.comision_efectiva(new.cliente_id, new.banco));
    new.fecha_deposito := v_hoy;
  else
    new.porcentaje_comision := public.comision_efectiva(new.cliente_id, new.banco);
    new.fecha_deposito := public.siguiente_dia_habil(v_hoy);
  end if;

  -- La cuenta de depósito la decide Pagos, no el cliente.
  new.cuenta_deposito_id := null;
  new.deposito_banco := null;
  new.deposito_tipo := null;
  new.deposito_ultimos4 := null;
  return new;
end;
$$;

-- Se llama después de tr_solicitudes_validar_alta (orden alfabético).
drop trigger if exists tr_solicitudes_validar_deposito on public.solicitudes;
create trigger tr_solicitudes_validar_deposito
  before insert on public.solicitudes
  for each row execute function public.solicitudes_fijar_deposito();

-- Las solicitudes que ya estaban: lo de siempre, para el día que se crearon.
update public.solicitudes
   set modalidad = 'hoy',
       fecha_deposito = (created_at at time zone 'America/Lima')::date
 where modalidad is null;


-- ------------------------------------------------------------
-- 9) Cuenta de depósito por defecto: la de ahorros del banco de la
--    tarjeta; con CMR u "Otros", la primera de ahorros que tenga.
-- ------------------------------------------------------------
create or replace function public.cuenta_deposito_defecto(p_solicitud uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select c.id
    from public.solicitudes s
    join public.cuentas_bancarias c on c.cliente_id = s.cliente_id
   where s.id = p_solicitud
     and c.activa = true
     and coalesce(c.tipo, 'ahorros') <> 'interbancaria'
   order by (c.banco = s.banco) desc, c.created_at
   limit 1;
$$;

-- Pagos elige otra cuenta del cliente: solo suya. Puede ser de ahorros
-- o, como último recurso, su CCI (transferencia interbancaria).
create or replace function public.pagos_cuenta_deposito(p_solicitud uuid, p_cuenta uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mis   text[] := public.mis_bancos_pago();
  v_admin boolean := public.es_admin();
  s       record;
  c       record;
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into s from public.solicitudes where id = p_solicitud for update;
  if s.id is null then
    raise exception 'Esa solicitud no existe.' using errcode = 'P0001';
  end if;
  if s.estado <> 'aprobado' then
    raise exception 'Solo se cambia la cuenta de una solicitud por pagar.' using errcode = 'P0001';
  end if;
  if not (v_admin or s.banco = any(v_mis)) then
    raise exception 'Esa solicitud no es de tus bancos.' using errcode = '42501';
  end if;

  if p_cuenta is null then
    update public.solicitudes set cuenta_deposito_id = null where id = p_solicitud;
    return jsonb_build_object('ok', true, 'cuenta', null);
  end if;

  select * into c from public.cuentas_bancarias where id = p_cuenta;
  if c.id is null or c.cliente_id is distinct from s.cliente_id or not coalesce(c.activa, false) then
    raise exception 'Esa cuenta no es del cliente. Solo se deposita en cuentas a su nombre.' using errcode = 'P0001';
  end if;
  update public.solicitudes set cuenta_deposito_id = c.id where id = p_solicitud;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'CUENTA_DEPOSITO', 'solicitudes', p_solicitud,
          jsonb_build_object('banco', c.banco, 'tipo', coalesce(c.tipo, 'ahorros'),
                             'ultimos_4', right(c.numero_cuenta, 4)));

  return jsonb_build_object('ok', true, 'cuenta', c.id);
end;
$$;

revoke all on function public.pagos_cuenta_deposito(uuid, uuid) from public, anon;
grant execute on function public.pagos_cuenta_deposito(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 10) Listado de Pagos: modalidad, fecha, comisión y cuenta elegida
-- ------------------------------------------------------------
create or replace function public.pagos_listar(
  p_banco     text    default null,
  p_estado    text    default 'aprobado',
  p_buscar    text    default null,
  p_limite    integer default 50,
  p_desde     integer default 0,
  p_solo_mias boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_vence  timestamptz := now() - (public.pagos_reserva_minutos() || ' minutes')::interval;
  v_buscar text := nullif(trim(coalesce(p_buscar, '')), '');
  v_hoy    date := public.hoy_lima();
  v_filas  jsonb;
  v_total  bigint;
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
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
        'id',                  s.id,
        'codigo',              s.codigo,
        'banco',               s.banco,
        'estado',              s.estado,
        'created_at',          s.created_at,
        'fecha_revision',      s.fecha_revision,
        'comprobante_url',     s.comprobante_url,
        'nota_cliente',        s.nota_cliente,
        'pagado_en',           s.pagado_en,
        'pagado_por',          (select u.email from public.users u where u.id = s.pagado_por),
        'ultimos_4',           t.ultimos_4,
        'modalidad',           s.modalidad,
        'porcentaje_comision', s.porcentaje_comision,
        'fecha_deposito',      s.fecha_deposito,
        'programada',          coalesce(s.fecha_deposito > v_hoy, false),
        'cuenta_deposito_id',  coalesce(s.cuenta_deposito_id, public.cuenta_deposito_defecto(s.id)),
        'cuenta_cambiada',     s.cuenta_deposito_id is not null,
        'deposito', case when s.deposito_banco is not null then jsonb_build_object(
                      'banco', s.deposito_banco, 'tipo', s.deposito_tipo, 'ultimos_4', s.deposito_ultimos4) end,
        'marcada_por',         case when s.marcada_en > v_vence
                                 then (select u.email from public.users u where u.id = s.marcada_por) end,
        'marcada_por_mi',      coalesce(s.marcada_por = v_yo and s.marcada_en > v_vence, false),
        'puedo_pagar',         (v_admin or s.banco = any(v_mis)),
        'cliente', jsonb_build_object(
          'nombres',   p.nombres,
          'apellidos', p.apellidos,
          'dni',       p.dni,
          'telefono',  p.telefono
        ),
        'cuentas', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', c.id, 'banco', c.banco, 'numero', c.numero_cuenta, 'tipo', c.tipo
                 ) order by c.banco, c.tipo)
          from public.cuentas_bancarias c
          where c.cliente_id = s.cliente_id and c.activa = true
        ), '[]'::jsonb)
      ) as fila,
      row_number() over (
        order by
          case when p_estado = 'pagado' then s.pagado_en end desc nulls last,
          -- Primero lo que toca pagar hoy; lo programado, después.
          case when p_estado = 'aprobado' then coalesce(s.fecha_deposito, v_hoy) end asc nulls last,
          s.fecha_revision asc nulls last,
          s.created_at asc
      ) as orden,
      count(*) over () as total
    from public.solicitudes s
    join public.perfiles_cliente p on p.id = s.cliente_id
    left join public.tarjetas t on t.id = s.tarjeta_id
    where s.estado = p_estado
      and (p_banco is null or s.banco = p_banco)
      and (not p_solo_mias or (s.marcada_por = v_yo and s.marcada_en > v_vence))
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
-- 11) Resumen de Pagos: "por pagar" es lo de hoy; lo de mañana va
--     aparte en "programadas".
-- ------------------------------------------------------------
drop function if exists public.pagos_resumen();

create or replace function public.pagos_resumen()
returns table(banco text, por_pagar bigint, en_revision bigint, marcadas_por_mi bigint,
              pagadas_hoy bigint, es_mio boolean, programadas bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_vence  timestamptz := now() - (public.pagos_reserva_minutos() || ' minutes')::interval;
  v_dia    date := public.hoy_lima();
  v_hoy    timestamptz := date_trunc('day', now() at time zone 'America/Lima')
                          at time zone 'America/Lima';
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  with conteo as (
    select s.banco,
           count(*) filter (where s.estado = 'aprobado'
                              and coalesce(s.fecha_deposito, v_dia) <= v_dia)  as c_por_pagar,
           count(*) filter (where s.estado = 'pendiente')                     as c_en_revision,
           count(*) filter (where s.estado = 'aprobado'
                              and s.marcada_por = auth.uid()
                              and s.marcada_en > v_vence)                     as c_mias,
           count(*) filter (where s.estado = 'pagado' and s.pagado_en >= v_hoy) as c_hoy,
           count(*) filter (where s.estado = 'aprobado'
                              and s.fecha_deposito > v_dia)                   as c_programadas
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
         (v_admin or l.b = any(v_mis)),
         coalesce(c.c_programadas, 0)
  from lista l
  left join conteo c on c.banco = l.b
  order by (l.b = any(v_mis)) desc, l.b;
end;
$$;

revoke all on function public.pagos_resumen() from public, anon;
grant execute on function public.pagos_resumen() to authenticated;


-- ------------------------------------------------------------
-- 12) Confirmar el pago: guarda la cuenta y el aviso la nombra
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

  -- La cuenta queda copiada: si el cliente la edita después, el
  -- registro sigue diciendo a dónde se pagó.
  update public.solicitudes s
     set estado = 'pagado',
         pagado_por = v_yo,
         pagado_en = now(),
         lote_id = v_lote,
         marcada_por = null,
         marcada_en = null,
         cuenta_deposito_id = c.id,
         deposito_banco = c.banco,
         deposito_tipo = case when c.id is not null then coalesce(c.tipo, 'ahorros') end,
         deposito_ultimos4 = right(regexp_replace(c.numero_cuenta, '\D', '', 'g'), 4)
    from (
      select x.id as solicitud_id,
             coalesce(x.cuenta_deposito_id, public.cuenta_deposito_defecto(x.id)) as cuenta_id
        from public.solicitudes x
       where x.id = any(v_ids)
    ) d
    left join public.cuentas_bancarias c on c.id = d.cuenta_id
   where s.id = d.solicitud_id;

  insert into public.pagos_eventos (solicitud_id, lote_id, accion, usuario_id)
  select unnest(v_ids), v_lote, 'pagado', v_yo;

  -- El cliente se entera de a qué cuenta se le depositó.
  insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
  select p.user_id,
         'pago_enviado',
         'Tu pago fue enviado',
         case
           when s.deposito_banco is null then
             'La solicitud ' || s.codigo || ' ya fue pagada. Revisa tu cuenta bancaria.'
           when s.deposito_tipo = 'interbancaria' then
             'La solicitud ' || s.codigo || ' ya fue pagada por transferencia interbancaria a tu CCI '
             || s.deposito_banco || ' •••• ' || s.deposito_ultimos4
             || '. Puede tardar un poco más en reflejarse. ¿Dudas? Escríbenos por WhatsApp.'
           when s.banco in ('BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif')
                and s.deposito_banco <> s.banco then
             'La solicitud ' || s.codigo || ' ya fue pagada. Esta vez te depositamos en tu cuenta de ahorros '
             || s.deposito_banco || ' •••• ' || s.deposito_ultimos4
             || ', no en tu cuenta ' || s.banco || '. ¿Dudas? Escríbenos por WhatsApp.'
           else
             'La solicitud ' || s.codigo || ' ya fue pagada en tu cuenta de ahorros '
             || s.deposito_banco || ' •••• ' || s.deposito_ultimos4 || '.'
         end
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
-- 13) Al aprobar una solicitud, el aviso dice cuándo se deposita
-- ------------------------------------------------------------
create or replace function public.solicitudes_aviso_fecha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- resolver_caso ya avisó "fue aprobada"; aquí se completa con la fecha.
  if new.estado = 'aprobado' and old.estado = 'pendiente' and new.fecha_deposito is not null then
    update public.notificaciones n
       set cuerpo = 'Tu solicitud ' || new.codigo || ' fue aprobada. Te depositaremos '
                    || public.texto_fecha_deposito(greatest(new.fecha_deposito, public.hoy_lima()))
                    || case when new.modalidad = 'siguiente' then ', como elegiste.' else '.' end
     where n.id = (
       select n2.id from public.notificaciones n2
         join public.perfiles_cliente p on p.user_id = n2.user_id
        where p.id = new.cliente_id
          and n2.tipo = 'solicitud_aprobada'
          and n2.cuerpo like 'Tu solicitud ' || new.codigo || '%'
        order by n2.created_at desc
        limit 1);
  end if;
  return new;
end;
$$;

-- AFTER: el aviso de resolver_caso se inserta en la misma transacción,
-- justo después del UPDATE; por eso se corrige al final.
drop trigger if exists tr_solicitudes_aviso_fecha on public.solicitudes;
create constraint trigger tr_solicitudes_aviso_fecha
  after update of estado on public.solicitudes
  deferrable initially deferred
  for each row execute function public.solicitudes_aviso_fecha();


-- ------------------------------------------------------------
-- 14) Historial de Pagos: también la cuenta de depósito
-- ------------------------------------------------------------
create or replace function public.pagos_historial(
  p_banco  text    default null,
  p_buscar text    default null,
  p_limite integer default 20,
  p_desde  integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
            'modalidad',      s.modalidad,
            'deposito', case when s.deposito_banco is not null then jsonb_build_object(
                          'banco', s.deposito_banco, 'tipo', s.deposito_tipo, 'ultimos_4', s.deposito_ultimos4) end,
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

notify pgrst, 'reload schema';
