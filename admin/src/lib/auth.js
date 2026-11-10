import { supabase } from "./supabase";
import { fijarDisponibilidad, olvidarDisponibilidad } from "./disponibilidad";

/** Roles que tienen panel propio. */
export const ROLES_STAFF = ["admin", "supervisor", "gestor", "pagos"];

/**
 * Primera pantalla de cada rol al entrar.
 *
 * Pagos va directo a lo suyo: no tiene resumen de la empresa ni colas
 * de revision, y mandarlo al dashboard seria mostrarle una pantalla
 * vacia que no le sirve.
 */
export function inicioDe(rol) {
  if (rol === "pagos") return "/pagos";
  if (rol === "gestor") return "/kyc";
  return "/dashboard";
}

/** Roles que pueden ver todas las colas y medir al equipo. */
export const ROLES_SUPERVISION = ["admin", "supervisor"];

/**
 * Ultima sesion confirmada, guardada en memoria.
 *
 * Sin esto, cada pantalla del panel esperaba a que el servidor
 * confirmara la sesion antes de dibujar nada: al cambiar de seccion
 * desaparecia hasta la barra lateral y volvia medio segundo despues.
 * Ahora la pantalla nueva se dibuja de inmediato con lo ultimo
 * confirmado, y la comprobacion real sigue corriendo por detras.
 *
 * Vive solo en memoria: al recargar la pagina se vuelve a comprobar.
 */
let enMemoria = null;

export function sesionEnCache() {
  return enMemoria;
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("rol, estado")
    .eq("id", data.user.id)
    .maybeSingle();

  if (userError) {
    await supabase.auth.signOut();
    throw new Error("No pudimos leer tu perfil. Intenta de nuevo.");
  }
  if (!userData) {
    await supabase.auth.signOut();
    throw new Error("Usuario no encontrado en el sistema.");
  }
  if (userData.estado === "bloqueado") {
    await supabase.auth.signOut();
    throw new Error("Cuenta bloqueada. Contacta al administrador.");
  }
  if (userData.rol === "cliente") {
    await supabase.auth.signOut();
    throw new Error("Los clientes deben usar la app movil.");
  }
  if (!ROLES_STAFF.includes(userData.rol)) {
    await supabase.auth.signOut();
    throw new Error(
      `El rol "${userData.rol}" no tiene panel. Pide que te asignen un rol del equipo.`,
    );
  }

  enMemoria = { user: data.user, rol: userData.rol };
  // Quien entra al panel viene a trabajar: queda en línea y empieza a
  // recibir casos. Si falla (sin migración 070, sin red), entra igual.
  olvidarDisponibilidad();
  try {
    // Lo de Chatwoot no se espera: la entrada no se demora por el chat.
    await fijarDisponibilidad("en_linea", { esperarChat: false });
  } catch {}
  return enMemoria;
}

/**
 * Cerrar sesión sin dejar a la persona mirando una pantalla quieta:
 *   1. Queda "desconectado" (para que el reparto no le dé más casos).
 *   2. La sesión se borra de este navegador al instante.
 *   3. Por detrás: se avisa a Chatwoot y se cierra la sesión también en
 *      el servidor, con la clave que tenía (keepalive: termina aunque se
 *      cambie de página).
 */
export async function logout() {
  enMemoria = null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  try {
    await supabase.rpc("fijar_disponibilidad", { p_estado: "desconectado" });
  } catch {}
  olvidarDisponibilidad();
  if (session) terminarPorDetras(session.access_token);
  await supabase.auth.signOut({ scope: "local" });
}

function terminarPorDetras(token) {
  (async () => {
    const encabezados = { Authorization: `Bearer ${token}` };
    try {
      await fetch("/api/atencion/disponibilidad", { method: "POST", headers: encabezados, keepalive: true });
    } catch {}
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: { ...encabezados, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        keepalive: true,
      });
    } catch {}
  })();
}

/**
 * Devuelve la sesion vigente o null.
 *
 * A diferencia de la version anterior, tambien revisa el estado: antes
 * un miembro del staff bloqueado seguia operando mientras no cerrara
 * sesion, porque el estado solo se miraba al hacer login.
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const { data: userData } = await supabase
    .from("users")
    .select("rol, estado")
    .eq("id", data.session.user.id)
    .maybeSingle();

  if (!userData) return null;
  if (userData.estado === "bloqueado" || userData.rol === "cliente") {
    await supabase.auth.signOut();
    return null;
  }
  if (!ROLES_STAFF.includes(userData.rol)) {
    await supabase.auth.signOut();
    return null;
  }

  enMemoria = { user: data.session.user, rol: userData.rol };
  return enMemoria;
}
