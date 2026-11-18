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

/**
 * Atajos de teclado de una pantalla: { a: aprobar, r: rechazar, "1": ... }.
 * Una tecla sin función (o con función null) no hace nada.
 *
 * No responden mientras se escribe en un campo, con una ventana o un menú
 * abierto, ni con Ctrl, Alt o Cmd (no pisan los del navegador). Las
 * casillas sí dejan usarlos: marcar una con el mouse no apaga el teclado.
 */
export function useAtajos(mapa, activo = true) {
  const ref = useRef(mapa);
  ref.current = mapa;
  useEffect(() => {
    if (!activo) return undefined;
    const alPulsar = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (e.target?.closest?.("input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']")) return;
      const accion = ref.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (typeof accion !== "function") return;
      e.preventDefault();
      accion();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [activo]);
}

/**
 * Un aviso que sobrevive al cambio de pantalla: al aprobar una identidad
 * se pasa a la siguiente (otra dirección) y el "Aprobado" se muestra allá.
 */
export const avisoPendiente = { texto: "" };
