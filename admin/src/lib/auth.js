import { supabase } from "./supabase";

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

  return { user: data.user, rol: userData.rol };
}

export async function logout() {
  await supabase.auth.signOut();
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

  return { user: data.session.user, rol: userData.rol };
}
