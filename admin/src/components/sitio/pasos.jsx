"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import Telefono, { PantallaRegistro, PantallaIdentidad, PantallaTarjeta, PantallaCuenta, PantallaSolicitud } from "./telefono";

const PASOS = [
  {
    titulo: "Crea tu cuenta",
    texto: "Tus datos básicos en dos minutos: nombre, documento, celular y correo.",
    Pantalla: PantallaRegistro,
  },
  {
    titulo: "Valida tu identidad",
    texto: "Foto de tu DNI por ambos lados y una selfie sosteniéndolo. Una persona de nuestro equipo la revisa.",
    Pantalla: PantallaIdentidad,
  },
  {
    titulo: "Registra tu tarjeta",
    texto: "Una foto donde solo se vean los últimos 4 dígitos y tu nombre. También aceptamos tarjetas de tiendas.",
    Pantalla: PantallaTarjeta,
  },
  {
    titulo: "Agrega tu cuenta",
    texto: "La cuenta de ahorros donde quieres recibir el dinero. Tiene que estar a tu nombre.",
    Pantalla: PantallaCuenta,
  },
  {
    titulo: "Envía y recibe",
    texto: "Sube el comprobante de tu operación, mira la comisión antes de enviar y recibe el depósito normalmente en 1 hora.",
    Pantalla: PantallaSolicitud,
  },
];

const DURACION = 5500;

/**
 * Los pasos para empezar, con la pantalla de la app que corresponde a
 * cada uno. Avanzan solos; si la persona toca uno, se queda ahí.
 */
export default function Pasos() {
  const [activo, setActivo] = useState(0);
  const [auto, setAuto] = useState(true);
  const caja = useRef(null);
  const [visible, setVisible] = useState(false);

  // Solo corre mientras la sección está a la vista.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !visible) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActivo((a) => (a + 1) % PASOS.length), DURACION);
    return () => clearTimeout(t);
  }, [activo, auto, visible]);

  const { Pantalla } = PASOS[activo];

  return (
    <div ref={caja} className="grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
      <ol className="space-y-2">
        {PASOS.map((p, i) => {
          const esActivo = i === activo;
          return (
            <li key={p.titulo}>
              <button
                onClick={() => {
                  setActivo(i);
                  setAuto(false);
                }}
                aria-current={esActivo ? "step" : undefined}
                className={cn(
                  "group relative w-full overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300",
                  esActivo ? "border-oro-500/60 bg-white/[0.07] shadow-[0_0_0_1px_rgba(232,184,0,0.25)]" : "border-white/10 hover:border-white/25 hover:bg-white/[0.04]",
                )}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-heading text-lg font-bold transition",
                      esActivo ? "bg-oro-500 text-marca-900" : "bg-white/10 text-white/70",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("font-heading text-lg font-semibold transition", esActivo ? "text-white" : "text-white/80")}>{p.titulo}</p>
                    <p
                      className={cn(
                        "grid text-md leading-relaxed text-white/65 transition-all duration-300",
                        esActivo ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <span className="overflow-hidden">{p.texto}</span>
                    </p>
                  </div>
                </div>
                {esActivo && auto && visible && (
                  <span
                    key={`barra-${activo}`}
                    className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-oro-500"
                    style={{ animation: `progreso ${DURACION}ms linear forwards` }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="relative mx-auto">
        <div className="absolute inset-0 -z-0 m-auto h-[420px] w-[420px] max-w-[90vw] rounded-full bg-[conic-gradient(from_200deg,#E8B800,#AF7F17,#0F1B33,#2F56B0,#E8B800)] opacity-40 blur-3xl" />
        <div className="relative">
          <Telefono>
            <div key={activo} className="h-full animate-[pantalla_450ms_cubic-bezier(0.22,1,0.36,1)]">
              <Pantalla />
            </div>
          </Telefono>
        </div>
      </div>
    </div>
  );
}
