"use client";

import { BotonAccion } from "@/components/carga";
import { Dialogo, IconoCheck } from "@/components/piezas";

/**
 * "Ya no queda nada".
 *
 * Aparece cuando el gestor termina un caso y no hay siguiente. Es una
 * ventana y no una línea de aviso porque cierra el ciclo de trabajo:
 * acaba de resolver algo y necesita saber que puede parar.
 */
export default function SinPendientes({ visible, titulo, texto, onCerrar }) {
  return (
    <Dialogo
      abierto={Boolean(visible)}
      onCerrar={onCerrar}
      titulo={titulo || "No queda nada pendiente"}
      descripcion={texto || "Atendiste todo lo que había en la cola. Cuando entre algo nuevo, te llegará solo."}
      tono="exito"
      icono={<IconoCheck />}
      ancho="max-w-sm"
      pie={<BotonAccion onClick={onCerrar}>Entendido</BotonAccion>}
    />
  );
}
