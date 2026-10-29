import { EMPRESA } from "@/lib/supabasePublico";

/**
 * Contenido de la web pública. Los datos que también usa la app (locales,
 * plazos, horario) se escriben igual que en app/app/empresa.js: si cambia
 * uno, hay que cambiar el otro.
 */

// Números de la hoja oficial de comisiones: el WhatsApp también recibe
// llamadas; el segundo es solo para llamadas.
export const WHATSAPP = "51993918842";
export const WHATSAPP_TEXTO = "993 918 842";
export const LLAMADAS_TEXTO = "926 518 180";
export const enlaceWhatsapp = (texto = "Hola, quiero información sobre la efectivización de mi tarjeta.") =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

export const HORARIO = { dias: "Lunes a sábado", horas: "9:00 a. m. a 6:00 p. m.", refrigerio: "Refrigerio de 1:00 a 2:00 p. m." };

export const PLAZOS = [
  { titulo: "Normalmente en 1 hora", detalle: "Desde que aprobamos tu comprobante." },
  { titulo: "De 2 a 3 horas", detalle: "En días de alta demanda." },
  { titulo: "Siguiente día hábil", detalle: "Si fallan los sistemas bancarios." },
  { titulo: "En la mañana siguiente", detalle: "Si envías fuera de horario." },
];

export const LOCALES = [
  { distrito: "Lince", direccion: "Jr. Manuel Candamo 278, 2.° piso", referencia: "A media cuadra del Edificio El Almirante" },
  { distrito: "San Juan de Miraflores", direccion: "Calle Algarrobos 103", referencia: "Frente a la Estación Atocongo" },
  { distrito: "Los Olivos", direccion: "Santa Cruz de Pachacútec 214", referencia: "Frente a Mega Plaza" },
];

export const enlaceMapa = (l) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.direccion}, ${l.distrito}, Lima`)}`;

/**
 * Comisiones estándar, según la hoja oficial de la empresa.
 *
 * pct: porcentaje por operación.
 * limite y minimo: en montos menores al límite se cobra al menos la
 * comisión mínima (lo que sea mayor entre el porcentaje y el mínimo).
 * codigo: la operación se hace con código.
 *
 * Los colores son solo para distinguir cada tarjeta.
 */
export const TARIFAS = [
  { nombre: "BCP", color: "#E67E00", pct: 1, limite: 1200, minimo: 12 },
  { nombre: "BBVA", color: "#1464A5", pct: 1, limite: 1200, minimo: 12 },
  { nombre: "BanBif", color: "#0077C0", pct: 1, limite: 1200, minimo: 12 },
  { nombre: "Scotiabank", color: "#EC111A", pct: 1.5, limite: 2000, minimo: 20 },
  { nombre: "Interbank", color: "#00A651", pct: 2, limite: 1500, minimo: 30, codigo: true },
  { nombre: "CMR", color: "#00897B", pct: 2, limite: 1500, minimo: 30, codigo: true },
  { nombre: "iO", color: "#5B3FD6", pct: 2, limite: 1000, minimo: 30, codigo: true },
];

export const BANCOS = TARIFAS;

/** Comisión de una operación: el porcentaje, o el mínimo si el monto es menor al límite. */
export function comisionDe(tarifa, monto) {
  const porcentaje = Math.round(monto * tarifa.pct) / 100;
  return monto < tarifa.limite ? Math.max(porcentaje, tarifa.minimo) : porcentaje;
}

/** Grupos para la tabla de comisiones de la landing. */
export const GRUPOS_TARIFA = [
  { bancos: ["BCP", "BBVA", "BanBif"], pct: 1, limite: 1200, minimo: 12 },
  { bancos: ["Scotiabank"], pct: 1.5, limite: 2000, minimo: 20 },
  { bancos: ["Interbank", "CMR"], pct: 2, limite: 1500, minimo: 30, codigo: true },
  { bancos: ["iO"], pct: 2, limite: 1000, minimo: 30, codigo: true },
];

export const REDES = [
  { nombre: "Instagram", url: "https://www.instagram.com/altoqueperuwk/" },
  { nombre: "TikTok", url: "https://www.tiktok.com/@altoqueperuwk" },
  { nombre: "Facebook", url: "https://www.facebook.com/altoqueperuwk/" },
  { nombre: "YouTube", url: "https://www.youtube.com/@altoqueperuwk" },
];

// Opiniones de clientes publicadas en la web anterior.
export const OPINIONES = [
  {
    nombre: "Mathías Castro del Carpio",
    texto:
      "Excelente servicio. Todo fue rápido y sencillo, con una atención personalizada que me hizo sentir tranquilo en todo momento. Lo recomendaré a mis amigos y familiares.",
    estrellas: 5,
  },
  {
    nombre: "Julio Pérez Bernal",
    texto:
      "Confié en ellos por recomendación y no me arrepiento. El trato fue claro y cumplido, y la asesoría me ayudó a tomar mejores decisiones para mi empresa.",
    estrellas: 5,
  },
  {
    nombre: "Alejandra Tipian Meléndez",
    texto: "Estoy muy agradecida con el equipo de AlToque Perú WK. Me dieron confianza y guía para organizar mis finanzas y hacer crecer mi emprendimiento.",
    estrellas: 4,
  },
  {
    nombre: "Beatriz Peralta Acuña",
    texto: "Me explicaron todo sin rodeos. Cambió mi forma de administrar el dinero. Recomendado para quienes quieren avanzar sin complicarse.",
    estrellas: 4,
  },
];

export const PREGUNTAS = [
  {
    p: "¿Qué es efectivizar una tarjeta?",
    r: "Convertir parte de la línea de tu tarjeta de crédito en dinero en tu cuenta. Operas con tu tarjeta, nos envías el comprobante y te depositamos.",
  },
  {
    p: "¿Cuánto cobran?",
    r: "Desde 1 %, según tu tarjeta. En montos pequeños hay una comisión mínima. Revisa la tabla y la calculadora de esta página.",
  },
  {
    p: "¿Cuánto demoran?",
    r: "El mismo día, normalmente en menos de 1 hora. Si hay alguna demora, te avisamos en la app.",
  },
  {
    p: "¿Qué necesito?",
    r: "Tu DNI o carnet de extranjería, una selfie con tu documento, la foto de tu tarjeta y una cuenta de ahorros a tu nombre.",
  },
  {
    p: "¿Es seguro?",
    r: "Sí. Verificamos tu identidad, tus documentos se guardan cifrados y solo depositamos en cuentas a tu nombre.",
  },
  {
    p: "¿Depositan a terceros o por CCI?",
    r: "No. Solo a cuentas a tu nombre y sin transferencias interbancarias.",
  },
  {
    p: "¿Están afiliados a los bancos?",
    r: "No. Somos una empresa independiente. Los nombres de los bancos solo indican qué tarjetas aceptamos.",
  },
];

export { EMPRESA };
