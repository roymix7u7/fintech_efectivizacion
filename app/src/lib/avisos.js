import { supabase } from "./supabase";
import { useDatos } from "./cache";

/**
 * Cuantos avisos personales (la campana) tiene sin leer.
 *
 * Guardado en el telefono como el resto: solo se vuelve a contar si la
 * huella "avisos" cambio (llego uno nuevo o se leyo alguno). Si la
 * consulta falla, se deja el numero anterior: una campana que parpadea
 * a cero por un corte de red dice algo que no es cierto.
 */
export function useAvisosSinLeer() {
  const { datos } = useDatos(
    "avisos-sin-leer",
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count, error } = await supabase
        .from("notificaciones")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("leida", false);
      if (error) throw error;
      return count || 0;
    },
    { grupos: ["avisos"] },
  );

  return datos || 0;
}
