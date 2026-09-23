import { supabase } from "./supabase";
import { explicarError } from "./acciones";

/**
 * Resuelve un caso (identidad, tarjeta o comprobante) pasando por la
 * funcion del servidor.
 *
 * Toda la decision ocurre dentro de una transaccion que bloquea la fila:
 * comprueba que siga pendiente y que la tenga quien la esta resolviendo.
 * Si otro llego antes, devuelve quien la tiene en vez de pisar su
 * decision, y la pantalla lo dice con nombre.
 */
export async function resolverCaso({ tipo, id, aprobar, motivo }) {
  const { data, error } = await supabase.rpc("resolver_caso", {
    p_tipo: tipo,
    p_id: id,
    p_aprobar: aprobar,
    p_motivo: motivo ?? null,
  });

  if (error) {
    return {
      ok: false,
      motivo: "ERROR",
      mensaje:
        error.code === "P0001"
          ? error.message
          : explicarError(error, "No se pudo resolver el caso."),
    };
  }
  if (data?.ok) return { ok: true };

  return { ok: false, ...data, mensaje: mensajeConflicto(data, tipo) };
}

const NOMBRE = {
  solicitud: "Este comprobante",
  tarjeta: "Esta tarjeta",
  kyc: "Esta identidad",
};

/** Explica por que no se pudo, en palabras que se entienden. */
export function mensajeConflicto(d, tipo) {
  const que = NOMBRE[tipo] || "Este caso";
  if (d?.motivo === "TOMADO") {
    return `${que} lo está revisando ${d.quien} en este momento. Si no lo resuelve, vuelve a la cola en ${d.libre_en} min.`;
  }
  if (d?.motivo === "RESUELTO") {
    return `${que} ya fue resuelto por otra persona (quedó como ${d.estado}). La lista se actualizó.`;
  }
  if (d?.motivo === "NO_EXISTE") return `${que} ya no existe.`;
  return "No se pudo resolver el caso.";
}

/** Cuantos casos tiene el gestor en su bandeja ahora mismo. */
export async function misCasos() {
  const { data } = await supabase.rpc("mis_casos");
  return data || { solicitudes: 0, tarjetas: 0, kyc: 0 };
}

/** Quien tiene un caso, o null si esta libre o es mio. */
export async function quienAtiende(tipo, id) {
  const { data } = await supabase.rpc("quien_atiende", {
    p_tipo: tipo,
    p_id: id,
  });
  return data || null;
}
