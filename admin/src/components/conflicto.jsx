"use client";

import { BotonAccion } from "@/components/carga";
import { Dialogo } from "@/components/piezas";
import { Reloj } from "@/components/shell";

/**
 * Aviso de que otra persona tiene el caso.
 *
 * Es una ventana y no una línea de error a propósito: el gestor acaba de
 * pulsar aprobar o rechazar, y tiene que enterarse de que su decisión no
 * se guardó antes de seguir con lo siguiente.
 */
export default function Conflicto({ mensaje, titulo, onCerrar, onSiguiente }) {
  return (
    <Dialogo
      abierto={Boolean(mensaje)}
      onCerrar={onCerrar}
      titulo={titulo || "Este caso ya está tomado"}
      descripcion={mensaje}
      tono="atencion"
      icono={<Reloj className="h-5 w-5" />}
      pie={
        <>
          <BotonAccion tono="neutro" onClick={onCerrar}>
            Volver a la lista
          </BotonAccion>
          {onSiguiente && <BotonAccion onClick={onSiguiente}>Atender el siguiente</BotonAccion>}
        </>
      }
    />
  );
}
