/**
 * Bancos de tarjeta que acepta el app.
 *
 * Debe coincidir con la lista de app/app/(tabs)/tarjetas.js: es el
 * banco que guarda cada solicitud, y por el que se reparte Pagos.
 */
export const BANCOS_TARJETA = [
  "BCP",
  "BBVA",
  "Interbank",
  "Scotiabank",
  "BanBif",
  "CMR",
  "Otros",
];

/**
 * A qué cuentas del cliente se le puede depositar una solicitud.
 *
 * Es la misma regla que app/src/lib/deposito.js y que el trigger de
 * solicitudes en la base: si cambia en uno, cambia en los tres.
 *
 *   - Recibe la cuenta NORMAL (ahorros). La CCI es solo un dato extra.
 *   - Tarjeta de banco principal: cuenta normal del mismo banco.
 *   - Tarjeta CMR u "Otros": cuenta normal de cualquier banco.
 */
export const BANCOS_PRINCIPALES = ["BCP", "BBVA", "Interbank", "Scotiabank", "BanBif"];

export function recibeDeposito(bancoTarjeta, cuenta) {
  if (!cuenta || cuenta.tipo === "interbancaria") return false;
  if (BANCOS_PRINCIPALES.includes(bancoTarjeta)) return cuenta.banco === bancoTarjeta;
  return true;
}
