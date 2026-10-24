// Cómo se ve cada estado de una solicitud, en un solo lugar.
//
// Antes cada pantalla tenía su propia copia, y bastaba con cambiar una
// para que el mismo estado se viera distinto en el inicio y en el
// historial.
//
// Los valores salen de requestStatus en tokens.js, que es lo que fija
// el diseño: ícono + texto + color, nunca el color solo. "Pago
// enviado" es el único de fondo sólido, porque es la meta de todo el
// circuito y tiene que leerse distinto a "aprobado".
import { colors, requestStatus } from "./tokens";

/**
 * "Pago enviado" es el único con fondo sólido, así que su color de
 * texto es blanco. Eso sirve dentro del chip, pero no para escribir el
 * estado directamente sobre una fila blanca: quedaría invisible. Por
 * eso cada estado lleva también `textoClaro`, para cuando el texto va
 * suelto sobre una superficie clara.
 */
const SOBRE_CLARO = { pagado: colors.successText };

const desde = (clave) => {
  const s = requestStatus[clave];
  return {
    text: s.label,
    color: s.fg,
    bg: s.bg,
    icon: s.icon,
    textoClaro: SOBRE_CLARO[clave] || s.fg,
  };
};

const ESTADOS_SOLICITUD = {
  pendiente: desde("pendiente"),
  aprobado: desde("aprobado"),
  rechazado: desde("rechazado"),
  pagado: desde("pagado"),
};

export const estadoSolicitud = (e) =>
  ESTADOS_SOLICITUD[e] || ESTADOS_SOLICITUD.pendiente;

export default ESTADOS_SOLICITUD;
