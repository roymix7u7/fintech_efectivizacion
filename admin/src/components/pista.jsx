"use client";

import { Tooltip } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Explicación que aparece al pasar el cursor o al enfocar con teclado.
 *
 * Es para lo que hay que saber una vez y no todo el rato: qué significa
 * un estado, qué hace un botón, de dónde sale un número. Así la pantalla
 * muestra datos y no párrafos de ayuda.
 *
 * Se dibuja en una capa aparte (portal): antes la burbuja era CSS y se
 * cortaba en el borde de las listas con desplazamiento propio.
 *
 * Sin children dibuja el ícono de información; con children, envuelve
 * lo que le pases. `lado` decide hacia dónde abre (top, right, bottom,
 * left); `fin` la alinea al final, para lo que está cerca del borde.
 */
export default function Pista({ texto, children, fin = false, lado = "top", className, ancho = 260 }) {
  if (!texto) return children ?? null;
  return (
    <Tooltip.Provider delayDuration={180} skipDelayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {children ? (
            <span className={cn("inline-flex min-w-0 items-center", className)}>{children}</span>
          ) : (
            <button
              type="button"
              aria-label={texto}
              className={cn(
                "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:text-marca-600 focus-visible:text-marca-600",
                className,
              )}
            >
              <IconoInfo className="h-[16px] w-[16px]" />
            </button>
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={lado}
            align={fin ? "end" : "center"}
            sideOffset={6}
            collisionPadding={12}
            style={{ maxWidth: ancho }}
            className="z-[95] rounded-lg bg-marca-900 px-3 py-2 text-chico font-medium leading-snug text-white shadow-flotante animate-aparecer"
          >
            {texto}
            <Tooltip.Arrow className="fill-marca-900" width={10} height={5} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/** El ícono de información, por si se usa suelto. */
export function IconoInfo(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
    </svg>
  );
}
