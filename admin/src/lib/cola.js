import { supabase } from "./supabase";

/** Minutos que dura la reserva de un caso. Debe coincidir con la base. */
export const RESERVA_MINUTOS = 20;

/**
 * Pide el siguiente caso libre de la cola.
 *
 * El reparto lo hace Postgres con FOR UPDATE SKIP LOCKED, asi que dos
 * personas nunca reciben el mismo aunque pulsen a la vez. Si el
 * trabajador ya tenia uno tomado, le devuelve ese.
 *
 * Devuelve { id, vacia, error }.
 */
export async function tomarSiguiente(tipo) {
  const { data, error } = await supabase.rpc("tomar_siguiente", {
    p_tipo: tipo,
  });
  if (error) return { id: null, vacia: false, error: error.message };
  return { id: data || null, vacia: !data, error: null };
}

/** Devuelve un caso a la bolsa para que lo tome otra persona. */
export async function soltarCaso(tipo, id) {
  const { error } = await supabase.rpc("soltar_caso", {
    p_tipo: tipo,
    p_id: id,
  });
  return { ok: !error, error: error?.message || null };
}

/**
 * Como esta cada cola: pendientes, tomados por alguien, libres y los
 * que tiene el usuario actual.
 */
export async function estadoCola() {
  const { data, error } = await supabase.rpc("estado_cola");
  if (error) return { colas: {}, error: error.message };

  const colas = {};
  for (const fila of data || []) colas[fila.tipo] = fila;
  return { colas, error: null };
}

/** Contadores para la barra lateral, a partir del estado de las colas. */
export function contadoresDe(colas) {
  return {
    solicitudesPendientes: colas.solicitud?.pendientes || 0,
    tarjetasPendientes: colas.tarjeta?.pendientes || 0,
    kycPendientes: colas.kyc?.pendientes || 0,
  };
}

/** Minutos que quedan de reserva sobre un caso tomado. */
export function minutosRestantes(asignadoEn) {
  if (!asignadoEn) return 0;
  const transcurridos = (Date.now() - new Date(asignadoEn).getTime()) / 60000;
  return Math.max(0, Math.ceil(RESERVA_MINUTOS - transcurridos));
}

/** true si la reserva ya venció y el caso volvió a la bolsa. */
export function reservaVencida(asignadoEn) {
  return minutosRestantes(asignadoEn) <= 0;
}
