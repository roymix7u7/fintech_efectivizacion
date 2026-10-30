"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LOCALES, enlaceMapa } from "./datos";

/**
 * Mapa de los locales con un pin en 3D.
 *
 * No es un mapa a escala: es un plano inclinado de Lima con un punto por
 * local, ubicados de norte (al fondo) a sur (adelante). El pin salta al
 * local elegido, flota y se inclina hacia el puntero. Recorre los locales
 * solo mientras nadie está eligiendo uno. Cada local abre Google Maps.
 */

// Posición de cada local en el plano, en % del panel. El fondo es el norte:
// lo lejano se ve más chico.
const PUNTOS = {
  "Los Olivos": { x: 26, y: 60, escala: 0.82 },
  Lince: { x: 52, y: 73, escala: 0.92 },
  "San Juan de Miraflores": { x: 72, y: 88, escala: 1 },
};

const RITMO = 4200;

export default function MapaLocales() {
  const [activo, setActivo] = useState(0);
  const [eligiendo, setEligiendo] = useState(false);
  const escena = useRef(null);

  // Recorre los locales solo, si la persona no pidió menos movimiento.
  useEffect(() => {
    if (eligiendo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(
      () => setActivo((a) => (a + 1) % LOCALES.length),
      RITMO,
    );
    return () => clearInterval(t);
  }, [eligiendo]);

  // El pin se inclina hacia el puntero.
  useEffect(() => {
    const el = escena.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let marco = 0;
    const mover = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(marco);
      marco = requestAnimationFrame(() => {
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };
    const salir = () => {
      cancelAnimationFrame(marco);
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerleave", salir);
    return () => {
      cancelAnimationFrame(marco);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerleave", salir);
    };
  }, []);

  const local = LOCALES[activo];
  const punto = PUNTOS[local.distrito] || { x: 50, y: 75, escala: 1 };

  return (
    <div
      onPointerEnter={() => setEligiendo(true)}
      onPointerLeave={() => setEligiendo(false)}
      onFocus={() => setEligiendo(true)}
      onBlur={() => setEligiendo(false)}
    >
      <div
        ref={escena}
        className="mapa-3d relative h-[300px] overflow-hidden rounded-3xl bg-[#0B1426] sm:h-[380px]"
      >
        {/* Plano de la ciudad, inclinado hacia el fondo */}
        <div aria-hidden className="mapa-3d__plano" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#0B1426] to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[55%] h-[420px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.16),transparent)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-5 top-5 font-heading text-xs uppercase tracking-[0.3em] text-white/35"
        >
          Lima
        </span>

        {/* Un punto por local; también sirven para elegir */}
        {LOCALES.map((l, i) => {
          const p = PUNTOS[l.distrito];
          if (!p) return null;
          const es = i === activo;
          return (
            <button
              key={l.distrito}
              type="button"
              onClick={() => setActivo(i)}
              className="group absolute -translate-x-1/2 -translate-y-1/2 p-3"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              aria-label={`Ver local de ${l.distrito}`}
              aria-pressed={es}
            >
              <span className="relative block">
                {es && (
                  <>
                    <span className="mapa-3d__onda" />
                    <span
                      className="mapa-3d__onda"
                      style={{ animationDelay: "0.9s" }}
                    />
                  </>
                )}
                <span
                  className={`block h-3 w-7 rounded-[50%] transition duration-500 ${
                    es
                      ? "bg-oro-500 shadow-[0_0_18px_4px_rgba(232,184,0,0.55)]"
                      : "bg-white/30 group-hover:bg-oro-300"
                  }`}
                />
              </span>
              <span
                className={`absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold transition duration-500 ${
                  es ? "text-oro-300" : "text-white/45"
                }`}
              >
                {l.distrito}
              </span>
            </button>
          );
        })}

        {/* Sombra del pin en el suelo */}
        <span
          aria-hidden
          className="mapa-3d__mover pointer-events-none absolute"
          style={{ left: `${punto.x}%`, top: `${punto.y}%` }}
        >
          <span
            className="mapa-3d__sombra block"
            style={{ "--escala": punto.escala }}
          />
        </span>

        {/* El pin: se desplaza al local, salta, flota y se inclina */}
        <span
          aria-hidden
          className="mapa-3d__mover pointer-events-none absolute z-10"
          style={{ left: `${punto.x}%`, top: `${punto.y}%` }}
        >
          <span
            className="mapa-3d__escala block"
            style={{ "--escala": punto.escala }}
          >
            <span key={activo} className="mapa-3d__salto block">
              <span className="mapa-3d__flota block">
                <span className="mapa-3d__giro block">
                  <Image
                    src="/sitio/pin.webp"
                    alt=""
                    width={488}
                    height={720}
                    draggable={false}
                    className="h-auto w-[104px] select-none sm:w-[132px]"
                  />
                </span>
              </span>
            </span>
          </span>
        </span>

        {/* Local que se está viendo (en celular lo dice la lista) */}
        <div
          key={local.distrito}
          className="mapa-3d__ficha absolute right-5 top-5 hidden rounded-2xl bg-white/[0.08] px-4 py-3 text-right ring-1 ring-white/15 backdrop-blur-md sm:block"
          aria-live="polite"
        >
          <p className="font-heading text-lg font-normal text-white">
            {local.distrito}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-sm text-white/60">
            {local.direccion}
          </p>
        </div>
      </div>

      {/* Lista: al pasar por un local, el pin va hacia él */}
      <ul className="mt-4 space-y-3">
        {LOCALES.map((l, i) => {
          const es = i === activo;
          return (
            <li key={l.distrito}>
              <a
                href={enlaceMapa(l)}
                target="_blank"
                rel="noopener"
                onPointerEnter={() => setActivo(i)}
                onFocus={() => setActivo(i)}
                className={`group flex items-center gap-4 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,27,51,0.04),0_20px_40px_-24px_rgba(15,27,51,0.2)] ring-2 transition duration-300 hover:-translate-y-0.5 ${
                  es ? "ring-oro-500" : "ring-transparent"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition duration-300 ${
                    es ? "bg-oro-500 text-marca-900" : "bg-oro-100 text-oro-700"
                  }`}
                >
                  <Pin />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-lg font-normal">
                    {l.distrito}
                  </span>
                  <span className="block text-[#4F5B74]">{l.direccion}</span>
                  <span className="block text-sm text-[#8A93A6]">
                    {l.referencia}
                  </span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-[#8A93A6] transition group-hover:text-marca-900 sm:inline-flex">
                  Ver mapa
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 transition group-hover:translate-x-0.5"
                    aria-hidden
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Pin() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
