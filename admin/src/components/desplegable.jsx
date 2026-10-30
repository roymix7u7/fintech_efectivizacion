"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Desplegable con estilo propio, en lugar del <select> nativo: la lista
 * que abre un <select> la dibuja el navegador y no se puede estilizar.
 *
 * opciones: textos, o { valor, texto, detalle }.
 * Con más de 8 opciones (o buscar={true}) trae un buscador que ignora
 * tildes, útil para los distritos. Se maneja con el teclado (flechas,
 * Inicio, Fin, Enter, Escape) y, sin buscador, salta a la opción que
 * empieza con la letra que se escribe.
 *
 * Va sobre el Popover de Radix: se ubica solo, se voltea hacia arriba si
 * no hay espacio y funciona dentro de los diálogos del panel.
 *
 * variante: "cliente" (área de clientes, alto 48 px) o "panel" (usa la
 * clase .campo del panel). claseBoton reemplaza el estilo del botón.
 */
const normalizar = (t) =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function Desplegable({
  id,
  name,
  valor,
  opciones,
  onCambio,
  placeholder = "Elige...",
  deshabilitado = false,
  error = false,
  ok = false,
  buscar,
  variante = "cliente",
  claseBoton,
  className,
  title,
  "aria-label": ariaLabel,
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [activo, setActivo] = useState(0);
  const lista = useRef(null);
  const busqueda = useRef(null);
  const base = useId();

  const items = useMemo(
    () =>
      opciones.map((o) =>
        typeof o === "object"
          ? { valor: String(o.valor), texto: o.texto, detalle: o.detalle }
          : { valor: String(o), texto: String(o) },
      ),
    [opciones],
  );
  const conBuscador = buscar ?? items.length > 8;
  const conDetalle = items.some((o) => o.detalle);
  const visibles = useMemo(() => {
    const f = normalizar(filtro.trim());
    if (!f) return items;
    return items.filter((o) => normalizar(o.texto).includes(f));
  }, [items, filtro]);
  const elegido = items.find((o) => o.valor === String(valor ?? ""));

  // Al abrir: sin filtro y con la opción elegida resaltada.
  useEffect(() => {
    if (!abierto) return;
    setFiltro("");
    const i = items.findIndex((o) => o.valor === String(valor ?? ""));
    setActivo(i >= 0 ? i : 0);
  }, [abierto, items, valor]);

  // La opción resaltada siempre a la vista.
  useEffect(() => {
    if (!abierto) return;
    lista.current
      ?.querySelector(`[data-indice="${activo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activo, abierto, visibles]);

  function elegir(o) {
    onCambio(o.valor);
    setAbierto(false);
  }

  function teclas(e) {
    const ultimo = visibles.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((a) => Math.min(ultimo, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActivo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActivo(ultimo);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visibles[activo]) elegir(visibles[activo]);
    } else if (
      !conBuscador &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      const letra = normalizar(e.key);
      const i = visibles.findIndex(
        (o, k) => k > activo && normalizar(o.texto).startsWith(letra),
      );
      const j =
        i >= 0
          ? i
          : visibles.findIndex((o) => normalizar(o.texto).startsWith(letra));
      if (j >= 0) setActivo(j);
    }
  }

  const idLista = `${base}-lista`;
  const idOpcion = (i) => `${base}-op-${i}`;

  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      {name && <input type="hidden" name={name} value={valor ?? ""} />}
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          title={title}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-controls={abierto ? idLista : undefined}
          aria-invalid={error || undefined}
          disabled={deshabilitado}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setAbierto(true);
            }
          }}
          className={cn(
            "group flex w-full min-w-0 items-center justify-between gap-2 text-left",
            claseBoton ??
              (variante === "panel"
                ? "campo"
                : cn(
                    "h-12 rounded-xl border bg-white px-3.5 text-md outline-none transition focus-visible:ring-4 disabled:cursor-not-allowed disabled:bg-[#F6F8FC] disabled:text-[#AFBCD0]",
                    error
                      ? "border-red-400 focus-visible:ring-red-500/10"
                      : ok || (elegido && !deshabilitado)
                        ? "border-emerald-500 focus-visible:ring-emerald-500/10"
                        : "border-[#DCE3EE] hover:border-[#AFBCD0] focus-visible:border-marca-600 focus-visible:ring-marca-600/10",
                    abierto && !error && "border-marca-600 ring-4 ring-marca-600/10",
                  )),
            className,
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !elegido && "text-[#8A93A6]",
            )}
          >
            {elegido ? elegido.texto : placeholder}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "h-4 w-4 shrink-0 text-[#8A93A6] transition-transform duration-200",
              abierto && "rotate-180 text-marca-700",
            )}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            // Con buscador, el foco va al buscador; si no, a la lista.
            e.preventDefault();
            (busqueda.current || lista.current)?.focus();
          }}
          onKeyDown={teclas}
          className={cn(
            "desplegable z-[90] flex w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden rounded-xl bg-white text-marca-900 shadow-[0_20px_50px_-12px_rgba(15,27,51,0.35)] ring-1 ring-[#DCE3EE] outline-none",
            conDetalle ? "min-w-[17rem]" : "min-w-[12rem]",
          )}
          style={{
            maxHeight:
              "min(20rem, var(--radix-popover-content-available-height))",
          }}
        >
          {conBuscador && (
            <div className="border-b border-[#EEF2F7] p-2">
              <div className="flex items-center gap-2 rounded-lg bg-[#F4F7FB] px-3 ring-1 ring-transparent focus-within:bg-white focus-within:ring-marca-600/30">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="h-4 w-4 shrink-0 text-[#8A93A6]"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  ref={busqueda}
                  value={filtro}
                  onChange={(e) => {
                    setFiltro(e.target.value);
                    setActivo(0);
                  }}
                  placeholder="Buscar..."
                  aria-label="Buscar opción"
                  aria-controls={idLista}
                  aria-activedescendant={
                    visibles[activo] ? idOpcion(activo) : undefined
                  }
                  className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[#8A93A6]"
                />
              </div>
            </div>
          )}
          <ul
            ref={lista}
            id={idLista}
            role="listbox"
            tabIndex={conBuscador ? -1 : 0}
            aria-activedescendant={
              !conBuscador && visibles[activo] ? idOpcion(activo) : undefined
            }
            className="scroll-fino min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 outline-none"
          >
            {visibles.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-[#8A93A6]">
                Sin resultados para «{filtro.trim()}».
              </li>
            )}
            {visibles.map((o, i) => {
              const sel = o.valor === String(valor ?? "");
              return (
                <li
                  key={o.valor}
                  id={idOpcion(i)}
                  data-indice={i}
                  role="option"
                  aria-selected={sel}
                  onMouseMove={() => i !== activo && setActivo(i)}
                  onClick={() => elegir(o)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    i === activo ? "bg-[#EFF3F9]" : "bg-transparent",
                    sel && "font-semibold",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block">{o.texto}</span>
                    {o.detalle && (
                      <span className="block text-xs font-normal text-[#8A93A6]">
                        {o.detalle}
                      </span>
                    )}
                  </span>
                  {sel && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 shrink-0 text-oro-600"
                      aria-hidden
                    >
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
