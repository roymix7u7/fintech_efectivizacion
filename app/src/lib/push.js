import { Platform } from "react-native";
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
 * ── Por que expo-notifications no se importa arriba ──
 *
 * Expo Go dejo de traer ese modulo nativo en Android a partir del SDK
 * 53. Importarlo en el nivel del archivo lo carga en cuanto alguien
 * importa este modulo, y como cerrarSesion vive en la pantalla de
 * bienvenida, el app reventaba antes de dibujar nada.
 *
 * Cargarlo solo cuando de verdad se va a usar, y solo donde existe,
 * deja a Expo Go funcionando igual que siempre y al APK con sus
 * notificaciones. Nada de lo que hay aqui puede tumbar el arranque.
 */

/** El canal de Android que usan las alertas. */
export const CANAL_ALERTAS = "alertas";

/**
 * Expo Go no recibe notificaciones remotas en Android desde el SDK 53.
 * No es un fallo del codigo: hace falta el APK compilado con EAS. Se
 * detecta para poder decirlo claro en vez de dejar un error suelto.
 */
export const enExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Donde el modulo existe de verdad: telefono real y fuera de Expo Go. */
const hayNotificaciones = Device.isDevice && !enExpoGo;

let modulo = null;
let configurado = false;
const toquesAtendidos = new Set();

/**
 * Carga expo-notifications la primera vez que hace falta.
 *
 * Devuelve null en vez de lanzar: quien llama sigue su camino y el
 * cliente conserva sus alertas dentro del app, que es lo importante.
 */
async function cargar() {
  if (!hayNotificaciones) return null;
  if (modulo) return modulo;

  try {
    const N = await import("expo-notifications");

    if (!configurado) {
      configurado = true;

      // Que hace el telefono cuando llega una notificacion con el app
      // abierta. Se deja que se vea igual: si el cliente esta en otra
      // pantalla, la burbuja de alertas no le llega.
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      // Canal propio de Android. Sin el, las alertas caen en el canal
      // por defecto y el cliente no puede silenciarlas sin silenciar
      // el app entera.
      if (Platform.OS === "android") {
        // Lo usan las alertas del panel y los avisos de cada cliente
        // (migración 57). El nombre se puede cambiar; el id no.
        await N.setNotificationChannelAsync(CANAL_ALERTAS, {
          name: "Avisos y alertas",
          importance: N.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#E8B800",
          sound: "default",
        });
      }
    }

    modulo = N;
    return N;
  } catch (e) {
    console.warn("Notificaciones no disponibles:", e?.message || e);
    return null;
  }
}

/** El identificador del proyecto EAS, que aparece tras el primer build. */
function idDeProyecto() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
}

/** Token de este telefono, o null con el motivo por el que no lo hay. */
async function tokenDeEsteTelefono(N) {
  const proyecto = idDeProyecto();
  if (!proyecto) return { token: null, motivo: "sin_proyecto" };

  // Solo se pregunta si no hay respuesta previa. Volver a preguntar a
  // quien ya dijo que no es ruido: Android ni siquiera muestra el
  // dialogo la segunda vez.
  let { status } = await N.getPermissionsAsync();
  if (status !== "granted") ({ status } = await N.requestPermissionsAsync());
  if (status !== "granted") return { token: null, motivo: "sin_permiso" };

  const { data } = await N.getExpoPushTokenAsync({ projectId: proyecto });
  return { token: data || null, motivo: data ? null : "sin_token" };
}

/**
 * Pide permiso, obtiene el token y lo guarda.
 *
 * Devuelve { ok, motivo } para que quien llame pueda explicar por que
 * no hubo notificaciones, en vez de quedarse en silencio.
 */
export async function registrarPush() {
  try {
    if (!Device.isDevice) return { ok: false, motivo: "emulador" };
    if (enExpoGo) return { ok: false, motivo: "expo_go" };

    const N = await cargar();
    if (!N) return { ok: false, motivo: "sin_modulo" };

    const { token, motivo } = await tokenDeEsteTelefono(N);
    if (!token) return { ok: false, motivo };

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
 * Avisa cuando el cliente toca una notificacion.
 *
 * Devuelve una funcion para soltar la escucha. Cubre los dos casos: el
 * app abierta y el app cerrada que se abre por el toque, porque ese
 * segundo evento ocurre antes de que exista ningun listener.
 */
export async function escucharToques(alTocar) {
  const N = await cargar();
  if (!N) return () => {};

  // Cada toque se atiende una sola vez. La "ultima respuesta" se lee de
  // nuevo cada vez que se monta quien escucha: sin esto, tocar "Cuenta
  // verificada" entraba al Inicio, el Inicio volvia a leer el mismo
  // toque y volvia a entrar, en bucle.
  const atender = (res) => {
    const id = res?.notification?.request?.identifier;
    const datos = res?.notification?.request?.content?.data;
    if (!datos || (id && toquesAtendidos.has(id))) return;
    if (id) toquesAtendidos.add(id);
    alTocar(datos);
  };

  try {
    atender(await N.getLastNotificationResponseAsync());
    const sub = N.addNotificationResponseReceivedListener(atender);

    return () => sub.remove();
  } catch (e) {
    console.warn("No se pudo escuchar notificaciones:", e?.message || e);
    return () => {};
  }
}

/**
 * Avisa cuando llega una notificacion con el app abierta. Sirve para
 * renovar lo guardado en el telefono al instante (el aviso dice que algo
 * cambio: una solicitud pagada, una tarjeta aprobada).
 */
export async function escucharLlegadas(alLlegar) {
  const N = await cargar();
  if (!N) return () => {};
  try {
    const sub = N.addNotificationReceivedListener((n) => alLlegar(n?.request?.content?.data || {}));
    return () => sub.remove();
  } catch {
    return () => {};
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
    if (!hayNotificaciones) return;

    const N = await cargar();
    if (!N) return;

    const { status } = await N.getPermissionsAsync();
    if (status !== "granted") return;

    const { token } = await tokenDeEsteTelefono(N);
    if (token) await supabase.from("push_tokens").delete().eq("token", token);
  } catch {
    // Si no se puede, la proxima sesion sobrescribe la fila igual.
  }
}
