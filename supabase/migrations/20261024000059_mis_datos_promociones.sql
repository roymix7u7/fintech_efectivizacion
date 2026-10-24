-- ============================================================
--  MIS DATOS INCLUYE EL CONSENTIMIENTO DE PROMOCIONES
--
--  La descarga de Mis datos (migración 54) ahora dice si el cliente
--  acepta recibir promociones y desde cuándo (migración 58).
-- ============================================================

create or replace function public.mis_datos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (select * from public.perfiles_cliente where user_id = auth.uid())
  select jsonb_build_object(
    'generado_en', now(),
    'cuenta', (select jsonb_build_object('correo', u.email, 'estado', u.estado, 'creada_en', u.created_at)
               from public.users u where u.id = auth.uid()),
    'perfil', (select jsonb_build_object(
                 'nombres', p.nombres, 'apellidos', p.apellidos, 'tipo_documento', p.tipo_documento,
                 'documento', p.dni, 'celular', p.telefono, 'direccion', p.direccion,
                 'codigo_promocional', p.codigo_promo, 'verificado_el', p.fecha_validacion,
                 'acepta_promociones', p.acepta_promociones,
                 'promociones_actualizado_el', p.promociones_actualizado_en,
                 'fotos_guardadas', jsonb_build_object(
                   'documento_frente', p.foto_dni_frontal is not null,
                   'documento_reverso', p.foto_dni_posterior is not null,
                   'selfie', p.foto_selfie is not null))
               from p),
    'tarjetas', coalesce((select jsonb_agg(jsonb_build_object(
                  'banco', t.banco, 'ultimos_4', t.ultimos_4, 'nombre_impreso', t.nombre_impreso,
                  'estado', t.estado, 'activa', t.activa, 'registrada_el', t.created_at,
                  'con_foto', t.foto_tarjeta is not null) order by t.created_at)
                from public.tarjetas t join p on t.cliente_id = p.id), '[]'::jsonb),
    'cuentas', coalesce((select jsonb_agg(jsonb_build_object(
                  'banco', c.banco, 'tipo', c.tipo, 'numero', c.numero_cuenta, 'activa', c.activa,
                  'registrada_el', c.created_at) order by c.created_at)
                from public.cuentas_bancarias c join p on c.cliente_id = p.id), '[]'::jsonb),
    'solicitudes', coalesce((select jsonb_agg(jsonb_build_object(
                  'codigo', s.codigo, 'banco', s.banco, 'estado', s.estado, 'nota', s.nota_cliente,
                  'motivo_rechazo', s.motivo_rechazo, 'enviada_el', s.created_at,
                  'revisada_el', s.fecha_revision, 'pagada_el', s.pagado_en) order by s.created_at)
                from public.solicitudes s join p on s.cliente_id = p.id), '[]'::jsonb),
    'comisiones', public.mis_comisiones(),
    'consentimientos', coalesce((select jsonb_agg(jsonb_build_object(
                  'documento', c.tipo, 'version', c.version, 'aceptado_el', c.aceptado_en) order by c.aceptado_en)
                from public.consentimientos c where c.user_id = auth.uid()), '[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(jsonb_build_object(
                  'titulo', n.titulo, 'mensaje', n.cuerpo, 'fecha', n.created_at) order by n.created_at)
                from public.notificaciones n where n.user_id = auth.uid()), '[]'::jsonb),
    'pedidos_de_eliminacion', coalesce((select jsonb_agg(jsonb_build_object(
                  'estado', d.estado, 'pedido_el', d.creada_en, 'respuesta', d.respuesta) order by d.creada_en)
                from public.solicitudes_datos d where d.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;
