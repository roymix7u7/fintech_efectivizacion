"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo y nombre de la empresa. Sin texto cuando la barra está plegada. */
export function Logo({ tamano = 34, conTexto = true, claro = true }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Image
        src="/logo.png"
        alt="AlToque Perú WK"
        width={tamano}
        height={tamano}
        priority
        className="shrink-0 object-contain"
      />
      {conTexto && (
        <div className="min-w-0 leading-tight">
          <p className={cn("font-heading text-sm font-bold tracking-[0.12em]", claro ? "text-oro-500" : "text-marca-700")}>
            ALTOQUE PERÚ
          </p>
          <p className={cn("text-xs font-medium tracking-[0.18em]", claro ? "text-white/50" : "text-muted-foreground")}>
            PANEL INTERNO
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Etiqueta de estado. Un color por significado y siempre con ícono,
 * igual que en la app: ámbar espera a alguien, verde resuelto a favor,
 * rojo resuelto en contra, azul pagado, gris inactivo.
 */
const TONOS = {
  espera: "bg-oro-100 text-oro-700",
  exito: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700",
  neutro: "bg-muted text-muted-foreground",
  info: "bg-marca-100 text-marca-700",
  pagado: "bg-emerald-700 text-white",
};

const ICONOS = {
  espera: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  exito: <path d="M20 6 9 17l-5-5" />,
  error: <path d="M18 6 6 18M6 6l12 12" />,
  neutro: <path d="M5 12h14" />,
  info: <path d="M12 16v-5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  pagado: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
};

const ESTADOS = {
  pendiente: { texto: "Pendiente", tono: "espera" },
  pendiente_kyc: { texto: "Por revisar", tono: "espera" },
  aprobado: { texto: "Aprobado", tono: "exito" },
  pagado: { texto: "Pagado", tono: "pagado" },
  activo: { texto: "Verificado", tono: "exito" },
  rechazado: { texto: "Rechazado", tono: "error" },
  observado: { texto: "Observado", tono: "error" },
  bloqueado: { texto: "Bloqueado", tono: "neutro" },
};

export function Estado({ valor, etiqueta, tono, className }) {
  const base = ESTADOS[valor] || { texto: valor || "—", tono: "neutro" };
  const t = tono || base.tono;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2.5 text-xs font-bold",
        TONOS[t] || TONOS.neutro,
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden
      >
        {ICONOS[t] || ICONOS.neutro}
      </svg>
      {etiqueta || base.texto}
    </span>
  );
}

/** Par etiqueta y valor, la unidad básica de las fichas de datos. */
export function Dato({ etiqueta, children, mono = false, className, accion }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-semibold text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("mt-0.5 flex min-w-0 items-center gap-1 text-md font-semibold text-foreground", mono && "cifras font-mono")}>
        <span className="min-w-0 truncate">{children || <span className="font-normal text-muted-foreground">—</span>}</span>
        {accion}
      </dd>
    </div>
  );
}

/** Estado vacío con una explicación, no solo un texto gris suelto. */
export function Vacio({ icono, titulo, detalle, accion, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-marca-200 bg-card/70 px-6 py-12 text-center",
        className,
      )}
    >
      {icono && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-marca-50 text-marca-500 [&>svg]:h-6 [&>svg]:w-6">
          {icono}
        </div>
      )}
      <p className="font-heading text-md font-semibold text-foreground">{titulo}</p>
      {detalle && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detalle}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

/** Aviso dentro de la pantalla. Se usa para que ningún fallo quede en silencio. */
export function Aviso({ tono = "error", titulo, children, onCerrar, className, accion }) {
  const estilos = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-marca-200 bg-marca-50 text-marca-700",
    espera: "border-oro-300 bg-oro-50 text-oro-700",
    exito: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  const iconos = {
    error: <path d="M12 8v4M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
    info: <path d="M12 16v-5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
    espera: <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />,
    exito: <path d="M20 6 9 17l-5-5" />,
  };
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", estilos[tono], className)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-[18px] w-[18px] shrink-0">
        {iconos[tono]}
      </svg>
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-bold">{titulo}</p>}
        <div className={titulo ? "mt-0.5 opacity-95" : ""}>{children}</div>
      </div>
      {accion}
      {onCerrar && (
        <button onClick={onCerrar} className="-mr-1 shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100" aria-label="Cerrar aviso">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
