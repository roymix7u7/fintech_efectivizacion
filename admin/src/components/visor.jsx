"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import Pista from "@/components/pista";

/**
 * Visor de documentos escaneados.
 *
 * Revisar un comprobante es leer números pequeños en una foto tomada
 * con la mano, así que necesita zoom y giro de verdad, no una miniatura:
 *   - rueda del mouse para acercar o alejar donde está el cursor,
 *   - arrastrar para moverse cuando está ampliada,
 *   - doble clic para ampliar o volver al encuadre,
 *   - teclado con el visor enfocado: + − 0 R F.
 *
 * Y cuando la imagen no carga, dice por qué: no es lo mismo que el
 * cliente no haya subido nada a que el archivo exista y no se pueda leer.
 */
const MIN = 1;
const MAX = 5;
const limitar = (z) => Math.min(MAX, Math.max(MIN, +z.toFixed(2)));

export default function Visor({ url, error, path, titulo = "Documento", alto = "h-[420px]" }) {
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  const [mover, setMover] = useState({ x: 0, y: 0 });
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [falloCarga, setFalloCarga] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Al cambiar de documento se vuelve al encuadre inicial.
  useEffect(() => {
    setZoom(1);
    setGiro(0);
    setMover({ x: 0, y: 0 });
    setFalloCarga(false);
    setCargando(Boolean(url));
  }, [url]);

  // Sin zoom no hay nada que mover: se recentra.
  useEffect(() => {
    if (zoom === 1) setMover({ x: 0, y: 0 });
  }, [zoom]);

  const ajustar = useCallback(() => {
    setZoom(1);
    setGiro(0);
    setMover({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!pantallaCompleta) return;
    const alPulsar = (e) => e.key === "Escape" && setPantallaCompleta(false);
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [pantallaCompleta]);

  function teclas(e) {
    if (e.target.closest("button")) return;
    const k = e.key.toLowerCase();
    if (k === "+" || k === "=") setZoom((z) => limitar(z + 0.25));
    else if (k === "-" || k === "_") setZoom((z) => limitar(z - 0.25));
    else if (k === "0") ajustar();
    else if (k === "r") setGiro((g) => g + 90);
    else if (k === "f") setPantallaCompleta(true);
    else return;
    e.preventDefault();
  }

  // ── Sin documento o con fallo ──
  if (!url || falloCarga) {
    const esFallo = Boolean(error) || falloCarga;
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center",
          alto,
          esFallo ? "border-red-200 bg-red-50/60" : "border-marca-200 bg-card",
        )}
      >
        <div
          className={cn(
            "mb-3 flex h-12 w-12 items-center justify-center rounded-full",
            esFallo ? "bg-red-100 text-red-600" : "bg-marca-50 text-marca-500",
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" className="h-6 w-6">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m3 16 5-5 4 4 3-3 6 6" />
            {esFallo && <path d="M3 3l18 18" />}
          </svg>
        </div>
        <p className={cn("font-heading text-md font-semibold", esFallo ? "text-red-800" : "text-foreground")}>
          {esFallo ? "No se pudo abrir el documento" : "Sin documento adjunto"}
        </p>
        <p className={cn("mt-1 max-w-sm text-sm", esFallo ? "text-red-700" : "text-muted-foreground")}>
          {error ||
            (falloCarga ? "El enlace se generó pero el archivo llegó vacío o dañado." : "El cliente no adjuntó ninguna imagen.")}
        </p>
        {path && <p className="cifras mt-3 break-all font-mono text-xs text-muted-foreground">{path}</p>}
      </div>
    );
  }

  const controles = { zoom, setZoom, giro, mover, setMover };

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
        <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5">
          <span className="mr-auto truncate pl-1.5 text-sm font-semibold text-muted-foreground">{titulo}</span>
          <Herramientas
            zoom={zoom}
            setZoom={setZoom}
            onGirar={() => setGiro((g) => g + 90)}
            onAjustar={ajustar}
            onAmpliar={() => setPantallaCompleta(true)}
          />
        </div>

        <div
          tabIndex={0}
          onKeyDown={teclas}
          aria-label={`${titulo}. Usa + y − para acercar, R para girar, F para pantalla completa.`}
          className={cn("lienzo-documento relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-marca-500", alto)}
        >
          {cargando && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/60">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-marca-200 border-t-marca-700" />
            </div>
          )}
          <Lienzo
            url={url}
            titulo={titulo}
            {...controles}
            onCargada={() => setCargando(false)}
            onFallo={() => {
              setCargando(false);
              setFalloCarga(true);
            }}
          />
          {zoom > 1 && (
            <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-marca-950/70 px-2 py-1 text-xs font-semibold text-white">
              Arrastra para moverte
            </span>
          )}
        </div>
      </div>

      {pantallaCompleta && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-marca-950/95 animate-aparecer" role="dialog" aria-modal="true" aria-label={titulo}>
          <div className="flex items-center gap-2 px-5 py-3 text-white">
            <span className="mr-auto truncate text-md font-semibold">{titulo}</span>
            <span className="hidden text-chico text-white/60 sm:inline">Rueda para acercar · arrastra para moverte · Escape para cerrar</span>
            <div className="flex items-center gap-0.5 rounded-lg bg-white/10 px-1 py-0.5 [&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_span]:text-white/80">
              <Herramientas
                zoom={zoom}
                setZoom={setZoom}
                onGirar={() => setGiro((g) => g + 90)}
                onAjustar={ajustar}
                sinAmpliar
              />
            </div>
            <button
              onClick={() => setPantallaCompleta(false)}
              className="rounded-md p-2 text-white/80 transition hover:bg-white/10"
              aria-label="Cerrar"
            >
              <svg {...ico}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <Lienzo url={url} titulo={titulo} {...controles} grande />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * La imagen con zoom, giro y desplazamiento. La rueda acerca hacia
 * donde está el cursor, y al estar ampliada se arrastra con el mouse o
 * el dedo.
 */
function Lienzo({ url, titulo, zoom, setZoom, giro, mover, setMover, onCargada, onFallo, grande = false }) {
  const caja = useRef(null);
  const arrastre = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  // Lo último pintado, para calcular la rueda sin anidar actualizaciones.
  const actual = useRef({ zoom, mover });
  actual.current = { zoom, mover };

  // La rueda se escucha a mano: React registra onWheel como pasivo y
  // así no se puede impedir que la página entera se desplace.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const alGirar = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      const { zoom: z, mover: m } = actual.current;
      const nuevo = limitar(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      if (nuevo === z) return;
      const f = nuevo / z;
      // Mantiene quieto el punto bajo el cursor.
      setZoom(nuevo);
      setMover(nuevo === 1 ? { x: 0, y: 0 } : { x: cx - (cx - m.x) * f, y: cy - (cy - m.y) * f });
    };
    el.addEventListener("wheel", alGirar, { passive: false });
    return () => el.removeEventListener("wheel", alGirar);
  }, [setZoom, setMover]);

  return (
    <div
      ref={caja}
      className={cn(
        "absolute inset-0 flex touch-none select-none items-center justify-center",
        grande ? "p-6" : "p-2",
        zoom > 1 ? (arrastrando ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
      )}
      onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2.5))}
      onPointerDown={(e) => {
        if (zoom <= 1 || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        arrastre.current = { x: e.clientX - mover.x, y: e.clientY - mover.y };
        setArrastrando(true);
      }}
      onPointerMove={(e) => {
        if (!arrastre.current) return;
        setMover({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y });
      }}
      onPointerUp={() => {
        arrastre.current = null;
        setArrastrando(false);
      }}
      onPointerCancel={() => {
        arrastre.current = null;
        setArrastrando(false);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={titulo}
        onLoad={onCargada}
        onError={onFallo}
        draggable={false}
        style={{ transform: `translate(${mover.x}px, ${mover.y}px) scale(${zoom}) rotate(${giro}deg)` }}
        className={cn("max-h-full max-w-full object-contain", !arrastrando && "transition-transform duration-150")}
      />
    </div>
  );
}

function Herramientas({ zoom, setZoom, onGirar, onAjustar, onAmpliar, sinAmpliar = false }) {
  return (
    <>
      <Boton onClick={() => setZoom((z) => limitar(z - 0.25))} desactivado={zoom <= MIN} titulo="Alejar (−)">
        <svg {...ico}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5M8 11h6" />
        </svg>
      </Boton>
      <span className="cifras w-12 text-center text-chico font-bold text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <Boton onClick={() => setZoom((z) => limitar(z + 0.25))} desactivado={zoom >= MAX} titulo="Acercar (+)">
        <svg {...ico}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
        </svg>
      </Boton>
      <span className="mx-1 h-5 w-px bg-border" />
      <Boton onClick={onGirar} titulo="Girar 90° (R)">
        <svg {...ico}>
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      </Boton>
      <Boton onClick={onAjustar} titulo="Volver al encuadre (0)">
        <svg {...ico}>
          <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
        </svg>
      </Boton>
      {!sinAmpliar && (
        <>
          <Boton onClick={onAmpliar} titulo="Pantalla completa (F)">
            <svg {...ico}>
              <path d="M9 3H3v6M15 21h6v-6M21 9V3h-6M3 15v6h6" />
            </svg>
          </Boton>
        </>
      )}
    </>
  );
}

const ico = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.85,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-[18px] w-[18px]",
};

function Boton({ children, onClick, titulo, desactivado }) {
  return (
    <Pista texto={titulo} lado="bottom">
      <button
        type="button"
        onClick={onClick}
        disabled={desactivado}
        aria-label={titulo}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition",
          desactivado ? "cursor-not-allowed opacity-35" : "hover:bg-muted hover:text-foreground",
        )}
      >
        {children}
      </button>
    </Pista>
  );
}
