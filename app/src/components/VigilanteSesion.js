import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { cerrarSesion, tiempoRestante } from "../lib/sesion";
import { useAviso } from "./Avisos";

/**
 * Cierra la sesion cuando se cumple el plazo.
 *
 * Comprueba en dos momentos, y hacen falta los dos:
 *
 *   · al volver del segundo plano, porque el telefono suspende los
 *     temporizadores mientras la app no esta en pantalla, asi que
 *     alguien podria dejarla abierta tres horas y volver sin que
 *     ningun temporizador hubiera llegado a dispararse;
 *
 *   · cada minuto mientras esta en uso, para que tambien caduque
 *     delante de quien la tiene abierta.
 *
 * No dibuja nada. Vive en el layout raiz para vigilar toda la app.
 */
const CADA = 60 * 1000;

// Pantallas donde no hay sesion que vigilar todavia.
const PUBLICAS = ["/", "/login", "/registro", "/recuperar"];

export default function VigilanteSesion() {
  const router = useRouter();
  const pathname = usePathname();
  const { mostrar } = useAviso();

  // Evita cerrar dos veces si coinciden el regreso y el temporizador.
  const cerrando = useRef(false);
  const rutaRef = useRef(pathname);
  rutaRef.current = pathname;

  useEffect(() => {
    let vivo = true;

    async function revisar() {
      if (!vivo || cerrando.current) return;
      if (PUBLICAS.includes(rutaRef.current)) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      if ((await tiempoRestante()) > 0) return;

      cerrando.current = true;
      await cerrarSesion();
      if (!vivo) return;

      mostrar(
        "Tu sesión venció por seguridad. Vuelve a iniciar sesión.",
        "atencion",
        5000,
      );
      router.replace("/login");
      cerrando.current = false;
    }

    revisar();
    const reloj = setInterval(revisar, CADA);

    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") revisar();
    });

    return () => {
      vivo = false;
      clearInterval(reloj);
      sub.remove();
    };
  }, [router, mostrar]);

  return null;
}
