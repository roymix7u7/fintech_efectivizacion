"use client";

import { cn } from "@/lib/utils";
import { Rueda } from "@/components/carga";
import Pista from "@/components/pista";

/**
 * Paginación para el historial.
 *
 * El historial crece para siempre: con treinta mil clientes, traer
 * todas las solicitudes aprobadas colgaría el navegador. Aquí se pide
 * una página a la vez y el conteo total se calcula en el servidor.
 */
export default function Paginador({ pagina, porPagina, total, cargando, onCambio }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : pagina * porPagina + 1;
  const hasta = Math.min((pagina + 1) * porPagina, total);

  if (total === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {cargando && <Rueda className="h-3.5 w-3.5" />}
        <span>
          <span className="cifras font-bold text-foreground">{desde}</span>–<span className="cifras font-bold text-foreground">{hasta}</span> de{" "}
          <span className="cifras font-bold text-foreground">{total}</span>
        </span>
      </p>

      {paginas > 1 && (
        <div className="flex items-center gap-1">
          <Boton onClick={() => onCambio(0)} desactivado={pagina === 0 || cargando} titulo="Primera página">
            <path d="M11 17 6 12l5-5M18 17l-5-5 5-5" />
          </Boton>
          <Boton onClick={() => onCambio(pagina - 1)} desactivado={pagina === 0 || cargando} titulo="Página anterior">
            <path d="m15 18-6-6 6-6" />
          </Boton>
          <span className="cifras min-w-[64px] px-2 text-center text-sm font-bold text-muted-foreground">
            {pagina + 1} / {paginas}
          </span>
          <Boton onClick={() => onCambio(pagina + 1)} desactivado={pagina + 1 >= paginas || cargando} titulo="Página siguiente">
            <path d="m9 18 6-6-6-6" />
          </Boton>
          <Boton onClick={() => onCambio(paginas - 1)} desactivado={pagina + 1 >= paginas || cargando} titulo="Última página">
            <path d="m13 17 5-5-5-5M6 17l5-5-5-5" />
          </Boton>
        </div>
      )}
    </div>
  );
}

function Boton({ children, onClick, desactivado, titulo }) {
  return (
    <Pista texto={titulo} lado="top">
      <button
        type="button"
        onClick={onClick}
        disabled={desactivado}
        aria-label={titulo}
        className={cn(
          "pulsable flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card",
          desactivado ? "cursor-not-allowed text-muted-foreground opacity-35" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          {children}
        </svg>
      </button>
    </Pista>
  );
}
