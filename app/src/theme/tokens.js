// AlToque Perú WK — tokens de diseño ("Cristal medido")
//
// Fuente de verdad visual. Úsalos en todos los StyleSheet; no escribas
// hex sueltos. La especificación completa está en design/DESIGN.md.
//
// Viene del paquete de diseño en TypeScript; aquí va en JavaScript
// porque el proyecto no usa TS. Los tipos se perdieron, así que los
// valores permitidos quedan escritos en los comentarios.

/** Cifras de ancho fijo: montos, DNI, números de cuenta y contadores. */
const tnum = ["tabular-nums"];

export const colors = {
  // Marca
  night: "#0F1B33", // cabeceras (hero), tarjetas de crédito, fondos de marca
  navy: "#1B2A4A", // texto principal y botón principal
  navyLight: "#2C4270", // estado "En revisión"
  gold: "#E8B800", // SOLO la acción que mueve dinero y la moneda "S/"
  goldText: "#8C6A00", // dorado legible sobre fondo claro (enlaces, etiquetas)
  goldCream: "#FFF3CC", // "Aprobado", avisos de lo que falta
  goldCreamText: "#6E5300",

  // Neutros
  ground: "#EFF3F9", // fondo de pantalla, azul hielo del prototipo final
  surface: "#FFFFFF", // tarjetas y listas
  line: "#E3E9F2", // borde de tarjetas
  lineSoft: "#E8EDF5", // separadores internos
  field: "#FFFFFF", // fondo de campos
  fieldBorder: "#DCE3EE",
  fieldFilled: "#C2CCDB", // borde de un recuadro ya escrito
  track: "#D5DDEA", // riel vacío: segmentos, líneas de avance
  muted: "#E3E9F2", // botón deshabilitado, placeholders de imagen
  disabledText: "#626D82",
  dashed: "#AFBCD0", // borde punteado de "falta subir"

  // Texto
  text: "#1B2A4A",
  text2: "#4F5B74",
  text3: "#626D82", // mínimo para texto pequeño (pasa AA)
  textFaint: "#8A93A6", // solo decorativo / "Otros estados"

  // Estados
  success: "#0B7F59",
  successText: "#0B6B4B",
  successBg: "#E3F3EC",
  error: "#C4291F",
  errorStrong: "#D93025", // fondo de alerta urgente
  errorText: "#B3261E",
  errorBg: "#FBE7E5",
  infoBg: "#E6EBF5",

  // Luces del fondo (solo sobre azul noche)
  glowGold: "#E8B800",
  glowBlue: "#2F56B0",

  white: "#FFFFFF",
};

/** Claves: BCP | BBVA | INTERBANK | SCOTIABANK | BANBIF | CMR | IO | OTROS */
export const banks = {
  // En BCP el texto encima va oscuro: el blanco no pasa contraste.
  BCP: { code: "BCP", name: "BCP", color: "#E67E00", onColor: "#0F1B33" },
  BBVA: { code: "BBVA", name: "BBVA", color: "#004481", onColor: "#FFFFFF" },
  INTERBANK: { code: "IBK", name: "Interbank", color: "#00855A", onColor: "#FFFFFF" },
  SCOTIABANK: { code: "SBK", name: "Scotiabank", color: "#CC0000", onColor: "#FFFFFF" },
  BANBIF: { code: "BIF", name: "BanBif", color: "#0077C0", onColor: "#FFFFFF" },
  CMR: { code: "CMR", name: "CMR", color: "#00897B", onColor: "#FFFFFF" },
  IO: { code: "iO", name: "iO", color: "#5B3FD6", onColor: "#FFFFFF" },
  OTROS: { code: "···", name: "Otros", color: "#8A93A6", onColor: "#FFFFFF" },
};

/**
 * Los bancos llegan de la base de datos escritos como los ve el
 * cliente ("Interbank", "BCP"). Los tokens los indexan en mayúsculas,
 * así que hace falta traducir en vez de asumir que coinciden.
 */
export function bancoKey(nombre) {
  const k = (nombre || "").trim().toUpperCase();
  return banks[k] ? k : "OTROS";
}

/** Datos de presentación de un banco, tolerante a nombres sueltos. */
export const bancoDe = (nombre) => banks[bancoKey(nombre)];

/**
 * Estados de una solicitud: cada uno con ícono propio, nunca solo
 * color. Claves: pendiente | aprobado | pagado | rechazado.
 */
export const requestStatus = {
  pendiente: { label: "En revisión", bg: "#E6EBF5", fg: "#2C4270", icon: "time-outline" },
  aprobado: { label: "Aprobado", bg: "#FFF3CC", fg: "#6E5300", icon: "checkmark" },
  // Único estado sólido: es la meta de todo el circuito.
  pagado: { label: "Pago enviado", bg: "#0B7F59", fg: "#FFFFFF", icon: "paper-plane-outline" },
  rechazado: { label: "Rechazado", bg: "#FBE7E5", fg: "#B3261E", icon: "close" },
};

/** Alertas = color sólido + ícono. Noticias = tarjeta blanca, nunca fondo de color. */
export const alertLevel = {
  urgente: { label: "URGENTE", bg: "#D93025", fg: "#FFFFFF", icon: "warning-outline" },
  importante: { label: "IMPORTANTE", bg: "#E8B800", fg: "#0F1B33", icon: "alert-circle-outline" },
  aviso: { label: "AVISO", bg: "#E6EBF5", fg: "#1B2A4A", icon: "information-circle-outline" },
};

export const fonts = {
  display: "Sora_600SemiBold", // títulos de pantalla, cifras, saludo
  displayBold: "Sora_700Bold",
  body: "Manrope_500Medium",
  bodyRegular: "Manrope_400Regular",
  label: "Manrope_600SemiBold",
  strong: "Manrope_700Bold",
  heavy: "Manrope_800ExtraBold", // botones y etiquetas de sección
};

export const type = {
  greeting: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, letterSpacing: -0.8 },
  screenTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6 },
  number: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, fontVariant: tnum },
  cardTitle: { fontFamily: fonts.strong, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.label, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.strong, fontSize: 12, lineHeight: 16 },
  // Etiqueta de bloque en mayúsculas. Una por bloque, nada más.
  section: { fontFamily: fonts.heavy, fontSize: 11, lineHeight: 14, letterSpacing: 1.7 },
  button: { fontFamily: fonts.heavy, fontSize: 16, lineHeight: 20 },
  digits: { fontFamily: fonts.strong, fontSize: 13, letterSpacing: 1.8, fontVariant: tnum },
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 22, xxl: 26, sheet: 34, pill: 999 };
export const space = { xxs: 4, xs: 6, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

/** Alturas mínimas de toque. */
export const hit = { min: 44, button: 56, buttonLg: 60, field: 52 };

export const shadow = {
  card: {
    shadowColor: "#0F1B33",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  float: {
    shadowColor: "#0F1B33",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  creditCard: {
    shadowColor: "#0F1B33",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
};

/**
 * Cristal: solo en los 4 lugares de DESIGN.md §4. Máximo 2 por pantalla.
 * `overlayAndroid` es el velo sin desenfoque que se usa en Android
 * (ver GlassPanel): más opaco, porque ahí no hay blur que separe el
 * panel de lo que tiene detrás.
 */
export const glass = {
  light: {
    intensity: 50,
    tint: "light",
    overlay: "rgba(255,255,255,0.66)",
    overlayAndroid: "rgba(255,255,255,0.88)",
    border: "rgba(255,255,255,0.75)",
  },
  onNight: {
    intensity: 30,
    tint: "dark",
    overlay: "rgba(255,255,255,0.10)",
    overlayAndroid: "rgba(255,255,255,0.14)",
    border: "rgba(255,255,255,0.20)",
  },
  sheet: {
    intensity: 60,
    tint: "light",
    overlay: "rgba(239,243,249,0.86)",
    overlayAndroid: "rgba(239,243,249,0.97)",
    border: "rgba(255,255,255,0.75)",
  },
};

export const motion = {
  // Equivalente a cubic-bezier(.2,.8,.2,1)
  easing: [0.2, 0.8, 0.2, 1],
  screen: 380, // deslizamiento lateral al avanzar/volver (±56 px + opacidad)
  modalUp: 420, // Nueva solicitud, Registrar tarjeta, Agregar cuenta (+80 px)
  sheet: 450, // detalle de solicitud (desde 100% de alto)
  drawer: 400, // menú lateral
  fade: 300, // cambio entre pestañas
  pop: 360, // selección, fila que aparece (escala 0.92 → 1.02 → 1)
  toast: 350,
  press: 140, // botón presionado: escala 0.97
};
