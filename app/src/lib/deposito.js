// A qué cuenta se le deposita una operación.
//
// Es la regla de negocio que decide si el cliente puede enviar una
// solicitud, así que vive en un solo lugar y no repartida por pantallas.
// La misma regla está en la base (trigger de solicitudes) y en el panel
// de Pagos (admin/src/lib/bancos.js): si cambia aquí, cambia allá.
//
//   1. La cuenta que recibe es la NORMAL (de ahorros). La interbancaria
//      (CCI) es opcional: sola no alcanza para recibir.
//   2. Tarjeta de un banco principal → cuenta normal del MISMO banco.
//      Es inmediato y no paga comisión interbancaria.
//   3. Tarjeta CMR u "Otros" → cuenta normal de CUALQUIER banco que
//      tenga el cliente: esos emisores no tienen cuentas propias en las
//      que depositar.
//
// No importa nada a propósito: así las pruebas pueden cargarlo solo.

export const BANCOS_PRINCIPALES = ["BCP", "BBVA", "Interbank", "Scotiabank", "BanBif"];

export const esBancoPrincipal = (banco) => BANCOS_PRINCIPALES.includes(banco);

/** La cuenta normal; la interbancaria es solo un dato adicional. */
export const esCuentaNormal = (cuenta) => (cuenta?.tipo || "ahorros") !== "interbancaria";

/** Cuentas en las que se puede depositar una operación de esa tarjeta. */
export function cuentasDeDeposito(bancoTarjeta, cuentas = []) {
  const normales = (cuentas || []).filter(esCuentaNormal);
  if (!bancoTarjeta) return [];
  if (esBancoPrincipal(bancoTarjeta)) {
    return normales.filter((c) => c.banco === bancoTarjeta);
  }
  return normales;
}

export const puedeRecibir = (bancoTarjeta, cuentas) =>
  cuentasDeDeposito(bancoTarjeta, cuentas).length > 0;

/**
 * Qué le falta al cliente para que esa tarjeta pueda operar, dicho
 * para él. null si no le falta nada.
 */
export function faltaParaRecibir(bancoTarjeta, cuentas = []) {
  if (!bancoTarjeta || puedeRecibir(bancoTarjeta, cuentas)) return null;

  if (!esBancoPrincipal(bancoTarjeta)) {
    return {
      banco: null,
      titulo: "Falta una cuenta de ahorros",
      detalle: `Con tu tarjeta ${bancoTarjeta} te depositamos en tu cuenta de ahorros de cualquier banco.`,
    };
  }

  // Tiene la CCI del banco pero no la cuenta normal: decírselo así,
  // porque si no va a creer que ya la registró.
  const soloCci = (cuentas || []).some(
    (c) => c.banco === bancoTarjeta && !esCuentaNormal(c),
  );

  return {
    banco: bancoTarjeta,
    titulo: `Falta tu cuenta de ahorros ${bancoTarjeta}`,
    detalle: soloCci
      ? `Tu CCI ${bancoTarjeta} no basta: el depósito va a tu cuenta de ahorros del mismo banco.`
      : `Te depositamos en tu cuenta de ahorros ${bancoTarjeta}, el mismo banco de la tarjeta.`,
  };
}

/** Orden en que se muestran los bancos en todas las listas. */
export const ORDEN_BANCOS = [...BANCOS_PRINCIPALES, "CMR", "Otros"];

/**
 * Cómo está un banco del cliente, para la lista "Mis bancos":
 *
 *   listo         — tiene tarjeta verificada y una cuenta donde recibir.
 *   falta_cuenta  — tiene tarjeta (verificada o en revisión) pero no
 *                   hay cuenta de ahorros donde depositarle.
 *   verificando   — la cuenta está, pero la tarjeta aún no se verifica.
 *   falta_tarjeta — solo registró cuentas de ese banco.
 *
 * Las tarjetas rechazadas no cuentan: van aparte, en "Requiere tu
 * atención". `cuentas` son todas las del cliente, porque una tarjeta
 * CMR recibe en cualquier banco.
 */
export function estadoBanco(banco, tarjetas = [], cuentas = []) {
  const propias = (tarjetas || []).filter((t) => t.banco === banco && t.estado !== "rechazado");
  const verificadas = propias.filter((t) => t.estado === "aprobado");
  const cuentasBanco = (cuentas || []).filter((c) => c.banco === banco);

  if (!propias.length) {
    return cuentasBanco.length ? "falta_tarjeta" : null;
  }
  if (!puedeRecibir(banco, cuentas)) return "falta_cuenta";
  return verificadas.length ? "listo" : "verificando";
}

/** Los bancos que se listan: con alguna tarjeta viva o alguna cuenta. */
export function bancosDelCliente(tarjetas = [], cuentas = []) {
  return ORDEN_BANCOS.filter((b) => estadoBanco(b, tarjetas, cuentas) !== null);
}
