import COLORS from "./colors";

/**
 * Como se ve cada estado de una solicitud, en un solo lugar.
 *
 * Antes cada pantalla tenia su propia copia, y bastaba con cambiar una
 * para que el mismo estado se viera distinto en el inicio y en el
 * historial.
 */
const ESTADOS_SOLICITUD = {
  pendiente: {
    text: "En revisión",
    color: COLORS.warning,
    bg: COLORS.warningLight,
    icon: "time",
  },
  aprobado: {
    text: "Aprobado",
    color: COLORS.success,
    bg: COLORS.successLight,
    icon: "checkmark-circle",
  },
  rechazado: {
    text: "Rechazado",
    color: COLORS.error,
    bg: COLORS.errorLight,
    icon: "close-circle",
  },
  // El ultimo paso: ya se le deposito. Es lo que el cliente espera desde
  // que envio el comprobante, asi que se distingue de aprobado.
  pagado: {
    text: "Pago enviado",
    color: COLORS.primary,
    bg: "#E6ECF7",
    icon: "cash",
  },
};

export const estadoSolicitud = (e) =>
  ESTADOS_SOLICITUD[e] || ESTADOS_SOLICITUD.pendiente;

export default ESTADOS_SOLICITUD;
