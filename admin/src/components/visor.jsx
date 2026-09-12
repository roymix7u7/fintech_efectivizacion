"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Visor de documentos escaneados.
 *
 * Revisar un comprobante es leer numeros pequenos en una foto tomada
 * con la mano, asi que necesita zoom y giro de verdad, no una miniatura.
 *
 * Y cuando la imagen no carga, dice por que. Antes el panel mostraba
 * "Sin comprobante" tanto si el cliente no habia subido nada como si
 * el archivo existia pero no se podia leer, que son dos problemas
 * completamente distintos.
 */
export default function Visor({ url, error, path, titulo = "Documento", alto = "h-[420px]" }) {
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [falloCarga, setFalloCarga] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Al cambiar de documento se vuelve al encuadre inicial.
  useEffect(() => {
    setZoom(1);
    setGiro(0);
    setFalloCarga(false);
    setCargando(Boolean(url));
  }, [url]);

  useEffect(() => {
    if (!pantallaCompleta) return;
    const alPulsar = (e) => e.key === "Escape" && setPantallaCompleta(false);
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [pantallaCompleta]);

  // ── Sin documento o con fallo ──
  if (!url || falloCarga) {
    const esFallo = Boolean(error) || falloCarga;
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center",
          alto,
          esFallo
            ? "border-red-200 bg-red-50/60"
            : "border-border bg-muted/40",
        )}
      >
        <div
          className={cn(
            "mb-3 flex h-11 w-11 items-center justify-center rounded-full",
            esFallo ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="h-5 w-5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m3 16 5-5 4 4 3-3 6 6" />
            {esFallo && <path d="M3 3l18 18" />}
          </svg>
        </div>
        <p
          className={cn(
            "text-sm font-semibold",
            esFallo ? "text-red-800" : "text-foreground",
          )}
        >
          {esFallo ? "No se pudo abrir el documento" : "Sin documento adjunto"}
        </p>
        <p
          className={cn(
            "mt-1 max-w-sm text-[13px]",
            esFallo ? "text-red-700" : "text-muted-foreground",
          )}
        >
          {error ||
            (falloCarga
              ? "El enlace se generó pero el archivo llegó vacío o dañado."
              : "El cliente no adjuntó ninguna imagen.")}
        </p>
        {path && (
          <p className="mt-3 cifras font-mono text-[11px] text-muted-foreground/80">
            {path}
          </p>
        )}
      </div>
    );
  }

  const marco = (
    <>
      {cargando && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/60">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-marca-200 border-t-marca-700" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={titulo}
        onLoad={() => setCargando(false)}
        onError={() => {
          setCargando(false);
          setFalloCarga(true);
        }}
        style={{ transform: `scale(${zoom}) rotate(${giro}deg)` }}
        className="max-h-full max-w-full object-contain transition-transform duration-200"
        draggable={false}
      />
    </>
  );

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border bg-muted/50 px-2 py-1.5">
          <span className="mr-auto pl-1.5 text-[12px] font-medium text-muted-foreground">
            {titulo}
          </span>
          <Boton
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
            desactivado={zoom <= 1}
            titulo="Alejar"
          >
            <svg {...ico}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5M8 11h6" />
            </svg>
          </Boton>
          <span className="cifras w-11 text-center text-[12px] font-medium text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Boton
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
            desactivado={zoom >= 4}
            titulo="Acercar"
          >
            <svg {...ico}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
            </svg>
          </Boton>
          <span className="mx-1 h-5 w-px bg-border" />
          <Boton onClick={() => setGiro((g) => g + 90)} titulo="Girar">
            <svg {...ico}>
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
            </svg>
          </Boton>
          <Boton onClick={() => setPantallaCompleta(true)} titulo="Ampliar">
            <svg {...ico}>
              <path d="M9 3H3v6M15 21h6v-6M21 9V3h-6M3 15v6h6" />
            </svg>
          </Boton>
          <Boton
            onClick={() => window.open(url, "_blank", "noopener")}
            titulo="Abrir en otra pestaña"
          >
            <svg {...ico}>
              <path d="M14 4h6v6" />
              <path d="M20 4 11 13" />
              <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
            </svg>
          </Boton>
        </div>

        <div
          className={cn(
            "lienzo-documento relative flex items-center justify-center overflow-auto scroll-fino",
            alto,
          )}
        >
          {marco}
        </div>
      </div>

      {pantallaCompleta && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-marca-950/95 animate-aparecer"
          onClick={() => setPantallaCompleta(false)}
        >
          <div className="flex items-center gap-2 px-5 py-3 text-white/80">
            <span className="mr-auto text-sm font-medium">{titulo}</span>
            <span className="text-xs text-white/50">
              Pulsa Escape o haz clic fuera para cerrar
            </span>
            <button
              onClick={() => setPantallaCompleta(false)}
              className="rounded-md p-1.5 transition hover:bg-white/10"
              aria-label="Cerrar"
            >
              <svg {...ico}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-auto p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={titulo}
              onClick={(e) => e.stopPropagation()}
              style={{ transform: `rotate(${giro}deg)` }}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

const ico = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-4 w-4",
};

function Boton({ children, onClick, titulo, desactivado }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactivado}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition",
        desactivado
          ? "cursor-not-allowed opacity-35"
          : "hover:bg-card hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
