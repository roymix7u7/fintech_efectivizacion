"use client";

import { cn } from "@/lib/utils";
import { Refrescar as IconoRefrescar } from "@/components/shell";
import Pista from "@/components/pista";

/**
 * Vuelve a pedir la lista.
 *
 * Las colas cambian solas mientras se trabaja: otro revisor toma un
 * caso, entra uno nuevo, se vence una reserva. Sin esto había que
 * recargar la página entera y se perdía el caso abierto.
 */
export default function BotonRefrescar({ onClick, girando, texto }) {
  return (
    <Pista texto={texto || "Actualizar la lista"} lado="bottom">
      <button
        onClick={onClick}
        disabled={girando}
        aria-label={texto || "Actualizar la lista"}
        className={cn(
          "pulsable flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground",
          "hover:border-marca-300 hover:text-marca-700 disabled:opacity-60",
        )}
      >
        <IconoRefrescar className={cn("h-[18px] w-[18px]", girando && "animate-spin")} />
      </button>
    </Pista>
  );
}
