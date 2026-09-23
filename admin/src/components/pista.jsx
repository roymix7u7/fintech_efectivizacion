"use client";

import { cn } from "@/lib/utils";

/**
 * Explicación que aparece al pasar el cursor o al enfocar con teclado.
 *
 * Se usa para lo que hay que saber una vez y no todo el rato: qué
 * significa un estado, qué hace un botón, de dónde sale un número. Antes
 * eso vivía en párrafos fijos que competían con los datos.
 *
 * Sin children dibuja el signo de interrogación; con children, envuelve
 * lo que le pases.
 */
export default function Pista({ texto, children, fin = false, className }) {
  return (
    <span
      className={cn("pista", fin && "pista-fin", className)}
      data-pista={texto}
      aria-label={texto}
      tabIndex={0}
      role="note"
    >
      {children ?? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[9px] font-bold text-muted-foreground">
          ?
        </span>
      )}
    </span>
  );
}
