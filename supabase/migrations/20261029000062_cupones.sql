-- ============================================================
--  CUPONES DE COMISIÓN
--
--  En el panel, los "bloques" pasan a llamarse cupones: un cupón es el
--  juego de tarifas por banco que tiene cada cliente. Por dentro siguen
--  siendo las mismas tablas (bloques_comision y bloques_comision_banco),
--  así que comision_efectiva, la app y las especiales no cambian.
--
--  Lo nuevo es la comisión mínima de la hoja oficial: cada tarifa puede
--  tener un mínimo en soles que se cobra cuando la operación es menor
--  a un monto (por ejemplo, BCP 1 % con mínimo S/12 bajo S/1,200).
--  Ambos van juntos: o los dos o ninguno.
--
--  El cupón General (el predeterminado) queda con la tarifa estándar
--  publicada en la landing.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Mínimo y monto límite por tarifa
-- ------------------------------------------------------------
alter table public.bloques_comision_banco
  add column if not exists minimo numeric(10,2),
  add column if not exists limite numeric(12,2);

alter table public.bloques_comision_banco
  drop constraint if exists bloques_banco_minimo_valido;
alter table public.bloques_comision_banco
  add constraint bloques_banco_minimo_valido check (
    (minimo is null and limite is null)
    or (minimo > 0 and limite > 0 and minimo < limite)
  );


-- ------------------------------------------------------------
-- 2) Guardar la tarifa de un cupón (solo administrador)
-- ------------------------------------------------------------
create or replace function public.guardar_tarifa_cupon(
  p_cupon      uuid,
  p_banco      text,
  p_porcentaje numeric,
  p_minimo     numeric default null,
  p_limite     numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador cambia las tarifas de un cupón.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.bloques_comision where id = p_cupon) then
    raise exception 'Ese cupón no existe.' using errcode = 'P0001';
  end if;
  if p_banco is null or p_banco not in ('BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif', 'CMR', 'Otros') then
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

  insert into public.bloques_comision_banco (bloque_id, banco, porcentaje, minimo, limite)
  values (p_cupon, p_banco, p_porcentaje, p_minimo, p_limite)
  on conflict (bloque_id, banco) do update
    set porcentaje = excluded.porcentaje,
        minimo     = excluded.minimo,
        limite     = excluded.limite;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'TARIFA_CUPON', 'bloques_comision', p_cupon,
          jsonb_build_object('banco', p_banco, 'porcentaje', p_porcentaje, 'minimo', p_minimo, 'limite', p_limite));
end;
$$;

revoke all on function public.guardar_tarifa_cupon(uuid, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.guardar_tarifa_cupon(uuid, text, numeric, numeric, numeric) to authenticated;

-- La función vieja (solo porcentaje) se conserva por compatibilidad,
-- pero ya no borra el mínimo de una tarifa al cambiar el porcentaje.
create or replace function public.guardar_tarifa_bloque(p_bloque uuid, p_banco text, p_porcentaje numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador cambia las tarifas de un cupón.' using errcode = '42501';
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


-- ------------------------------------------------------------
-- 3) Listado para el panel, con el mínimo
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
      'clientes', (select count(*) from public.perfiles_cliente p where p.bloque_id = b.id),
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


-- ------------------------------------------------------------
-- 4) Lo que ve el cliente: su tarifa y, si tiene, su mínimo.
--    Una especial no lleva mínimo: es un acuerdo puntual.
-- ------------------------------------------------------------
create or replace function public.mis_comisiones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
  v_bloque  uuid;
  v_nombre  text;
begin
  select id, bloque_id into v_cliente, v_bloque from public.perfiles_cliente where user_id = auth.uid();
  if v_cliente is null then
    return jsonb_build_object('bloque', null, 'bancos', '[]'::jsonb);
  end if;

  select nombre into v_nombre from public.bloques_comision where id = v_bloque;

  return jsonb_build_object(
    'bloque', v_nombre,
    'bancos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'banco', x.banco,
               'porcentaje', public.comision_efectiva(v_cliente, x.banco),
               'especial', x.especial,
               'minimo', case when x.especial then null else bb.minimo end,
               'limite', case when x.especial then null else bb.limite end,
               'con_tarjeta', x.con_tarjeta
             ) order by x.con_tarjeta desc, x.banco)
      from (
        select y.banco,
               public.origen_comision(v_cliente, y.banco) = 'especial' as especial,
               exists (select 1 from public.tarjetas t
                        where t.cliente_id = v_cliente and t.activa = true
                          and t.estado = 'aprobado' and t.banco = y.banco) as con_tarjeta
        from (
          select banco from public.bloques_comision_banco where bloque_id = v_bloque
          union
          select banco from public.comisiones_cliente where cliente_id = v_cliente
          union
          select banco from public.tarjetas
           where cliente_id = v_cliente and activa = true and estado = 'aprobado'
        ) y
      ) x
      left join public.bloques_comision_banco bb on bb.bloque_id = v_bloque and bb.banco = x.banco
    ), '[]'::jsonb)
  );
end;
$$;


-- ------------------------------------------------------------
-- 5) Cupón General = tarifa estándar de la landing
--      BCP, BBVA, BanBif     1 %   mínimo S/12 bajo S/1,200
--      Scotiabank            1.5 % mínimo S/20 bajo S/2,000
--      Interbank, CMR        2 %   mínimo S/30 bajo S/1,500
--      Otras tarjetas        8 %   (hoja oficial; no se publica)
-- ------------------------------------------------------------
insert into public.bloques_comision_banco (bloque_id, banco, porcentaje, minimo, limite)
select b.id, t.banco, t.porcentaje, t.minimo, t.limite
from public.bloques_comision b
cross join (values
  ('BCP',        1.00, 12.00, 1200.00),
  ('BBVA',       1.00, 12.00, 1200.00),
  ('BanBif',     1.00, 12.00, 1200.00),
  ('Scotiabank', 1.50, 20.00, 2000.00),
  ('Interbank',  2.00, 30.00, 1500.00),
  ('CMR',        2.00, 30.00, 1500.00),
  ('Otros',      8.00, null,  null)
) as t(banco, porcentaje, minimo, limite)
where b.es_default
on conflict (bloque_id, banco) do update
  set porcentaje = excluded.porcentaje,
      minimo     = excluded.minimo,
      limite     = excluded.limite;

update public.bloques_comision
   set descripcion = 'Tarifa estándar publicada en la web. La reciben los clientes nuevos.'
 where es_default;
