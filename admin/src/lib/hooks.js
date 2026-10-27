"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Retrasa un valor hasta que deja de cambiar.
 *
 * Con la búsqueda en el servidor, escribir "rodriguez" dispararía diez
 * consultas, una por letra. Esto espera a que el usuario termine y
 * manda una sola.
 */
export function useRetraso(valor, ms = 350) {
  const [retrasado, setRetrasado] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);

  return retrasado;
}

/**
 * Busca los clientes cuyo nombre, apellido o DNI coincide, y devuelve
 * sus identificadores.
 *
 * Hace falta porque la búsqueda va contra la tabla de solicitudes, que
 * solo guarda el identificador del cliente. Sin este paso solo se
 * podría buscar por código de solicitud o por banco.
 *
 * El tope existe para que la lista de identificadores no haga crecer
 * la URL de la consulta sin control.
 */
export async function idsDeClientes(supabase, termino, tope = 150) {
  const t = termino.trim();
  if (t.length < 2) return [];

  const patron = `%${t}%`;
  const { data } = await supabase
    .from("perfiles_cliente")
    .select("id")
    .or(
      `nombres.ilike.${patron},apellidos.ilike.${patron},dni.ilike.${patron}`,
    )
    .limit(tope);

  return (data || []).map((p) => p.id);
}

/**
 * En pantallas angostas la lista y el detalle van uno debajo del otro:
 * al elegir un caso, la vista baja sola al detalle. Sin esto parecía que
 * tocar la fila no hacía nada, porque lo abierto quedaba fuera de vista.
 */
export function useIrAlDetalle(clave) {
  const ref = useRef(null);
  useEffect(() => {
    if (!clave || !ref.current) return;
    if (window.matchMedia("(max-width: 1279px)").matches) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [clave]);
  return ref;
}
