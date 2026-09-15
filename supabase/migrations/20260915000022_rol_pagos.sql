-- ============================================================
--  ROL NUEVO: PAGOS
--
--  Revisar un comprobante y pagar son dos trabajos distintos. El
--  gestor mira si el comprobante esta bien enviado; el encargado
--  de pagos solo entra a pagar lo que ya se aprobo, organizado
--  por el banco de la tarjeta.
--
--  En su propio archivo porque Postgres no deja usar un valor de
--  enum en la misma transaccion en que se agrega. La migracion
--  siguiente ya puede referirse a 'pagos'.
-- ============================================================

alter type public.rol_usuario add value if not exists 'pagos';
