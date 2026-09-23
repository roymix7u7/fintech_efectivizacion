"use client";

import { BotonAccion } from "@/components/carga";

/**
 * Aviso de que otra persona tiene el caso.
 *
 * Es una ventana y no una linea de error a proposito: el gestor acaba de
 * pulsar aprobar o rechazar, y tiene que enterarse de que su decision no
 * se guardo antes de seguir con lo siguiente.
 */
export default function Conflicto({ mensaje, onCerrar, onSiguiente }) {
  if (!mensaje) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/50 p-4"
      role="alertdialog"
      aria-modal="true"
      onClick={onCerrar}
    >
      <div
        className="entra w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oro-100 text-lg">
            ⏳
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              Este caso ya está tomado
            </h2>
            <p className="mt-1 text-[0.8667rem] leading-relaxed text-muted-foreground">
              {mensaje}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {onSiguiente && (
            <BotonAccion onClick={onSiguiente} className="flex-1">
              Atender el siguiente
            </BotonAccion>
          )}
          <BotonAccion tono="neutro" onClick={onCerrar}>
            Entendido
          </BotonAccion>
        </div>
      </div>
    </div>
  );
}
