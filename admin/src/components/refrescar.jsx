"use client";

import { cn } from "@/lib/utils";
import { Refrescar as IconoRefrescar } from "@/components/shell";
import Pista from "@/components/pista";

/**
 * Vuelve a pedir la cola.
 *
 * Las colas cambian solas mientras se trabaja: otro revisor toma un
 * caso, entra uno nuevo, se vence una reserva. Sin esto había que
 * recargar la página entera y se perdía el caso abierto.
 */
export default function BotonRefrescar({ onClick, girando, texto }) {
  return (
    <Pista texto={texto || "Volver a pedir la lista"}>
      <button
        onClick={onClick}
        disabled={girando}
        aria-label="Actualizar"
        className={cn(
          "pulsable flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground",
          "hover:border-marca-300 hover:text-marca-700 disabled:opacity-60",
        )}
      >
        <IconoRefrescar className={cn("h-4 w-4", girando && "animate-spin")} />
      </button>
    </Pista>
  );
}
