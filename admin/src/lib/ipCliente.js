/**
 * La restricción por IP del personal se evalúa en la base de datos
 * (migración 077). Las rutas del servidor hablan con la base desde las
 * máquinas de Vercel, así que la base vería la IP de Vercel y no la de
 * la persona. Estas cabeceras le dicen cuál es la IP real; la base solo
 * les cree si llegan con la clave del servidor (ATK_CLAVE_SERVIDOR), de
 * la que guarda nada más que su huella.
 *
 * En Vercel, x-real-ip y x-forwarded-for los pone Vercel con la IP de
 * quien hizo la petición (el navegador no puede falsearlos). En local la
 * petición llega desde la misma computadora: no se manda nada y la base
 * usa la IP con la que la ve directamente.
 */
const LOCAL = /^(::1|127\.|::ffff:127\.|localhost$)/;

export function cabecerasDeIp(req) {
  const clave = process.env.ATK_CLAVE_SERVIDOR;
  if (!clave) return {};
  const ip = (req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0] || "").trim();
  if (!ip || LOCAL.test(ip)) return {};
  return { "x-atk-clave": clave, "x-atk-ip": ip };
}
