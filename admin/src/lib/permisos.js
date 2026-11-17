import { supabase } from "./supabase";

/**
 * Accesos por pantalla y restricción por IP (migración 077).
 *
 * El rol es el perfil base: decide qué pantallas existen para una
 * persona y es el tope de lo que la base de datos le entrega. Encima, el
 * administrador puede recortar persona por persona:
 *   · "no":  no ve la pantalla (ni en el menú ni escribiendo la dirección).
 *   · "ver": la ve en solo lectura (los botones de acción quedan apagados).
 *   · sin nada: como lo trae su rol ("editar").
 *
 * La clave de cada pantalla es su ruta sin la barra: "/clientes" → "clientes".
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

const SIN_RECORTES = { permisos: {}, ip: null, restringida: false, permitida: true, disponible: false };

/**
 * Lo que la base dice de quien tiene la sesión: sus recortes, la IP desde
 * la que lo ve y si esa IP le sirve. Si la migración todavía no está
 * aplicada (o falla la red), nadie queda fuera: se trabaja como antes.
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
      disponible: true,
    };
  } catch {
    return SIN_RECORTES;
  }
}

/** Mensaje para quien intenta entrar desde una IP que no es la suya. */
export const mensajeIp = (ip) =>
  `Solo puedes ingresar desde la red autorizada para tu cuenta.${ip ? ` Ahora estás conectado desde ${ip}.` : ""} Si es un error, pide al administrador que agregue esa IP en Equipo.`;

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
