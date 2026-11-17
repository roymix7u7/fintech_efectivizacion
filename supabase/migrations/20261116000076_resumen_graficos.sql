-- Gráficos del Resumen del panel.
--
-- Una sola función devuelve todo lo que dibuja la pantalla, ya agregado:
-- nadie descarga solicitudes ni clientes para sumarlos en el navegador.
--
--   · Administrador: toda la empresa, o una sede si la elige (p_sede).
--   · Supervisor: siempre su propia sede (se ignora p_sede). Si su usuario
--     no tiene sede asignada, la función lo dice (sin_sede) y no entrega datos.
--   · Gestor, pagos y clientes: no reciben nada (null).
--
-- "De una sede" significa: solicitudes y tarjetas que revisó su personal,
-- identidades que verificó su personal y clientes que registró en el local.
-- Las solicitudes no guardan el monto de la operación, así que todo se
-- cuenta en cantidad de operaciones, no en soles.
--
-- Los días y las horas son de Lima.

create or replace function public.resumen_graficos(p_dias integer default 30, p_sede uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with p as (
    select
      least(greatest(coalesce(p_dias, 30), 7), 180) as dias,
      (now() at time zone 'America/Lima')::date as hoy,
      public.es_admin() as admin,
      case when public.es_admin() then p_sede else public.mi_sede() end as sede
  ),
  r as (
    select
      p.*,
      ((p.hoy - (p.dias - 1))::timestamp at time zone 'America/Lima') as desde,
      ((p.hoy - (2 * p.dias - 1))::timestamp at time zone 'America/Lima') as antes
    from p
  ),
  eq as (
    select u.id, u.email, u.rol::text as rol, u.sede_id
    from public.users u, r
    where u.rol <> 'cliente' and (r.sede is null or u.sede_id = r.sede)
  ),
  -- Solicitudes del alcance, desde el periodo anterior (para comparar).
  sol as (
    select s.id, s.banco, s.estado, s.motivo_rechazo, s.revisado_por, s.created_at, s.fecha_revision, s.pagado_en,
           (s.created_at at time zone 'America/Lima')::date as dia_creada,
           (s.fecha_revision at time zone 'America/Lima')::date as dia_revisada,
           (s.pagado_en at time zone 'America/Lima')::date as dia_pagada
    from public.solicitudes s, r
    where (r.sede is null or s.revisado_por in (select id from eq))
      and (s.created_at >= r.antes or s.fecha_revision >= r.antes or s.pagado_en >= r.antes)
  ),
  cli as (
    select c.id, c.created_at, c.fecha_validacion, c.validado_por, c.registrado_por, c.origen
    from public.perfiles_cliente c, r
    where (c.created_at >= r.antes or c.fecha_validacion >= r.antes)
  ),
  tar as (
    select t.id, t.revisado_por, t.fecha_revision
    from public.tarjetas t, r
    where t.fecha_revision >= r.antes
      and t.estado <> 'pendiente'
      and (r.sede is null or t.revisado_por in (select id from eq))
  ),
  dias as (
    select d::date as dia from r, generate_series(r.hoy - (r.dias - 1), r.hoy, interval '1 day') d
  ),
  serie as (
    select
      d.dia,
      (select count(*) from sol where dia_creada = d.dia) as recibidas,
      (select count(*) from sol where dia_revisada = d.dia and estado in ('aprobado', 'pagado')) as aprobadas,
      (select count(*) from sol where dia_revisada = d.dia and estado = 'rechazado') as rechazadas,
      (select count(*) from sol where dia_pagada = d.dia) as pagadas,
      (select round(avg(extract(epoch from (fecha_revision - created_at)) / 60)::numeric, 1)
         from sol where dia_revisada = d.dia and estado in ('aprobado', 'pagado', 'rechazado')) as min_revision,
      (select count(*) from cli, r
         where (cli.created_at at time zone 'America/Lima')::date = d.dia
           and (r.sede is null or cli.registrado_por in (select id from eq))) as clientes,
      (select count(*) from cli, r
         where (cli.fecha_validacion at time zone 'America/Lima')::date = d.dia
           and (r.sede is null or cli.validado_por in (select id from eq))) as verificados,
      (select count(*) from tar where (tar.fecha_revision at time zone 'America/Lima')::date = d.dia) as tarjetas
    from dias d
  ),
  -- Totales del periodo y del periodo anterior, del mismo largo.
  tot as (
    select
      x.periodo,
      (select count(*) from sol where created_at >= x.ini and created_at < x.fin) as recibidas,
      (select count(*) from sol where fecha_revision >= x.ini and fecha_revision < x.fin and estado in ('aprobado', 'pagado')) as aprobadas,
      (select count(*) from sol where fecha_revision >= x.ini and fecha_revision < x.fin and estado = 'rechazado') as rechazadas,
      (select count(*) from sol where pagado_en >= x.ini and pagado_en < x.fin) as pagadas,
      (select round(avg(extract(epoch from (fecha_revision - created_at)) / 60)::numeric, 1)
         from sol where fecha_revision >= x.ini and fecha_revision < x.fin and estado in ('aprobado', 'pagado', 'rechazado')) as min_revision,
      (select round(avg(extract(epoch from (pagado_en - fecha_revision)) / 60)::numeric, 1)
         from sol where pagado_en >= x.ini and pagado_en < x.fin and fecha_revision is not null) as min_pago,
      (select count(*) from cli, r where cli.created_at >= x.ini and cli.created_at < x.fin
           and (r.sede is null or cli.registrado_por in (select id from eq))) as clientes,
      (select count(*) from cli, r where cli.fecha_validacion >= x.ini and cli.fecha_validacion < x.fin
           and (r.sede is null or cli.validado_por in (select id from eq))) as verificados
    from r, lateral (values ('actual', r.desde, now()), ('anterior', r.antes, r.desde)) as x(periodo, ini, fin)
  ),
  bancos as (
    select banco,
           count(*) as total,
           count(*) filter (where estado in ('aprobado', 'pagado')) as aprobadas,
           count(*) filter (where estado = 'rechazado') as rechazadas
    from sol, r
    where sol.created_at >= r.desde
    group by banco
  ),
  horas as (
    select extract(hour from (sol.created_at at time zone 'America/Lima'))::int as hora, count(*) as total
    from sol, r
    where sol.created_at >= r.desde
    group by 1
  ),
  motivos as (
    select left(trim(motivo_rechazo), 80) as motivo, count(*) as total
    from sol, r
    where sol.estado = 'rechazado' and sol.fecha_revision >= r.desde and coalesce(trim(motivo_rechazo), '') <> ''
    group by 1
    order by 2 desc
    limit 5
  ),
  personas as (
    select
      e.id, e.email, e.rol,
      (select count(*) from sol, r where sol.revisado_por = e.id and sol.fecha_revision >= r.desde and sol.estado in ('aprobado', 'pagado')) as aprobadas,
      (select count(*) from sol, r where sol.revisado_por = e.id and sol.fecha_revision >= r.desde and sol.estado = 'rechazado') as rechazadas,
      (select count(*) from cli, r where cli.validado_por = e.id and cli.fecha_validacion >= r.desde) as identidades,
      (select count(*) from tar, r where tar.revisado_por = e.id and tar.fecha_revision >= r.desde) as tarjetas,
      (select round(avg(extract(epoch from (sol.fecha_revision - sol.created_at)) / 60)::numeric, 1)
         from sol, r where sol.revisado_por = e.id and sol.fecha_revision >= r.desde and sol.estado in ('aprobado', 'pagado', 'rechazado')) as min_revision
    from eq e
  ),
  -- Comparación entre sedes: solo para el administrador viendo toda la empresa.
  sedes as (
    select
      s.id, s.nombre,
      (select count(*) from public.users u where u.sede_id = s.id and u.rol <> 'cliente') as personas,
      (select count(*) from sol, r where sol.fecha_revision >= r.desde and sol.estado in ('aprobado', 'pagado')
          and sol.revisado_por in (select id from public.users where sede_id = s.id)) as aprobadas,
      (select count(*) from sol, r where sol.fecha_revision >= r.desde and sol.estado = 'rechazado'
          and sol.revisado_por in (select id from public.users where sede_id = s.id)) as rechazadas,
      (select count(*) from cli, r where cli.created_at >= r.desde
          and cli.registrado_por in (select id from public.users where sede_id = s.id)) as clientes,
      (select round(avg(extract(epoch from (sol.fecha_revision - sol.created_at)) / 60)::numeric, 1)
         from sol, r where sol.fecha_revision >= r.desde and sol.estado in ('aprobado', 'pagado', 'rechazado')
          and sol.revisado_por in (select id from public.users where sede_id = s.id)) as min_revision
    from public.sedes s, r
    where s.activa and r.admin and r.sede is null
  )
  select case
    when not public.es_supervisor() then null
    when not r.admin and r.sede is null then jsonb_build_object('sin_sede', true)
    else jsonb_build_object(
      'dias', r.dias,
      'alcance', case when r.sede is null then 'empresa' else 'sede' end,
      'sede', (select jsonb_build_object('id', s.id, 'nombre', s.nombre) from public.sedes s where s.id = r.sede),
      'serie', (select coalesce(jsonb_agg(to_jsonb(serie) order by serie.dia), '[]'::jsonb) from serie),
      'actual', (select to_jsonb(tot) - 'periodo' from tot where periodo = 'actual'),
      'anterior', (select to_jsonb(tot) - 'periodo' from tot where periodo = 'anterior'),
      'bancos', (select coalesce(jsonb_agg(to_jsonb(bancos) order by bancos.total desc), '[]'::jsonb) from bancos),
      'horas', (select coalesce(jsonb_agg(to_jsonb(horas) order by horas.hora), '[]'::jsonb) from horas),
      'motivos', (select coalesce(jsonb_agg(to_jsonb(motivos) order by motivos.total desc), '[]'::jsonb) from motivos),
      'personas', (select coalesce(jsonb_agg(to_jsonb(personas) order by (personas.aprobadas + personas.rechazadas + personas.identidades + personas.tarjetas) desc), '[]'::jsonb)
                     from personas where personas.aprobadas + personas.rechazadas + personas.identidades + personas.tarjetas > 0),
      'sedes', (select coalesce(jsonb_agg(to_jsonb(sedes) order by (sedes.aprobadas + sedes.rechazadas) desc, sedes.nombre), '[]'::jsonb) from sedes)
    )
  end
  from r;
$function$;

revoke all on function public.resumen_graficos(integer, uuid) from public, anon;
grant execute on function public.resumen_graficos(integer, uuid) to authenticated;
