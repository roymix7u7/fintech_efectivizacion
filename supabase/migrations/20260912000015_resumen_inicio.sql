-- ============================================================
--  TODO EL INICIO EN UNA SOLA CONSULTA
--
--  La pantalla de inicio hacia siete viajes al servidor, uno
--  detras de otro: sesion, perfil, pendientes, aprobadas,
--  tarjetas, alertas y guias. Cada uno esperaba al anterior, asi
--  que el tiempo total era la suma de los siete.
--
--  Con una red movil de 200 ms por viaje, eso son casi un
--  segundo y medio de pantalla vacia. Aqui se resuelve todo del
--  lado del servidor y se devuelve en una sola respuesta.
--
--  Sin SECURITY DEFINER a proposito: asi siguen aplicando las
--  politicas RLS y cada cliente solo ve lo suyo.
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
      'stats', jsonb_build_object('pendientes', 0, 'aprobadas', 0, 'tarjetas', 0),
      'bancos', '[]'::jsonb,
      'alertas', '[]'::jsonb,
      'guias', '[]'::jsonb
    );
  end if;

  -- Bancos con tarjeta verificada. Sirve para el contador y para
  -- decidir que guias mostrar.
  select coalesce(array_agg(distinct banco), '{}')
    into v_bancos
  from public.tarjetas
  where cliente_id = v_perfil.id and activa = true and estado = 'aprobado';

  return jsonb_build_object(
    'perfil', to_jsonb(v_perfil),

    'stats', jsonb_build_object(
      'pendientes', (select count(*) from public.solicitudes
                      where cliente_id = v_perfil.id and estado = 'pendiente'),
      'aprobadas',  (select count(*) from public.solicitudes
                      where cliente_id = v_perfil.id and estado = 'aprobado'),
      'tarjetas',   coalesce(array_length(v_bancos, 1), 0)
    ),

    'bancos', to_jsonb(v_bancos),

    'alertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'titulo', a.titulo, 'mensaje', a.mensaje,
               'tipo', a.tipo, 'created_at', a.created_at
             ) order by a.created_at desc)
      from (select * from public.alertas_sistema
             where activa = true
             order by created_at desc limit 3) a
    ), '[]'::jsonb),

    -- Solo las guias de los bancos donde el cliente tiene tarjeta.
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
