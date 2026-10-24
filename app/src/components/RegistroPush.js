import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { registrarPush, escucharToques, escucharLlegadas } from "../lib/push";
import { invalidar } from "../lib/cache";
import { entrarA } from "../lib/sesion";

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
      // dismissTo y no push: la notificacion puede tocarse con otra
      // pantalla abierta encima de las pestanas, y push crearia una
      // segunda copia de ellas en vez de volver a las que ya existen.
      if (datos?.seccion === "alertas") {
        router.dismissTo("/(tabs)/noticias?seccion=alertas");
      } else if (datos?.seccion === "avisos") {
        // Un aviso personal: se va a donde se ve lo que cambió, con lo
        // guardado ya renovado.
        invalidar();
        const tipo = String(datos.tipo || "");
        if (tipo === "kyc_aprobado") entrarA(router, "/(tabs)/inicio");
        else if (tipo === "kyc_observado") entrarA(router, "/en-revision");
        else if (tipo.startsWith("tarjeta")) router.dismissTo("/(tabs)/tarjetas");
        else if (tipo.startsWith("solicitud") || tipo.startsWith("pago")) router.dismissTo("/(tabs)/solicitudes");
        else router.push("/notificaciones");
      }
    }).then((fn) => {
      // Si el componente se fue mientras se cargaba el modulo, se
      // suelta enseguida en vez de dejar la escucha colgada.
      if (vivo) soltar = fn;
      else fn();
    });

    // Con el app abierta: lo que el aviso anuncia ya cambió en la base,
    // así que se renueva la copia guardada sin esperar.
    let soltarLlegadas = () => {};
    escucharLlegadas(() => invalidar()).then((fn) => {
      if (vivo) soltarLlegadas = fn;
      else fn();
    });

    return () => {
      vivo = false;
      soltar();
      soltarLlegadas();
    };
  }, [router]);

  return null;
}
