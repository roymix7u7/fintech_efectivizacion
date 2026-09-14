import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { supabase } from "./supabase";

/**
 * Notificaciones al telefono.
 *
 * Realtime cubre al cliente que tiene el app abierta. Esto cubre al que
 * la tiene cerrada, que es la mayoria: es el unico canal que llega
 * cuando la aplicacion no esta corriendo.
 *
 * Nada de lo que hay aqui puede tumbar el arranque. Si el permiso se
 * niega, si el telefono es un emulador o si falta la configuracion, se
 * avisa por consola y el app sigue funcionando igual: las alertas
 * seguiran viendose en su pestana.
 */

/** El canal de Android que usan las alertas. */
export const CANAL_ALERTAS = "alertas";

/**
 * Expo Go dejo de recibir notificaciones remotas en Android a partir
 * del SDK 53. No es un fallo del codigo: hace falta el APK compilado
 * con EAS. Se detecta para poder decirlo claro en vez de dejar un
 * error suelto en la consola.
 */
export const enExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Que hace el telefono cuando llega una notificacion con el app
 * abierto. Se deja que se vea igual: si el cliente esta en otra
 * pantalla, la burbuja de alertas no le llega.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Canal de Android.
 *
 * Sin un canal propio, Android mete las alertas en el canal por
 * defecto y el cliente no puede silenciarlas sin silenciar todo el
 * app. Con canal propio decide por separado.
 */
async function prepararCanal() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANAL_ALERTAS, {
    name: "Alertas del servicio",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#E8B800",
    sound: "default",
  });
}

/** El identificador del proyecto EAS, que aparece tras el primer build. */
function idDeProyecto() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
}

/**
 * Pide permiso, obtiene el token y lo guarda.
 *
 * Devuelve { ok, motivo } para que quien llame pueda explicar por que
 * no hubo notificaciones, en vez de quedarse en silencio.
 */
export async function registrarPush() {
  try {
    await prepararCanal();

    if (!Device.isDevice) return { ok: false, motivo: "emulador" };
    if (enExpoGo) return { ok: false, motivo: "expo_go" };

    const proyecto = idDeProyecto();
    if (!proyecto) return { ok: false, motivo: "sin_proyecto" };

    // Solo se pregunta si no hay respuesta previa. Volver a preguntar a
    // quien ya dijo que no es ruido: Android ni siquiera muestra el
    // dialogo la segunda vez.
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return { ok: false, motivo: "sin_permiso" };

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: proyecto,
    });
    if (!token) return { ok: false, motivo: "sin_token" };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, motivo: "sin_sesion" };

    // El token es la clave, no el usuario. Un telefono prestado o
    // revendido conserva su token: asi la fila cambia de dueno sola y
    // la alerta no termina en el telefono equivocado.
    const { error } = await supabase.from("push_tokens").upsert(
      {
        token,
        user_id: user.id,
        plataforma: Platform.OS,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) return { ok: false, motivo: error.message };

    return { ok: true, motivo: null };
  } catch (e) {
    // Nunca tumbar el arranque por esto.
    console.warn("No se pudo registrar el telefono:", e?.message || e);
    return { ok: false, motivo: "error" };
  }
}

/**
 * Suelta el token al cerrar sesion.
 *
 * Sin esto, el telefono seguiria recibiendo alertas de una cuenta que
 * ya no esta abierta en el, y en un telefono compartido las veria la
 * persona equivocada.
 */
export async function olvidarPush() {
  try {
    if (!Device.isDevice || enExpoGo) return;
    const proyecto = idDeProyecto();
    if (!proyecto) return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: proyecto,
    });
    if (token) await supabase.from("push_tokens").delete().eq("token", token);
  } catch {
    // Si no se puede, la proxima sesion sobrescribe la fila igual.
  }
}
