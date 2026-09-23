-- ============================================================
--  EL GESTOR TIENE QUE VER LOS BLOQUES
--
--  Al aprobar una identidad, el gestor elige a que bloque de
--  comisiones pertenece el cliente. Pero listar_bloques() solo
--  respondia a supervisores: el gestor veria una lista vacia y no
--  podria aprobar a nadie.
--
--  Ver los bloques no es decidir sobre ellos: crearlos y cambiar
--  sus tarifas sigue siendo solo del administrador.
-- ============================================================

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
        select jsonb_agg(jsonb_build_object('banco', bb.banco, 'porcentaje', bb.porcentaje)
                         order by bb.banco)
        from public.bloques_comision_banco bb where bb.bloque_id = b.id
      ), '[]'::jsonb)
    ) order by b.es_default desc, b.nombre)
    from public.bloques_comision b
    where b.activo or public.es_supervisor()
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;

notify pgrst, 'reload schema';
