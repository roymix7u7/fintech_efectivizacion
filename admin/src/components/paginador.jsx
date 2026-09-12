"use client";

import { cn } from "@/lib/utils";
import { Rueda } from "@/components/carga";

/**
 * Paginación para el historial.
 *
 * El historial crece para siempre: con treinta mil clientes, traer
 * todas las solicitudes aprobadas colgaría el navegador. Aquí se pide
 * una página a la vez y el conteo total se calcula en el servidor.
 */
export default function Paginador({
  pagina,
  porPagina,
  total,
  cargando,
  onCambio,
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : pagina * porPagina + 1;
  const hasta = Math.min((pagina + 1) * porPagina, total);

  if (total === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="t-micro flex items-center gap-2">
        {cargando && <Rueda className="h-3 w-3" />}
        <span>
          <span className="cifras font-semibold text-foreground">{desde}</span>
          {" a "}
          <span className="cifras font-semibold text-foreground">{hasta}</span>
          {" de "}
          <span className="cifras font-semibold text-foreground">{total}</span>
        </span>
      </p>

      <div className="flex items-center gap-1">
        <Boton
          onClick={() => onCambio(0)}
          desactivado={pagina === 0 || cargando}
          titulo="Primera página"
        >
          <svg {...ico}>
            <path d="M11 17 6 12l5-5M18 17l-5-5 5-5" />
          </svg>
        </Boton>
        <Boton
          onClick={() => onCambio(pagina - 1)}
          desactivado={pagina === 0 || cargando}
          titulo="Anterior"
        >
          <svg {...ico}>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Boton>

        <span className="cifras px-3 text-[0.8rem] font-medium text-muted-foreground">
          {pagina + 1} / {paginas}
        </span>

        <Boton
          onClick={() => onCambio(pagina + 1)}
          desactivado={pagina + 1 >= paginas || cargando}
          titulo="Siguiente"
        >
          <svg {...ico}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Boton>
        <Boton
          onClick={() => onCambio(paginas - 1)}
          desactivado={pagina + 1 >= paginas || cargando}
          titulo="Última página"
        >
          <svg {...ico}>
            <path d="m13 17 5-5-5-5M6 17l5-5-5-5" />
          </svg>
        </Boton>
      </div>
    </div>
  );
}

const ico = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-4 w-4",
};

function Boton({ children, onClick, desactivado, titulo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactivado}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "pulsable rounded-md border border-border p-1.5",
        desactivado
          ? "cursor-not-allowed text-muted-foreground opacity-35"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
