import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "./supabase";

/**
 * Cuantos avisos personales (la campana) tiene sin leer.
 *
 * Se recuenta cada vez que la pantalla vuelve a tener el foco, asi la
 * campana se apaga despues de leerlos. Si la consulta falla, se deja el
 * numero anterior: una campana que parpadea a cero por un corte de red
 * dice algo que no es cierto.
 */
export function useAvisosSinLeer() {
  const [sinLeer, setSinLeer] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !vivo) return;
        const { count, error } = await supabase
          .from("notificaciones")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("leida", false);
        if (!error && vivo) setSinLeer(count || 0);
      })();
      return () => {
        vivo = false;
      };
    }, []),
  );

  return sinLeer;
}
