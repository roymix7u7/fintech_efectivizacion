"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo y nombre de la empresa. */
export function Logo({ tamano = 36, conTexto = true, claro = true }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/logo.png"
        alt="AlToque Perú WK"
        width={tamano}
        height={tamano}
        priority
        className="shrink-0 object-contain"
      />
      {conTexto && (
        <div className="leading-tight">
          <p
            className={cn(
              "text-[13px] font-bold tracking-[0.14em]",
              claro ? "text-oro-500" : "text-marca-700",
            )}
          >
            ALTOQUE PERÚ
          </p>
          <p
            className={cn(
              "text-[10px] tracking-[0.22em]",
              claro ? "text-white/45" : "text-muted-foreground",
            )}
          >
            PANEL INTERNO
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Etiqueta de estado. Un color por significado, no por decoración:
 * ámbar es algo que espera a alguien, verde resuelto a favor, rojo
 * resuelto en contra, gris inactivo.
 */
const TONOS = {
  espera: "bg-oro-50 text-oro-700 ring-oro-300/60",
  exito: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  error: "bg-red-50 text-red-700 ring-red-200",
  neutro: "bg-muted text-muted-foreground ring-border",
  info: "bg-marca-50 text-marca-700 ring-marca-200",
};

const ESTADOS = {
  pendiente: { texto: "Pendiente", tono: "espera" },
  pendiente_kyc: { texto: "Por revisar", tono: "espera" },
  aprobado: { texto: "Aprobado", tono: "exito" },
  activo: { texto: "Activo", tono: "exito" },
  rechazado: { texto: "Rechazado", tono: "error" },
  observado: { texto: "Observado", tono: "error" },
  bloqueado: { texto: "Bloqueado", tono: "neutro" },
};

export function Estado({ valor, etiqueta, tono, className }) {
  const base = ESTADOS[valor] || { texto: valor || "—", tono: "neutro" };
  const t = TONOS[tono || base.tono] || TONOS.neutro;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
        "text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        t,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {etiqueta || base.texto}
    </span>
  );
}

/** Par etiqueta y valor, la unidad basica de las fichas de datos. */
export function Dato({ etiqueta, children, mono = false, className }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </dt>
      <dd
        className={cn(
          "mt-1 truncate text-sm font-medium text-foreground",
          mono && "cifras font-mono",
        )}
      >
        {children || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

/** Estado vacío con una explicación, no solo un texto gris suelto. */
export function Vacio({ icono, titulo, detalle, accion }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      {icono && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icono}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{titulo}</p>
      {detalle && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detalle}</p>
      )}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

/** Aviso de error. Se usa para que ningun fallo quede en silencio. */
export function Aviso({ tono = "error", titulo, children, onCerrar }) {
  const estilos = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-marca-200 bg-marca-50 text-marca-700",
    espera: "border-oro-300/60 bg-oro-50 text-oro-700",
  };
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        estilos[tono],
      )}
    >
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        <div className={titulo ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
      {onCerrar && (
        <button
          onClick={onCerrar}
          className="shrink-0 opacity-60 transition hover:opacity-100"
          aria-label="Cerrar aviso"
        >
          ✕
        </button>
      )}
    </div>
  );
}
