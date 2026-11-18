import { cn } from "@/lib/utils";

/**
 * La línea discreta que recuerda los atajos de teclado de una pantalla:
 * [["A", "aprobar"], ["R", "rechazar"]]. Solo en pantallas con teclado
 * (en el teléfono no sirven y se esconde).
 */
export default function Atajos({ items, className }) {
  const visibles = items.filter(Boolean);
  if (!visibles.length) return null;
  return (
    <p className={cn("hidden flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground md:flex", className)}>
      <span className="font-semibold">Teclado:</span>
      {visibles.map(([tecla, texto]) => (
        <span key={tecla} className="inline-flex items-center gap-1">
          <kbd className="rounded border border-border bg-card px-1.5 py-px font-mono text-[10px] font-bold text-foreground shadow-sm">{tecla}</kbd>
          {texto}
        </span>
      ))}
    </p>
  );
}
