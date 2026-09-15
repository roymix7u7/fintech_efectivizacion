-- ============================================================
--  EL INICIO COMO EL DE UN BANCO
--
--  El rediseno del inicio muestra lo que un cliente mira primero
--  en una banca movil: en que van sus operaciones y sus ultimos
--  movimientos. El resumen no traia ninguna de las dos cosas.
--
--  Se agrega, sin quitar nada (el app ya instalada sigue leyendo
--  los campos de siempre):
--
--    · stats.por_pagar, stats.pagadas y stats.rechazadas, para
--      separar lo aprobado de lo que ya se deposito;
--    · recientes: las ultimas cuatro solicitudes;
--    · cuentas: cuantas cuentas bancarias activas tiene. Sin
--      ninguna, Pagos no tiene donde depositarle, y hasta ahora
--      nadie se lo advertia al cliente;
--    · tarjetas_en_verificacion: para decirle "la estamos
--      verificando" en vez de pedirle que registre una tarjeta que
--      ya envio.
-- ============================================================

create or replace function public.resumen_inicio()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_perfil  public.perfiles_cliente%rowtype;
  v_bancos  text[];
begin
  select * into v_perfil
  from public.perfiles_cliente
  where user_id = auth.uid();

  if v_perfil.id is null then
    return jsonb_build_object(
      'perfil', null,
      'stats', jsonb_build_object(
        'pendientes', 0, 'aprobadas', 0, 'tarjetas', 0,
        'por_pagar', 0, 'pagadas', 0, 'rechazadas', 0),
      'bancos', '[]'::jsonb,
      'alertas', '[]'::jsonb,
      'alertas_sin_ver', 0,
      'guias', '[]'::jsonb,
      'hay_guias', false,
      'recientes', '[]'::jsonb,
      'cuentas', 0,
      'tarjetas_en_verificacion', 0
    );
  end if;

  select coalesce(array_agg(distinct banco), '{}')
    into v_bancos
  from public.tarjetas
  where cliente_id = v_perfil.id and activa = true and estado = 'aprobado';

  return jsonb_build_object(
    'perfil', to_jsonb(v_perfil),

    'stats', (
      select jsonb_build_object(
        'pendientes', count(*) filter (where estado = 'pendiente'),
        -- Se mantiene sumando lo pagado, como antes, por compatibilidad.
        'aprobadas',  count(*) filter (where estado in ('aprobado', 'pagado')),
        'por_pagar',  count(*) filter (where estado = 'aprobado'),
        'pagadas',    count(*) filter (where estado = 'pagado'),
        'rechazadas', count(*) filter (where estado = 'rechazado'),
        'tarjetas',   coalesce(array_length(v_bancos, 1), 0)
      )
      from public.solicitudes
      where cliente_id = v_perfil.id
    ),

    'bancos', to_jsonb(v_bancos),

    'recientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'codigo', r.codigo, 'banco', r.banco,
               'estado', r.estado, 'created_at', r.created_at,
               'fecha_revision', r.fecha_revision, 'pagado_en', r.pagado_en,
               'ultimos_4', r.ultimos_4
             ) order by r.created_at desc)
      from (
        select s.id, s.codigo, s.banco, s.estado, s.created_at,
               s.fecha_revision, s.pagado_en, t.ultimos_4
        from public.solicitudes s
        left join public.tarjetas t on t.id = s.tarjeta_id
        where s.cliente_id = v_perfil.id
        order by s.created_at desc
        limit 4
      ) r
    ), '[]'::jsonb),

    'cuentas', (
      select count(*) from public.cuentas_bancarias
      where cliente_id = v_perfil.id and activa = true
    ),

    'tarjetas_en_verificacion', (
      select count(*) from public.tarjetas
      where cliente_id = v_perfil.id and activa = true and estado = 'pendiente'
    ),

    'alertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'titulo', a.titulo, 'mensaje', a.mensaje,
               'tipo', a.tipo, 'created_at', a.created_at,
               'portada', a.imagenes[1]
             ) order by a.fecha_inicio desc)
      from (select * from public.alertas_sistema
             where categoria = 'noticia'
               and public.noticia_vigente(activa, fecha_inicio, fecha_fin)
             order by fecha_inicio desc limit 5) a
    ), '[]'::jsonb),

    'alertas_sin_ver', (
      select count(*)
      from public.alertas_sistema a
      where a.categoria = 'alerta'
        and public.noticia_vigente(a.activa, a.fecha_inicio, a.fecha_fin)
        and not exists (
          select 1 from public.alertas_vistas v
          where v.alerta_id = a.id and v.user_id = auth.uid()
        )
    ),

    'guias', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'banco', g.banco)
                       order by g.banco)
      from public.guias_banco g
      where g.activa = true and g.banco = any(v_bancos)
    ), '[]'::jsonb),

    'hay_guias', exists(select 1 from public.guias_banco where activa = true)
  );
end;
$$;

grant execute on function public.resumen_inicio() to authenticated;
revoke execute on function public.resumen_inicio() from anon;

notify pgrst, 'reload schema';
