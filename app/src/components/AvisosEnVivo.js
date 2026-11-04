import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { invalidar } from "../lib/cache";
import { nombreCanal } from "../lib/alertas";

/**
 * La campana al instante, con o sin notificación al teléfono.
 *
 * Escucha los avisos del cliente en vivo (migración 69 puso la tabla en
 * realtime). Un aviso nuevo dice que algo cambió en la base (una
 * solicitud pagada, una tarjeta aprobada), así que se renueva todo lo
 * guardado; uno marcado como leído, desde la web o desde otro teléfono,
 * solo renueva la campana.
 *
 * Vive en el layout de las pestañas junto a RegistroPush: corre con la
 * sesión iniciada y sigue montado aunque se abra Mis avisos encima.
 */
export default function AvisosEnVivo() {
  useEffect(() => {
    let canal = null;
    let vivo = true;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!vivo || !user) return;
      canal = supabase
        .channel(nombreCanal("mis-avisos"))
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notificaciones", filter: `user_id=eq.${user.id}` },
          (cambio) => (cambio.eventType === "INSERT" ? invalidar() : invalidar("avisos")),
        )
        .subscribe();
    });

    return () => {
      vivo = false;
      if (canal) supabase.removeChannel(canal);
    };
  }, []);

  return null;
}
