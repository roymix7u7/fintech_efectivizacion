import { supabase } from "./supabase";
import { limpiarCache } from "./cache";
import { bloquear, desbloquear } from "./bloqueo";

/**
 * Se llama justo después de ingresar o de registrarse: el app queda
 * desbloqueada desde ahora.
 *
 * Antes la sesión duraba dos horas y luego se cerraba, lo que además
 * soltaba el teléfono de las notificaciones. Ahora la sesión sigue y el
 * app se bloquea tras 10 minutos sin uso o al volver a abrirla
 * (lib/bloqueo).
 */
export function marcarInicioSesion() {
  desbloquear();
}

/**
 * Cierra la sesion y borra todo rastro local del usuario anterior.
 *
 * Solo para salir de verdad ("Cerrar sesión", cuenta bloqueada,
 * demasiados intentos al desbloquear): suelta el teléfono de las
 * notificaciones. El bloqueo por tiempo no pasa por aquí.
 */
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
  // La próxima sesión empieza bloqueada hasta que alguien ingrese.
  bloquear();
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
