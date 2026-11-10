/**
 * Avisos del navegador para los clientes: "Tu asesor te respondió",
 * aunque hayan cerrado la página.
 *
 *   1. El cliente acepta (components/cliente/avisosNavegador.jsx).
 *   2. El navegador se registra con public/sw.js y se guarda en Supabase
 *      (avisos_navegador, migración 073) con guardar_aviso_navegador.
 *   3. Cuando el asesor responde, Chatwoot llama a la función
 *      chatwoot-avisos, que manda la notificación.
 *
 * Al cerrar sesión se quita el navegador (quitarAvisosNavegador): en una
 * PC compartida, el siguiente no recibe los avisos del anterior.
 *
 * Sin NEXT_PUBLIC_VAPID_PUBLIC_KEY no se ofrece nada.
 */
const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** ¿Este navegador puede recibir avisos? (En iPhone, solo si la web está en la pantalla de inicio.) */
export function avisosPosibles() {
  return (
    typeof window !== "undefined" &&
    Boolean(CLAVE_PUBLICA) &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** "default" (no ha decidido), "granted", "denied" o "no" (no se puede). */
export function permisoAvisos() {
  return avisosPosibles() ? Notification.permission : "no";
}

function claveBytes(base64) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function registro() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

function nombreNavegador() {
  const ua = navigator.userAgent;
  const so = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Otro";
  const nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${nav} · ${so}`;
}

// Quién aceptó los avisos en este navegador. El permiso del navegador es
// del navegador, no de la persona: en una PC compartida, otro cliente que
// entre no queda suscrito sin aceptarlo él mismo.
const ACEPTO = (userId) => `atk-avisos:${userId}`;
const marcarAcepto = (userId) => {
  try {
    localStorage.setItem(ACEPTO(userId), "1");
  } catch {}
};
export const yaAcepto = (userId) => {
  try {
    return localStorage.getItem(ACEPTO(userId)) === "1";
  } catch {
    return false;
  }
};

/**
 * Pide el permiso (si hace falta) y guarda este navegador para la cuenta
 * con sesión. Devuelve "granted", "denied" o lanza un error con mensaje.
 */
export async function activarAvisos(sb, userId) {
  if (!avisosPosibles()) throw new Error("Este navegador no permite avisos.");
  const permiso = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permiso !== "granted") return permiso;

  const reg = await registro();
  await navigator.serviceWorker.ready;
  let suscripcion = await reg.pushManager.getSubscription();
  if (!suscripcion) {
    suscripcion = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveBytes(CLAVE_PUBLICA),
    });
  }
  const { endpoint, keys } = suscripcion.toJSON();
  const { error } = await sb.rpc("guardar_aviso_navegador", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_navegador: nombreNavegador(),
  });
  if (error) throw new Error("No pudimos activar los avisos. Inténtalo de nuevo.");
  marcarAcepto(userId);
  return "granted";
}

/**
 * Si este mismo cliente ya los había aceptado aquí (otra vez que entró),
 * vuelve a asociar el navegador a su cuenta sin preguntar nada.
 */
export async function renovarAvisos(sb, userId) {
  if (permisoAvisos() !== "granted" || !yaAcepto(userId)) return;
  try {
    await activarAvisos(sb, userId);
  } catch {}
}

/** Quita este navegador de la cuenta (se llama antes de cerrar sesión). */
export async function quitarAvisosNavegador(sb) {
  if (!avisosPosibles()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const suscripcion = await reg?.pushManager.getSubscription();
    if (!suscripcion) return;
    await sb.rpc("quitar_aviso_navegador", { p_endpoint: suscripcion.endpoint });
    await suscripcion.unsubscribe();
  } catch {}
}
