import { supabase } from "./supabase";

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  // Obtener el rol del usuario desde nuestra tabla users
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("rol, estado")
    .eq("id", data.user.id)
    .single();

  if (userError) throw new Error("Usuario no encontrado en el sistema.");

  if (userData.estado === "bloqueado") {
    await supabase.auth.signOut();
    throw new Error("Cuenta bloqueada. Contacta al administrador.");
  }

  if (userData.rol === "cliente") {
    await supabase.auth.signOut();
    throw new Error("Los clientes deben usar la app móvil.");
  }

  return { user: data.user, rol: userData.rol };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const { data: userData } = await supabase
    .from("users")
    .select("rol, estado")
    .eq("id", data.session.user.id)
    .single();

  if (!userData) return null;

  return { user: data.session.user, rol: userData.rol };
}
