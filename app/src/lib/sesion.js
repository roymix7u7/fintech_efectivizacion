import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { limpiarCache } from "./cache";

/**
 * Duracion maxima de una sesion.
 *
 * Dos horas contadas desde que la persona escribio su contrasena, no
 * desde su ultimo toque. Es como funciona la banca: puedes entrar y
 * salir de la app todas las veces que quieras dentro de ese rato, pero
 * pasado el plazo se cierra aunque hayas estado usandola.
 *
 * La diferencia importa. Un plazo por inactividad se renueva solo con
 * mover el dedo, asi que un telefono robado con la app abierta nunca
 * expiraria. Uno absoluto siempre termina.
 */
export const DURACION_SESION_MS = 2 * 60 * 60 * 1000;

const CLAVE = "atk:inicio-sesion";

/** Se llama justo despues de un inicio de sesion correcto. */
export async function marcarInicioSesion() {
  try {
    await AsyncStorage.setItem(CLAVE, String(Date.now()));
  } catch {}
}

/** Milisegundos que faltan para que caduque, o 0 si ya caduco. */
export async function tiempoRestante() {
  try {
    const guardado = await AsyncStorage.getItem(CLAVE);
    if (!guardado) return 0;
    const restante = Number(guardado) + DURACION_SESION_MS - Date.now();
    return restante > 0 ? restante : 0;
  } catch {
    return 0;
  }
}

/**
 * true si hay que volver a pedir la contrasena.
 *
 * Sin marca guardada se considera caducada. Puede pasar tras
 * reinstalar la app o al actualizar desde una version que no llevaba
 * esta cuenta, y ante la duda conviene pedir credenciales.
 */
export async function sesionVencida() {
  return (await tiempoRestante()) === 0;
}

/** Cierra la sesion y borra todo rastro local del usuario anterior. */
export async function cerrarSesion() {
  // El token del telefono se suelta antes de cerrar la sesion, porque
  // despues la politica de la tabla ya no dejaria borrarlo.
  //
  // Se carga aqui y no arriba a proposito: lib/push termina usando
  // expo-notifications, que no existe en Expo Go, y este archivo lo
  // importa la pantalla de bienvenida. Importarlo arriba cargaba ese
  // modulo en el arranque y tumbaba el app antes de dibujar nada.
  try {
    const { olvidarPush } = await import("./push");
    await olvidarPush();
  } catch {}

  try {
    await supabase.auth.signOut();
  } catch {}
  try {
    await AsyncStorage.removeItem(CLAVE);
  } catch {}
  await limpiarCache();
}

/**
 * Entra a una pantalla dejandola como unica del historial.
 *
 * Sin esto, el boton atras del telefono devolvia a la pantalla de
 * bienvenida despues de iniciar sesion, y parecia que la sesion se
 * hubiera perdido. Ahora atras sale de la app, que es lo que se espera
 * una vez dentro.
 */
export function entrarA(router, ruta) {
  try {
    if (router.canDismiss?.()) router.dismissAll();
  } catch {}
  router.replace(ruta);
}

/**
 * El motivo por el que se le cerro la cuenta a alguien.
 *
 * Se lee con la sesion todavia abierta: al cerrarla, RLS deja de
 * dejarnos ver su perfil. Por eso quien la use tiene que llamarla
 * antes del signOut, no despues.
 *
 * Si falla, devuelve null y la pantalla muestra el aviso sin motivo:
 * vale mas decir que esta bloqueada que quedarse callado.
 */
export async function motivoDelBloqueo(userId) {
  try {
    const { data } = await supabase
      .from("perfiles_cliente")
      .select("motivo_bloqueo")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.motivo_bloqueo || null;
  } catch {
    return null;
  }
}
