import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { registrarPush, escucharToques } from "../lib/push";

/**
 * Registra el telefono para recibir alertas y lleva a la pestana
 * correcta cuando el cliente toca una notificacion.
 *
 * No importa expo-notifications: todo pasa por lib/push, que lo carga
 * solo donde ese modulo existe. En Expo Go no hay notificaciones
 * remotas y este componente simplemente no hace nada.
 *
 * Vive en el layout de las pestanas, asi que solo corre con la sesion
 * ya iniciada: pedir el permiso en la pantalla de bienvenida, antes de
 * que el cliente sepa de que va el app, es la forma mas rapida de que
 * diga que no para siempre.
 */
export default function RegistroPush() {
  const router = useRouter();
  const yaRegistro = useRef(false);

  useEffect(() => {
    let soltar = () => {};
    let vivo = true;

    if (!yaRegistro.current) {
      yaRegistro.current = true;
      registrarPush().then(({ ok, motivo }) => {
        if (!ok && __DEV__) console.log("[push] sin registro:", motivo);
      });
    }

    escucharToques((datos) => {
      if (datos?.seccion === "alertas") {
        router.push("/(tabs)/noticias?seccion=alertas");
      }
    }).then((fn) => {
      // Si el componente se fue mientras se cargaba el modulo, se
      // suelta enseguida en vez de dejar la escucha colgada.
      if (vivo) soltar = fn;
      else fn();
    });

    return () => {
      vivo = false;
      soltar();
    };
  }, [router]);

  return null;
}
