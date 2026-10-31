"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";

/**
 * Ver una imagen en grande sin salir de la página, con zoom: rueda del
 * mouse, doble clic, botones + y −, y pellizco con dos dedos en el
 * celular. Con zoom se arrastra para moverla. Escape cierra.
 *
 * Es una ventana de Radix y no un portal suelto: así funciona también
 * encima de otra ventana del panel (la ficha de un cliente), que bloquea
 * los clics a todo lo que se abra fuera de ella.
 */
const MIN = 1;
const MAX = 5;
const limitar = (v) => Math.min(MAX, Math.max(MIN, v));

export default function VisorImagen({ src, alt = "", abierto, onCerrar }) {
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const punteros = useRef(new Map());
  const pellizco = useRef(null);
  const arrastre = useRef(null);
  const quitarRueda = useRef(null);

  // Cada vez que se abre, empieza sin zoom.
  useEffect(() => {
    if (!abierto) return;
    setEscala(1);
    setPos({ x: 0, y: 0 });
  }, [abierto]);

  function zoom(paso) {
    setEscala((s) => {
      const nueva = limitar(s + paso);
      if (nueva === 1) setPos({ x: 0, y: 0 });
      return nueva;
    });
  }

  // La rueda necesita un listener no pasivo para poder frenar el scroll.
  // Va en una ref de callback: el lienzo aparece recién cuando la ventana
  // termina de montarse.
  const lienzo = useCallback((el) => {
    quitarRueda.current?.();
    quitarRueda.current = null;
    if (!el) return;
    const rueda = (e) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 0.25 : -0.25);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    quitarRueda.current = () => el.removeEventListener("wheel", rueda);
  }, []);

  function abajo(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      pellizco.current = {
        distancia: Math.hypot(a.x - b.x, a.y - b.y),
        escala,
      };
      arrastre.current = null;
    } else {
      arrastre.current = { x: e.clientX, y: e.clientY, pos };
    }
  }

  function mover(e) {
    if (!punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2 && pellizco.current) {
      const [a, b] = [...punteros.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const nueva = limitar(
        (pellizco.current.escala * d) / pellizco.current.distancia,
      );
      setEscala(nueva);
      if (nueva === 1) setPos({ x: 0, y: 0 });
    } else if (arrastre.current && escala > 1) {
      setPos({
        x: arrastre.current.pos.x + (e.clientX - arrastre.current.x),
        y: arrastre.current.pos.y + (e.clientY - arrastre.current.y),
      });
    }
  }

  function arriba(e) {
    punteros.current.delete(e.pointerId);
    if (punteros.current.size < 2) pellizco.current = null;
    if (punteros.current.size === 0) arrastre.current = null;
  }

  const Boton = ({ onClick, etiqueta, children, deshabilitado }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      title={etiqueta}
      className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:opacity-30"
    >
      {children}
    </button>
  );
  const Trazo = ({ d }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {[].concat(d).map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );

  return (
    <Dialog.Root open={Boolean(abierto)} onOpenChange={(v) => !v && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[85] bg-[#05080F]/95 animate-aparecer" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === "+" || e.key === "=") zoom(0.5);
            if (e.key === "-") zoom(-0.5);
          }}
          className="fixed inset-0 z-[86] flex flex-col outline-none"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-5">
            <Dialog.Title className="min-w-0 truncate text-sm font-normal text-white/70">
              {alt || "Imagen ampliada"}
            </Dialog.Title>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-1 ring-1 ring-white/15">
              <Boton
                etiqueta="Alejar"
                onClick={() => zoom(-0.5)}
                deshabilitado={escala <= MIN}
              >
                <Trazo d="M5 12h14" />
              </Boton>
              <span className="cifras w-12 text-center text-sm font-semibold text-white">
                {Math.round(escala * 100)}%
              </span>
              <Boton
                etiqueta="Acercar"
                onClick={() => zoom(0.5)}
                deshabilitado={escala >= MAX}
              >
                <Trazo d="M12 5v14M5 12h14" />
              </Boton>
              <Boton
                etiqueta="Tamaño original"
                onClick={() => {
                  setEscala(1);
                  setPos({ x: 0, y: 0 });
                }}
                deshabilitado={escala === 1}
              >
                <Trazo d={["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"]} />
              </Boton>
            </div>
            <Boton etiqueta="Cerrar" onClick={onCerrar}>
              <Trazo d="M18 6 6 18M6 6l12 12" />
            </Boton>
          </div>

          <div
            ref={lienzo}
            onPointerDown={abajo}
            onPointerMove={mover}
            onPointerUp={arriba}
            onPointerCancel={arriba}
            onDoubleClick={() => {
              if (escala > 1) {
                setEscala(1);
                setPos({ x: 0, y: 0 });
              } else setEscala(2.5);
            }}
            onClick={(e) => {
              // Un clic en el fondo, sin zoom, cierra.
              if (e.target === e.currentTarget && escala === 1) onCerrar();
            }}
            className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden p-4"
            style={{ cursor: escala > 1 ? "grab" : "zoom-in" }}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt}
                draggable={false}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
                  transition:
                    arrastre.current || pellizco.current
                      ? "none"
                      : "transform 200ms ease-out",
                }}
              />
            ) : (
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            )}
          </div>
          <p className="pb-3 text-center text-chico text-white/50">
            Usa la rueda, doble clic o pellizca para hacer zoom. Arrastra para
            moverte.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
