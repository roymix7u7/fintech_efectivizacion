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
  "iO",
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
 *   - Tarjeta CMR, iO u "Otros": cuenta normal de cualquier banco.
 */
export const BANCOS_PRINCIPALES = [
  "BCP",
  "BBVA",
  "Interbank",
  "Scotiabank",
  "BanBif",
];

export function recibeDeposito(bancoTarjeta, cuenta) {
  if (!cuenta || cuenta.tipo === "interbancaria") return false;
  if (BANCOS_PRINCIPALES.includes(bancoTarjeta))
    return cuenta.banco === bancoTarjeta;
  return true;
}

/** Orden en que se muestran los bancos (igual que la app). */
export const ORDEN_BANCOS = [...BANCOS_PRINCIPALES, "CMR", "iO", "Otros"];
export const nombreBanco = (b) => (b === "Otros" ? "Otro banco" : b);

/** Cuentas en las que se puede depositar una operación de esa tarjeta. */
export const cuentasDeDeposito = (bancoTarjeta, cuentas = []) =>
  bancoTarjeta
    ? (cuentas || []).filter((c) => recibeDeposito(bancoTarjeta, c))
    : [];

/**
 * Qué le falta al cliente para que esa tarjeta pueda operar, dicho para
 * él (app/src/lib/deposito.js). null si no le falta nada.
 */
export function faltaParaRecibir(bancoTarjeta, cuentas = []) {
  if (!bancoTarjeta || cuentasDeDeposito(bancoTarjeta, cuentas).length)
    return null;
  if (!BANCOS_PRINCIPALES.includes(bancoTarjeta)) {
    return {
      banco: null,
      titulo: "Falta una cuenta de ahorros",
      detalle: `Con tu tarjeta ${nombreBanco(bancoTarjeta)} te depositamos en tu cuenta de ahorros de cualquier banco.`,
    };
  }
  const soloCci = (cuentas || []).some(
    (c) => c.banco === bancoTarjeta && c.tipo === "interbancaria",
  );
  return {
    banco: bancoTarjeta,
    titulo: `Falta tu cuenta de ahorros ${bancoTarjeta}`,
    detalle: soloCci
      ? `Tu CCI ${bancoTarjeta} no basta: el depósito va a tu cuenta de ahorros del mismo banco.`
      : `Te depositamos en tu cuenta de ahorros ${bancoTarjeta}, el mismo banco de la tarjeta.`,
  };
}

/** Color de cada banco, el mismo de la app (app/src/theme/tokens.js). */
export const COLOR_BANCO = {
  BCP: { fondo: "#E67E00", texto: "#0F1B33", sigla: "BCP" },
  BBVA: { fondo: "#004481", texto: "#FFFFFF", sigla: "BBVA" },
  Interbank: { fondo: "#00855A", texto: "#FFFFFF", sigla: "IBK" },
  Scotiabank: { fondo: "#CC0000", texto: "#FFFFFF", sigla: "SBK" },
  BanBif: { fondo: "#0077C0", texto: "#FFFFFF", sigla: "BIF" },
  CMR: { fondo: "#00897B", texto: "#FFFFFF", sigla: "CMR" },
  iO: { fondo: "#5B3FD6", texto: "#FFFFFF", sigla: "iO" },
  Otros: { fondo: "#5B6B8C", texto: "#FFFFFF", sigla: "···" },
};
export const colorBanco = (b) => COLOR_BANCO[b] || COLOR_BANCO.Otros;

/**
 * Cómo está un banco del cliente (app/src/lib/deposito.js):
 *   listo         — tarjeta verificada y cuenta donde recibir.
 *   falta_cuenta  — tiene tarjeta pero no dónde depositarle.
 *   verificando   — la cuenta está; la tarjeta aún no se verifica.
 *   falta_tarjeta — solo registró cuentas de ese banco.
 */
export function estadoBanco(banco, tarjetas = [], cuentas = []) {
  const propias = tarjetas.filter(
    (t) => t.banco === banco && t.estado !== "rechazado",
  );
  const cuentasBanco = cuentas.filter((c) => c.banco === banco);
  if (!propias.length) return cuentasBanco.length ? "falta_tarjeta" : null;
  if (!cuentasDeDeposito(banco, cuentas).length) return "falta_cuenta";
  return propias.some((t) => t.estado === "aprobado") ? "listo" : "verificando";
}

export const bancosDelCliente = (tarjetas = [], cuentas = []) =>
  ORDEN_BANCOS.filter((b) => estadoBanco(b, tarjetas, cuentas) !== null);

/**
 * Bancos con dos tarifas: la de siempre es al día siguiente y "para
 * hoy" cuesta más. La base lo decide por la tarifa estándar
 * (banco_con_dia_siguiente); esta lista es la misma, para el panel.
 */
export const BANCOS_DOS_TARIFAS = ["Scotiabank", "BanBif"];
