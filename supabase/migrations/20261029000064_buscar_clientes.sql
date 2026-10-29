-- ============================================================
--  BUSCAR CLIENTES (panel → Clientes)
--
--  La vista no carga la lista completa: muestra los 10 últimos
--  registrados y, al buscar, hasta 20 resultados. El filtro y el
--  límite se aplican aquí, en la base, no en el navegador.
--
--  La usan administrador, supervisor y pagos. Pagos no es "staff" para
--  las políticas (es_staff), así que estas funciones verifican el rol
--  por su cuenta y devuelven solo lo necesario.
--
--  Requiere la migración 20261029000063 (cupones con vigencia).
-- ============================================================

create or replace function public.puede_ver_clientes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_supervisor() or public.es_pagos();
$$;

revoke all on function public.puede_ver_clientes() from public, anon;
grant execute on function public.puede_ver_clientes() to authenticated;


-- ------------------------------------------------------------
-- 1) Buscar: por nombre, apellido o DNI y por fecha de registro
-- ------------------------------------------------------------
create or replace function public.buscar_clientes(
  p_texto  text    default null,
  p_desde  date    default null,
  p_hasta  date    default null,
  p_filtro text    default 'todos',
  p_limite integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_texto  text := nullif(trim(coalesce(p_texto, '')), '');
  v_limite integer := least(greatest(coalesce(p_limite, 10), 1), 20);
  v_ahora  timestamptz := now();
  v_total  integer;
  v_filas  jsonb;
begin
  if not public.puede_ver_clientes() then
    raise exception 'Tu rol no puede ver clientes.' using errcode = '42501';
  end if;
  if v_texto is not null and length(v_texto) < 2 then
    v_texto := null;
  end if;

  with base as (
    select p.*
      from public.perfiles_cliente p
     where (v_texto is null
            or (p.nombres || ' ' || p.apellidos) ilike '%' || v_texto || '%'
            or (p.apellidos || ' ' || p.nombres) ilike '%' || v_texto || '%'
            or p.dni like v_texto || '%')
       and (p_desde is null or (p.created_at at time zone 'America/Lima')::date >= p_desde)
       and (p_hasta is null or (p.created_at at time zone 'America/Lima')::date <= p_hasta)
       and (coalesce(p_filtro, 'todos') = 'todos'
            or (p_filtro = 'cupon'      and p.cupon_hasta > v_ahora)
            or (p_filtro = 'por_vencer' and p.cupon_hasta > v_ahora and p.cupon_hasta <= v_ahora + interval '30 days')
            or (p_filtro = 'vencido'    and p.cupon_hasta <= v_ahora))
  )
  select (select count(*) from base),
         coalesce(jsonb_agg(fila order by creado desc), '[]'::jsonb)
    into v_total, v_filas
    from (
      select b.created_at as creado,
             jsonb_build_object(
               'id', b.id,
               'nombres', b.nombres,
               'apellidos', b.apellidos,
               'dni', b.dni,
               'tipo_documento', b.tipo_documento,
               'telefono', b.telefono,
               'direccion', b.direccion,
               'created_at', b.created_at,
               'fecha_validacion', b.fecha_validacion,
               'bloque_id', b.bloque_id,
               'cupon_desde', b.cupon_desde,
               'cupon_hasta', b.cupon_hasta,
               'foto_dni_frontal', b.foto_dni_frontal,
               'foto_dni_posterior', b.foto_dni_posterior,
               'foto_selfie', b.foto_selfie,
               'cupon', (select jsonb_build_object('id', c.id, 'nombre', c.nombre, 'es_default', c.es_default, 'duracion_dias', c.duracion_dias)
                           from public.bloques_comision c where c.id = b.bloque_id),
               'usuario', (select jsonb_build_object('email', u.email, 'estado', u.estado)
                             from public.users u where u.id = b.user_id)
             ) as fila
        from base b
       order by b.created_at desc
       limit v_limite
    ) x;

  return jsonb_build_object('total', v_total, 'clientes', v_filas);
end;
$$;

revoke all on function public.buscar_clientes(text, date, date, text, integer) from public, anon;
grant execute on function public.buscar_clientes(text, date, date, text, integer) to authenticated;


-- ------------------------------------------------------------
-- 2) Ficha: tarjetas, cuentas (solo los últimos 4) y especiales
-- ------------------------------------------------------------
create or replace function public.ficha_cliente(p_cliente uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver_clientes() then
    raise exception 'Tu rol no puede ver clientes.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'tarjetas', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'banco', t.banco, 'ultimos_4', t.ultimos_4, 'estado', t.estado)
                       order by t.created_at desc)
        from public.tarjetas t where t.cliente_id = p_cliente and t.activa), '[]'::jsonb),
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'banco', c.banco, 'tipo', c.tipo, 'ultimos_4', right(c.numero_cuenta, 4))
                       order by c.banco)
        from public.cuentas_bancarias c where c.cliente_id = p_cliente and c.activa), '[]'::jsonb),
    'especiales', coalesce((
      select jsonb_agg(jsonb_build_object('banco', e.banco, 'porcentaje', e.porcentaje, 'motivo', e.motivo))
        from public.comisiones_cliente e where e.cliente_id = p_cliente), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ficha_cliente(uuid) from public, anon;
grant execute on function public.ficha_cliente(uuid) to authenticated;


-- ------------------------------------------------------------
-- 3) Fotos de identidad: pagos también puede verlas, al pedirlas
-- ------------------------------------------------------------
create or replace function public.registrar_vista_fotos(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.es_staff() or public.es_pagos()) then
    raise exception 'Tu rol no puede ver las fotos de un cliente.' using errcode = '42501';
  end if;
  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'VER_FOTOS_CLIENTE', 'perfiles_cliente', p_cliente, '{}'::jsonb);
end;
$$;

drop policy if exists storage_kyc_pagos on storage.objects;
create policy storage_kyc_pagos on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc-documentos' and public.es_pagos());

notify pgrst, 'reload schema';
