"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { cn } from "@/lib/utils";
import Pista from "@/components/pista";
import { BotonAccion } from "@/components/carga";

/**
 * Piezas de interfaz que se repiten en todo el panel. Antes cada pantalla
 * dibujaba su propio buscador, sus pestañas y sus ventanas, y cada una
 * quedaba un poco distinta.
 */

/* ───────────────────────── Segmentos ─────────────────────────
   Pestañas de filtro con su cuenta. En pantallas angostas se desplazan
   de lado en vez de duplicarse en otro bloque para móvil. */
export function Segmentos({ opciones, valor, onCambio, className, tamano = "normal" }) {
  return (
    <div
      role="tablist"
      className={cn(
        "scroll-fino flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-1",
        className,
      )}
    >
      {opciones.map((o) => {
        const activo = valor === o.clave;
        const boton = (
          <button
            key={o.clave}
            role="tab"
            aria-selected={activo}
            onClick={() => onCambio(o.clave)}
            className={cn(
              "pulsable flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-semibold",
              tamano === "chico" ? "px-2.5 py-1 text-chico" : "px-3 py-1.5 text-sm",
              activo
                ? "bg-card text-foreground shadow-panel"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            {o.icono}
            {o.etiqueta}
            {o.cuenta != null && o.cuenta !== false && (
              <span
                className={cn(
                  "cifras min-w-[20px] rounded-full px-1.5 text-center text-xs font-bold",
                  activo
                    ? o.urgente && o.cuenta > 0
                      ? "bg-oro-500 text-marca-900"
                      : "bg-marca-700 text-white"
                    : o.urgente && o.cuenta > 0
                      ? "bg-oro-100 text-oro-700"
                      : "bg-card text-muted-foreground",
                )}
              >
                {o.cuenta > 999 ? "999+" : o.cuenta}
              </span>
            )}
          </button>
        );
        return o.pista ? (
          <Pista key={o.clave} texto={o.pista} lado="bottom">
            {boton}
          </Pista>
        ) : (
          boton
        );
      })}
    </div>
  );
}

/* ───────────────────────── Buscador ───────────────────────── */
export function Buscador({ valor, onCambio, placeholder, pendiente = false, className, autoFocus, id = "buscar" }) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id={id}
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="campo h-10 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {pendiente ? (
        <span className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-marca-200 border-t-marca-600" />
      ) : (
        valor && (
          <button
            type="button"
            onClick={() => onCambio("")}
            aria-label="Borrar búsqueda"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )
      )}
    </div>
  );
}

/* ───────────────────────── Barra ─────────────────────────
   Fila de herramientas sobre una lista: filtros a la izquierda,
   acciones a la derecha. */
export function Barra({ children, className }) {
  return <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/* ───────────────────────── Panel ───────────────────────── */
export function Panel({ titulo, ayuda, acciones, children, className, cuerpo = "p-4", icono, tono }) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-card shadow-panel",
        tono === "peligro" ? "border-red-200" : tono === "atencion" ? "border-oro-300" : "border-border",
        className,
      )}
    >
      {(titulo || acciones) && (
        <header className="flex min-h-[48px] items-center gap-2 border-b border-border px-4 py-2.5">
          {icono && <span className="text-muted-foreground">{icono}</span>}
          {titulo && <h2 className="t-seccion min-w-0 truncate">{titulo}</h2>}
          {ayuda && <Pista texto={ayuda} />}
          {acciones && <div className="ml-auto flex shrink-0 items-center gap-1.5">{acciones}</div>}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

/* ───────────────────────── Leyenda ─────────────────────────
   Qué significa cada color o marca. Cada elemento puede llevar su
   explicación al pasar el cursor. */
export function Leyenda({ items, className, titulo = "Leyenda" }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-chico text-muted-foreground", className)}>
      {titulo && <span className="t-etiqueta">{titulo}</span>}
      {items.map((it) => {
        const contenido = (
          <span className="inline-flex items-center gap-1.5">
            {it.marca || <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", it.color)} />}
            <span className="font-medium">{it.texto}</span>
          </span>
        );
        return it.pista ? (
          <Pista key={it.texto} texto={it.pista}>
            <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">
              {contenido}
            </span>
          </Pista>
        ) : (
          <span key={it.texto}>{contenido}</span>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Campo ─────────────────────────
   Etiqueta, control, ayuda y error en un solo lugar. El error se dice
   debajo del campo que lo tiene, no en un aviso general arriba. */
export function Campo({ etiqueta, htmlFor, ayuda, error, opcional, requerido, extra, children, className }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      {(etiqueta || extra) && (
        <div className="flex items-center gap-1.5">
          {etiqueta && (
            <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
              {etiqueta}
              {requerido && <span className="ml-0.5 text-red-600">*</span>}
            </label>
          )}
          {opcional && <span className="text-xs font-medium text-muted-foreground">(opcional)</span>}
          {ayuda && <Pista texto={ayuda} />}
          {extra && <span className="ml-auto text-xs text-muted-foreground">{extra}</span>}
        </div>
      )}
      {children}
      {error && <MensajeError>{error}</MensajeError>}
    </div>
  );
}

export function MensajeError({ children }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-chico font-medium text-red-700">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 h-3.5 w-3.5 shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/* ───────────────────────── Motivo ─────────────────────────
   Texto que el cliente va a leer (rechazo, observación, bloqueo). Tiene
   un mínimo, y el contador dice cuánto falta en vez de solo bloquear el
   botón sin explicar por qué. */
export function Motivo({
  id,
  etiqueta,
  ayuda,
  valor,
  onCambio,
  minimo = 10,
  maximo = 500,
  placeholder,
  filas = 3,
  autoFocus = true,
  sugerencias,
}) {
  const largo = valor.trim().length;
  const falta = Math.max(0, minimo - largo);
  return (
    <Campo
      etiqueta={etiqueta}
      htmlFor={id}
      ayuda={ayuda}
      extra={
        <span className={cn("cifras font-semibold", falta === 0 ? "text-emerald-700" : "text-muted-foreground")}>
          {falta > 0 ? `Faltan ${falta} caracteres` : `${largo}/${maximo}`}
        </span>
      }
    >
      {sugerencias?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sugerencias.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onCambio(s)}
              className="pulsable rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-marca-300 hover:text-foreground"
            >
              {s.length > 42 ? s.slice(0, 40) + "…" : s}
            </button>
          ))}
        </div>
      )}
      <textarea
        id={id}
        autoFocus={autoFocus}
        rows={filas}
        maxLength={maximo}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        className="campo"
      />
    </Campo>
  );
}

/* ───────────────────────── Diálogo ─────────────────────────
   Ventana modal accesible: atrapa el foco, se cierra con Escape y
   devuelve el foco al botón que la abrió. */
const TONOS_ICONO = {
  peligro: "bg-red-50 text-red-600",
  atencion: "bg-oro-100 text-oro-700",
  exito: "bg-emerald-50 text-emerald-700",
  info: "bg-marca-50 text-marca-600",
};

export function Dialogo({ abierto, onCerrar, titulo, descripcion, icono, tono = "info", ancho = "max-w-md", children, pie, bloqueado = false }) {
  return (
    <Dialog.Root open={abierto} onOpenChange={(v) => !v && !bloqueado && onCerrar?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-marca-950/55 backdrop-blur-[2px] animate-aparecer" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[61] flex max-h-[90dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-card shadow-flotante outline-none",
            ancho,
          )}
          onInteractOutside={(e) => bloqueado && e.preventDefault()}
          onEscapeKeyDown={(e) => bloqueado && e.preventDefault()}
        >
          <div className="flex items-start gap-3 px-5 pb-3 pt-5">
            {icono && (
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONOS_ICONO[tono])}>
                {icono}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-lg font-semibold leading-snug text-foreground">{titulo}</Dialog.Title>
              {descripcion ? (
                <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {descripcion}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
              )}
            </div>
            {!bloqueado && (
              <Dialog.Close
                aria-label="Cerrar"
                className="-mr-1 -mt-1 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </Dialog.Close>
            )}
          </div>
          {children && <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>}
          {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">{pie}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ───────────────────────── Confirmar ─────────────────────────
   Reemplaza a window.confirm: la ventana del navegador no explica nada,
   no se puede leer bien y en algunos navegadores se puede silenciar.

   const [confirmar, ventana] = useConfirmar();
   if (!(await confirmar({ titulo, texto, boton: "Bloquear", tono: "peligro" }))) return;
   ... y en el JSX: {ventana}
*/
export function useConfirmar() {
  const [pedido, setPedido] = useState(null);
  const resolver = useRef(null);

  const confirmar = useCallback(
    (opciones) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setPedido(opciones);
      }),
    [],
  );

  const responder = (si) => {
    resolver.current?.(si);
    resolver.current = null;
    setPedido(null);
  };

  const tono = pedido?.tono || "info";
  const ventana = (
    <Dialogo
      abierto={Boolean(pedido)}
      onCerrar={() => responder(false)}
      titulo={pedido?.titulo}
      descripcion={pedido?.texto}
      tono={tono}
      icono={pedido?.icono || (tono === "peligro" ? <IconoAlerta /> : tono === "atencion" ? <IconoAlerta /> : <IconoPregunta />)}
      pie={
        <>
          <BotonAccion tono="neutro" onClick={() => responder(false)}>
            {pedido?.cancelar || "Cancelar"}
          </BotonAccion>
          <BotonAccion tono={tono === "peligro" ? "peligro" : tono === "exito" ? "exito" : "primario"} onClick={() => responder(true)} autoFocus>
            {pedido?.boton || "Confirmar"}
          </BotonAccion>
        </>
      }
    >
      {pedido?.detalle}
    </Dialogo>
  );

  return [confirmar, ventana];
}

/* ───────────────────────── Tostada ─────────────────────────
   Confirmación breve abajo a la derecha que se va sola. Antes los
   "listo" eran bandas azules que empujaban la lista hacia abajo y se
   quedaban puestas hasta cerrarlas a mano. */
export function Tostada({ mensaje, onCerrar, tono = "exito", ms = 6000 }) {
  // La función llega nueva en cada pintado; si fuera dependencia, el
  // reloj se reiniciaría cada vez y el aviso no se iría nunca.
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => cerrar.current?.(), ms);
    return () => clearTimeout(t);
  }, [mensaje, ms]);

  if (!mensaje) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex justify-center sm:inset-x-auto sm:right-5 sm:justify-end">
      <div
        role="status"
        className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl bg-marca-900 px-4 py-3 text-sm text-white shadow-flotante"
        style={{ animation: "tostada 220ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            tono === "exito" ? "bg-emerald-500" : tono === "atencion" ? "bg-oro-500 text-marca-900" : "bg-marca-500",
          )}
        >
          {tono === "exito" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <span className="text-xs font-bold">i</span>
          )}
        </span>
        <p className="min-w-0 flex-1 leading-snug">{mensaje}</p>
        <button onClick={onCerrar} aria-label="Cerrar aviso" className="-mr-1 shrink-0 rounded p-0.5 text-white/60 hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Copiar ───────────────────────── */
export function Copiar({ texto, etiqueta = "Copiar", className, soloIcono = false }) {
  const [hecho, setHecho] = useState(false);
  if (!texto) return null;
  const boton = (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(String(texto).replace(/\s/g, ""));
          setHecho(true);
          setTimeout(() => setHecho(false), 1400);
        } catch {}
      }}
      aria-label={`${etiqueta}: ${texto}`}
      className={cn(
        "pulsable inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold",
        hecho ? "bg-emerald-50 text-emerald-700" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {hecho ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
      {!soloIcono && (hecho ? "Copiado" : etiqueta)}
    </button>
  );
  return soloIcono ? <Pista texto={hecho ? "Copiado" : etiqueta}>{boton}</Pista> : boton;
}

/* ───────────────────────── Avatar ───────────────────────── */
export function Avatar({ texto, className, tono = "marca" }) {
  const iniciales = (texto || "?")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-chico font-bold",
        tono === "oro" ? "bg-oro-500 text-marca-900" : tono === "gris" ? "bg-muted text-muted-foreground" : "bg-marca-100 text-marca-700",
        className,
      )}
    >
      {iniciales || "?"}
    </span>
  );
}

/* ───────────────────────── Lista de comprobación ─────────────────────────
   Lo que el revisor tiene que mirar antes de aprobar. Marcarlo deja
   constancia de que lo miró, y el botón de aprobar espera a que esté
   todo marcado. */
export function Comprobacion({ items, marcados, onCambio, titulo = "Antes de aprobar, comprueba", ayuda }) {
  const listos = items.filter((it) => marcados[it.clave]).length;
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <p className="t-seccion">{titulo}</p>
        {ayuda && <Pista texto={ayuda} />}
        <span
          className={cn(
            "cifras ml-auto rounded-full px-2 py-0.5 text-xs font-bold",
            listos === items.length ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
          )}
        >
          {listos}/{items.length}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li key={it.clave}>
            <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
              <input
                type="checkbox"
                checked={Boolean(marcados[it.clave])}
                onChange={(e) => onCambio({ ...marcados, [it.clave]: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="text-sm leading-snug text-foreground">{it.texto}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── Íconos de las ventanas ───────────────────────── */
export function IconoAlerta(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" {...p}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function IconoPregunta(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  );
}

export function IconoCheck(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" {...p}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
