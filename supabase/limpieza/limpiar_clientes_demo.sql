-- ============================================================
--  LIMPIEZA PARA EMPEZAR LA DEMO / SALIR EN VIVO
-- ============================================================
--  BORRA PARA SIEMPRE todos los clientes y lo que hicieron:
--    cuentas de acceso de clientes, perfiles, tarjetas, cuentas bancarias,
--    solicitudes, lotes y eventos de pago, operaciones, seguimientos,
--    observaciones, consentimientos, reclamos, pedidos de datos, avisos
--    de clientes y el registro de auditoría (queda en cero).
--
--  CONSERVA la configuración:
--    personal (users que no son clientes) y su acceso, sedes, cupones y
--    tarifas, comisiones por banco, bancos de Pagos, quién atiende el chat,
--    documentos legales, feriados, guías de bancos y noticias.
--
--  NO es una migración: se corre a mano, una vez, en el SQL Editor.
--  Las FOTOS no se borran con SQL: vaciar en Storage los buckets
--  kyc-documentos, tarjetas-fotos y comprobantes (ver README de limpieza).
--
--  Va en una transacción: si algo falla, no se borra nada.
-- ============================================================

-- 0) Vista previa (puedes correr solo esto primero).
select
  (select count(*) from public.users where rol = 'cliente')            as clientes,
  (select count(*) from public.users where rol <> 'cliente')           as personal_que_se_queda,
  (select count(*) from public.solicitudes)                            as solicitudes,
  (select count(*) from public.tarjetas)                               as tarjetas,
  (select count(*) from auth.users au
     where not exists (select 1 from public.users u where u.id = au.id)) as registros_a_medias;

begin;

-- 1) Todo lo de los clientes. TRUNCATE sin CASCADE: si alguna tabla de
--    configuración dependiera de estas, falla en vez de borrarla.
truncate table
  public.pagos_eventos,
  public.solicitudes,
  public.operaciones,
  public.lotes_pago,
  public.tarjetas,
  public.cuentas_bancarias,
  public.comisiones_cliente,
  public.seguimientos,
  public.observaciones,
  public.perfiles_cliente,
  public.consentimientos,
  public.reclamaciones,
  public.solicitudes_datos,
  public.datos_conservados,
  public.auditoria_logs;

-- 2) Su acceso: clientes y registros que quedaron a medias (sin fila en
--    users; el personal siempre tiene la suya). Se llevan sus sesiones,
--    avisos vistos, tokens del app y avisos del navegador.
delete from auth.users au
 where au.id in (select id from public.users where rol = 'cliente')
    or not exists (select 1 from public.users u where u.id = au.id);

-- 3) Sus filas en users (se llevan sus notificaciones).
delete from public.users where rol = 'cliente';

-- 4) Lo que el personal tenía tomado de la cola ya no existe.
update public.users set asignado_a = null where asignado_a is not null;

commit;

-- 5) Cómo quedó.
select
  (select count(*) from public.users where rol = 'cliente') as clientes,
  (select count(*) from public.users where rol <> 'cliente') as personal,
  (select count(*) from public.solicitudes) as solicitudes,
  (select count(*) from public.notificaciones) as notificaciones,
  (select count(*) from public.documentos_legales) as documentos_legales,
  (select count(*) from public.bloques_comision) as cupones;
