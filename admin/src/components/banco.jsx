import { colorBanco, nombreBanco } from "@/lib/bancos";
import { cn } from "@/lib/utils";
import { Copiar } from "@/components/piezas";

/**
 * El banco en su color (los mismos de la app: lib/bancos.js), para que
 * una tarjeta o una cuenta se reconozca de un vistazo.
 */

/** Cuadro con la sigla del banco. */
export function SiglaBanco({ banco, className }) {
  const c = colorBanco(banco);
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold tracking-wide shadow-sm",
        className,
      )}
      style={{ backgroundColor: c.fondo, color: c.texto }}
      title={nombreBanco(banco)}
    >
      {c.sigla}
    </span>
  );
}

/** El banco como etiqueta chica. */
export function ChipBanco({ banco, className }) {
  const c = colorBanco(banco);
  return (
    <span className={cn("rounded px-1.5 py-px text-[11px] font-extrabold", className)} style={{ backgroundColor: c.fondo, color: c.texto }}>
      {c.sigla}
    </span>
  );
}

/**
 * Etiqueta y valor en poco espacio, con botón de copiar opcional.
 * completo: el texto baja de línea en vez de cortarse con "…".
 * chico: el valor en tamaño de texto normal.
 */
export function DatoCorto({ etiqueta, children, mono = false, copiar, className, completo = false, chico = false }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-semibold text-muted-foreground">{etiqueta}</dt>
      <dd
        className={cn(
          "mt-0.5 flex min-w-0 gap-1 font-semibold text-foreground",
          completo ? "items-start text-sm leading-snug" : cn("items-center", chico ? "text-sm" : "text-md"),
          mono && "cifras font-mono",
        )}
      >
        <span className={cn("min-w-0", completo ? "break-words" : "truncate")}>
          {children || <span className="font-normal text-muted-foreground">—</span>}
        </span>
        {copiar && <Copiar texto={copiar} soloIcono etiqueta={`Copiar ${etiqueta.toLowerCase()}`} />}
      </dd>
    </div>
  );
}
