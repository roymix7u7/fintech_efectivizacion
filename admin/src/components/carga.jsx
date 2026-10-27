"use client";

import { cn } from "@/lib/utils";

/**
 * Bloque de carga con brillo. Se le da la forma de lo que va a
 * aparecer, no una barra genérica: así el salto al llegar los datos es
 * mínimo y la pantalla no se reacomoda delante del usuario.
 */
export function Esqueleto({ className }) {
  return <div className={cn("esqueleto", className)} aria-hidden />;
}

/** Filas de la cola mientras carga. */
export function EsqueletoCola({ filas = 4 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Cargando">
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className="entra rounded-xl border border-border bg-card p-3.5"
          style={{ "--retraso": `${i * 45}ms` }}
        >
          <div className="flex items-center gap-2">
            <Esqueleto className="h-3.5 w-24" />
            <Esqueleto className="ml-auto h-3.5 w-14" />
          </div>
          <Esqueleto className="mt-2.5 h-4 w-2/3" />
          <Esqueleto className="mt-2 h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Filas de una tabla o listado. */
export function EsqueletoFilas({ filas = 6, alto = "h-[60px]" }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" role="status" aria-label="Cargando">
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className={cn("entra flex items-center gap-3 border-b border-border px-4 last:border-b-0", alto)}
          style={{ "--retraso": `${i * 40}ms` }}
        >
          <Esqueleto className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Esqueleto className="h-3.5 w-1/3" />
            <Esqueleto className="h-3 w-1/4" />
          </div>
          <Esqueleto className="h-6 w-20 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Tarjetas de indicadores. */
export function EsqueletoTarjetas({ cuantas = 4 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: cuantas }).map((_, i) => (
        <div key={i} className="entra rounded-xl border border-border bg-card p-4" style={{ "--retraso": `${i * 50}ms` }}>
          <Esqueleto className="h-3.5 w-2/3" />
          <Esqueleto className="mt-3 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Rueda de espera. Para dentro de botones y zonas pequeñas. */
export function Rueda({ className, claro = false }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-solid",
        claro ? "border-white/30 border-t-white" : "border-marca-200 border-t-marca-700",
        className || "h-4 w-4",
      )}
    />
  );
}

/**
 * Barra de avance en la parte superior. Se usa cuando la pantalla ya
 * tiene datos y se está recargando: reemplazar todo por esqueletos
 * haría parpadear contenido que sigue siendo válido.
 */
export function BarraCarga({ activa }) {
  if (!activa) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-0.5 overflow-hidden bg-marca-100"
      role="progressbar"
      aria-label="Cargando"
    >
      <div className="h-full w-1/3 bg-oro-500" style={{ animation: "avance 1.1s ease-in-out infinite" }} />
    </div>
  );
}

/** Pantalla entera de espera, mientras se confirma la sesión. */
export function CargaPantalla({ texto = "Cargando el panel..." }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground">
      <Rueda />
      {texto}
    </div>
  );
}

/**
 * Botón del panel, con rueda incorporada.
 *
 * Tonos: primario (azul, la acción principal), exito (verde, aprobar),
 * peligro (rojo, rechazar o borrar), dinero (dorado, lo que mueve
 * plata), neutro (borde, acciones secundarias), suave (sin borde) y
 * peligroSuave (rojo sin fondo, para "Rechazar" junto a "Aprobar").
 */
const TONOS = {
  primario: "bg-marca-700 text-white hover:bg-marca-600 shadow-panel",
  exito: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-panel",
  peligro: "bg-red-600 text-white hover:bg-red-700 shadow-panel",
  dinero: "bg-oro-500 text-marca-900 hover:bg-oro-300 shadow-panel",
  neutro: "border border-border bg-card text-foreground hover:bg-muted",
  suave: "text-muted-foreground hover:bg-muted hover:text-foreground",
  peligroSuave: "border border-border bg-card text-red-700 hover:border-red-200 hover:bg-red-50",
};

const TAMANOS = {
  chico: "h-8 gap-1.5 px-3 text-chico",
  normal: "h-10 gap-2 px-4 text-sm",
  grande: "h-12 gap-2 px-5 text-md",
};

export function BotonAccion({
  cargando,
  children,
  icono,
  tono = "primario",
  tamano = "normal",
  className,
  type = "button",
  ...resto
}) {
  return (
    <button
      type={type}
      {...resto}
      disabled={cargando || resto.disabled}
      className={cn(
        "pulsable inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-semibold disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
        TAMANOS[tamano],
        TONOS[tono],
        className,
      )}
    >
      {cargando ? <Rueda claro={["primario", "exito", "peligro"].includes(tono)} className="h-4 w-4" /> : icono}
      {children}
    </button>
  );
}
