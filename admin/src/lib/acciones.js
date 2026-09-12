import { supabase } from "./supabase";

/**
 * Cambia el estado de una fila solo si sigue en el estado esperado.
 *
 * El filtro por estado de origen es lo que evita que dos revisores
 * resuelvan la misma solicitud a la vez: el segundo no toca ninguna fila
 * y recibe un conflicto en vez de pisar la decision del primero.
 *
 * Devuelve { ok, conflicto, error }.
 */
export async function cambiarEstado({
  tabla,
  id,
  estadoActual,
  estadoNuevo,
  campos = {},
}) {
  const { data, error } = await supabase
    .from(tabla)
    .update({ ...campos, estado: estadoNuevo })
    .eq("id", id)
    .eq("estado", estadoActual)
    .select("id");

  if (error) return { ok: false, conflicto: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      conflicto: true,
      error:
        "Otra persona ya resolvio este registro. Refresca la lista para ver el estado actual.",
    };
  }
  return { ok: true, conflicto: false, error: null };
}

/**
 * Actualiza campos verificando el error, que antes se ignoraba por
 * completo: si una politica RLS bloqueaba la escritura, la pantalla se
 * recargaba como si todo hubiera salido bien.
 */
export async function actualizar(tabla, filtro, campos) {
  let query = supabase.from(tabla).update(campos);
  for (const [col, val] of Object.entries(filtro)) query = query.eq(col, val);
  const { data, error } = await query.select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return {
      ok: false,
      error: "No se actualizo ninguna fila. Puede ser un permiso faltante.",
    };
  return { ok: true, error: null };
}

/**
 * La auditoria nunca debe tumbar la accion principal. Si falla, se
 * avisa por consola y se sigue.
 */
export async function registrarAuditoria(entrada) {
  const { error } = await supabase.from("auditoria_logs").insert(entrada);
  if (error) console.warn("No se pudo registrar la auditoria:", error.message);
  return !error;
}

/**
 * Deja un aviso para el cliente en la tabla notificaciones, que la app
 * muestra en su campana.
 *
 * Hasta ahora el cliente no se enteraba de nada: tenia que entrar a
 * revisar a mano si lo habian aprobado.
 *
 * Igual que la auditoria, nunca tumba la accion principal. Si todavia
 * no corriste server/03-rls-y-triggers.sql, la tabla no tiene politica
 * de INSERT y esto solo avisa por consola.
 */
export async function notificar({ userId, tipo, titulo, cuerpo }) {
  if (!userId) return false;
  const { error } = await supabase.from("notificaciones").insert({
    user_id: userId,
    tipo,
    titulo,
    cuerpo,
  });
  if (error) console.warn("No se pudo notificar al cliente:", error.message);
  return !error;
}
