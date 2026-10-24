-- ============================================================
--  HUELLAS DE LO QUE VE EL CLIENTE
--
--  La app guarda en el teléfono la última copia de cada grupo de datos
--  (perfil, comisiones, tarjetas...) y la muestra al instante. Para
--  saber si tiene que volver a descargarla, pregunta solo esto: una
--  huella (md5) por grupo. Si la huella no cambió, no descarga nada.
--
--  Las huellas se calculan sobre los mismos campos que muestra la app,
--  así que cualquier cambio desde el panel (aprobar una tarjeta, cambiar
--  una comisión, publicar una noticia) cambia la huella de su grupo.
--
--  SECURITY INVOKER a propósito: corre con los permisos del cliente.
--  Las políticas ya filtran lo suyo y la vigencia de noticias y
--  alertas; cuando una noticia vence, deja de verse y la huella cambia
--  sola, sin que nadie toque la fila.
-- ============================================================

create or replace function public.mis_versiones()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with p as (
    select * from public.perfiles_cliente where user_id = auth.uid()
  )
  select jsonb_build_object(
    'perfil', (
      select md5(coalesce(jsonb_agg(jsonb_build_object(
        'n', p.nombres, 'a', p.apellidos, 'td', p.tipo_documento, 'd', p.dni,
        't', p.telefono, 'dir', p.direccion, 'v', p.validado_por,
        'fv', p.fecha_validacion, 'mo', p.motivo_observacion, 'c', p.created_at,
        'e', (select u.estado from public.users u where u.id = auth.uid())
      ))::text, ''))
      from p
    ),
    'comisiones', md5(coalesce(public.mis_comisiones()::text, '')),
    'tarjetas', (
      select md5(coalesce(string_agg(
        t.id::text || t.estado::text || t.activa::text || coalesce(t.motivo_rechazo, '')
          || coalesce(t.nombre_impreso, '') || t.ultimos_4,
        ',' order by t.id), ''))
      from public.tarjetas t join p on t.cliente_id = p.id
    ),
    'cuentas', (
      select md5(coalesce(string_agg(
        c.id::text || c.banco::text || coalesce(c.tipo::text, '') || c.numero_cuenta || c.activa::text,
        ',' order by c.id), ''))
      from public.cuentas_bancarias c join p on c.cliente_id = p.id
    ),
    'solicitudes', (
      select md5(coalesce(string_agg(
        s.id::text || s.estado::text || coalesce(s.fecha_revision::text, '')
          || coalesce(s.pagado_en::text, '') || coalesce(s.motivo_rechazo, ''),
        ',' order by s.id), ''))
      from public.solicitudes s join p on s.cliente_id = p.id
    ),
    'noticias', (
      select md5(
        coalesce((
          select string_agg(
            a.id::text || a.activa::text || coalesce(a.titulo, '') || coalesce(a.mensaje, '')
              || coalesce(a.tipo::text, '')
              || coalesce(a.categoria::text, '') || coalesce(a.fecha_fin::text, '')
              || coalesce(a.imagenes::text, ''),
            ',' order by a.id)
          from public.alertas_sistema a
        ), '')
        || '|' ||
        coalesce((
          select string_agg(v.alerta_id::text, ',' order by v.alerta_id)
          from public.alertas_vistas v where v.user_id = auth.uid()
        ), '')
      )
    ),
    'guias', (
      select md5(coalesce(string_agg(
        g.id::text || g.activa::text || g.updated_at::text, ',' order by g.id), ''))
      from public.guias_banco g
    ),
    'avisos', (
      select md5(count(*)::text || coalesce(max(n.created_at)::text, '')
        || count(*) filter (where n.leida)::text)
      from public.notificaciones n where n.user_id = auth.uid()
    )
  );
$$;

revoke all on function public.mis_versiones() from public, anon;
grant execute on function public.mis_versiones() to authenticated;
