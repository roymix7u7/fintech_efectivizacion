import { supabase } from "./supabase";

/**
 * Accesos del personal (migraciones 077 y 078). Los configura el super
 * administrador en la pantalla Accesos.
 *
 * El rol es el perfil base: decide qué pantallas existen para una
 * persona y es el tope de lo que la base de datos le entrega. Encima se
 * recorta persona por persona:
 *   · Pantalla "no":  no la ve (ni en el menú ni escribiendo la dirección).
 *   · Pantalla "ver": la ve en solo lectura (los botones de acción se apagan).
 *   · Parte "no":     una sección o un botón de esa pantalla deja de verse
 *                     (catálogo en lib/catalogoPermisos.js).
 *   · Sin nada:       como lo trae su rol.
 *
 * Claves: la pantalla es su ruta sin la barra ("/clientes" → "clientes");
 * una parte, "pantalla.parte" ("clientes.bloquear").
 */
export const NIVELES = [
  { valor: "editar", texto: "Ve y edita", corto: "Edita" },
  { valor: "ver", texto: "Solo ve", corto: "Solo ve" },
  { valor: "no", texto: "No ve", corto: "No ve" },
];

export const claveDe = (ruta) => String(ruta || "").replace(/^\//, "").split("/")[0];

/** Nivel de una persona en una pantalla, a partir de sus recortes guardados. */
export function nivelDe(permisos, ruta) {
  const n = permisos?.[claveDe(ruta)];
  return n === "no" || n === "ver" ? n : "editar";
}

/**
 * ¿Puede usar esta pantalla o esta parte? `clave` es "clientes" o
 * "clientes.bloquear". No mira el rol (eso lo decide cada página); solo
 * los recortes del super administrador. Para las acciones, el solo
 * lectura de la pantalla lo resuelve BotonAccion (components/carga.jsx).
 */
export function puede(session, clave) {
  const permisos = session?.permisos;
  if (!permisos) return true;
  const [pantalla] = String(clave).split(".");
  if (permisos[pantalla] === "no") return false;
  return clave === pantalla || permisos[clave] !== "no";
}

/** ¿La pantalla está en solo lectura para esta persona? */
export const soloLecturaEn = (session, pantalla) => session?.permisos?.[pantalla] === "ver";

const SIN_RECORTES = { permisos: {}, ip: null, restringida: false, permitida: true, superadmin: false, disponible: false };

/**
 * Lo que la base dice de quien tiene la sesión: sus recortes, la IP desde
 * la que lo ve, si esa IP le sirve y si es super administrador. Si la
 * migración todavía no está aplicada (o falla la red), nadie queda fuera:
 * se trabaja como antes.
 */
export async function leerMiAcceso() {
  try {
    const { data, error } = await supabase.rpc("mi_acceso");
    if (error || !data) return SIN_RECORTES;
    return {
      permisos: data.permisos || {},
      ip: data.ip || null,
      restringida: Boolean(data.restringida),
      permitida: data.permitida !== false,
      superadmin: Boolean(data.superadmin),
      disponible: true,
    };
  } catch {
    return SIN_RECORTES;
  }
}

/** Mensaje para quien intenta entrar desde una IP que no es la suya. */
export const mensajeIp = (ip) =>
  `Solo puedes ingresar desde la red autorizada para tu cuenta.${ip ? ` Ahora estás conectado desde ${ip}.` : ""} Si es un error, pide al administrador que agregue esa IP.`;

const AVISO = "atk-aviso-salida";

/** Guarda el motivo por el que se cerró la sesión, para mostrarlo en el ingreso. */
export function dejarAviso(texto) {
  try {
    window.sessionStorage.setItem(AVISO, texto);
  } catch {}
}

export function tomarAviso() {
  try {
    const t = window.sessionStorage.getItem(AVISO);
    if (t) window.sessionStorage.removeItem(AVISO);
    return t || "";
  } catch {
    return "";
  }
}
