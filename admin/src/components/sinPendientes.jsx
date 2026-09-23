"use client";

import { BotonAccion } from "@/components/carga";

/**
 * "Ya no queda nada".
 *
 * Aparece cuando el gestor termina un caso y no hay siguiente. Es una
 * ventana y no una línea de aviso porque cierra el ciclo de trabajo:
 * acaba de resolver algo y necesita saber que puede parar, no buscar
 * un mensaje gris en una esquina.
 */
export default function SinPendientes({ visible, titulo, texto, onCerrar }) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/50 p-4"
      role="alertdialog"
      aria-modal="true"
      onClick={onCerrar}
    >
      <div
        className="entra w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl">
          ✓
        </span>
        <h2 className="text-base font-semibold text-foreground">
          {titulo || "No queda nada pendiente"}
        </h2>
        <p className="mt-1.5 text-[0.8667rem] leading-relaxed text-muted-foreground">
          {texto ||
            "Atendiste todo lo que había en la cola. Cuando entre algo nuevo, te llegará solo."}
        </p>
        <BotonAccion onClick={onCerrar} className="mt-5 w-full justify-center">
          Entendido
        </BotonAccion>
      </div>
    </div>
  );
}
