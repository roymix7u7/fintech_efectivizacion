import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { registrarPush } from "../lib/push";

/**
 * Registra el telefono para recibir alertas y lleva a la pestana
 * correcta cuando el cliente toca una notificacion.
 *
 * No dibuja nada. Vive en el layout de las pestanas, asi que solo corre
 * con la sesion ya iniciada: pedir el permiso en la pantalla de
 * bienvenida, antes de que el cliente sepa de que va el app, es la
 * forma mas rapida de que diga que no para siempre.
 */
export default function RegistroPush() {
  const router = useRouter();
  const yaRegistro = useRef(false);

  useEffect(() => {
    if (!yaRegistro.current) {
      yaRegistro.current = true;
      registrarPush().then(({ ok, motivo }) => {
        if (!ok && __DEV__) console.log("[push] sin registro:", motivo);
      });
    }

    function abrirAlertas() {
      router.push("/(tabs)/noticias?seccion=alertas");
    }

    // El app estaba cerrada y se abrio tocando la notificacion. Este
    // caso no lo cubre el listener: el evento ya ocurrio antes de que
    // existiera este componente.
    Notifications.getLastNotificationResponseAsync().then((res) => {
      if (res?.notification?.request?.content?.data?.seccion === "alertas") {
        abrirAlertas();
      }
    });

    // El app estaba abierta o en segundo plano.
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      if (res?.notification?.request?.content?.data?.seccion === "alertas") {
        abrirAlertas();
      }
    });

    return () => sub.remove();
  }, [router]);

  return null;
}
