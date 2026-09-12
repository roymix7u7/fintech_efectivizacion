-- ============================================================
--  CORRECCION A 02-integridad.sql
--  Ejecutar entero. Son dos sentencias.
-- ============================================================

-- ------------------------------------------------------------
--  El indice de tarjeta duplicada estaba mas estricto que la app
--
--  La app permite volver a registrar una tarjeta que fue
--  rechazada, porque puede tratarse de una foto mala que el
--  cliente quiere reintentar. Pero una tarjeta rechazada sigue
--  con activa = true, asi que el indice la contaba y el segundo
--  intento fallaba con violacion de clave unica.
--
--  El indice ahora ignora las rechazadas, igual que la app.
-- ------------------------------------------------------------

drop index if exists public.tarjetas_cliente_banco_ultimos4_unico;

create unique index tarjetas_cliente_banco_ultimos4_unico
  on public.tarjetas (cliente_id, banco, ultimos_4)
  where activa = true and estado <> 'rechazado';
