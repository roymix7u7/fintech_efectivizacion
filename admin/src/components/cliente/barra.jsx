"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { WHATSAPP } from "@/components/sitio/datos";

/**
 * Navegación de Mi cuenta: barra lateral en la computadora y barra
 * inferior en el celular (como una app). La usan Mi cuenta y las
 * pantallas para operar (nueva solicitud, agregar tarjeta o cuenta).
 *
 * Dentro de Mi cuenta, las vistas cambian sin recargar (`onIr`); desde
 * las otras pantallas, los enlaces llevan a /cuenta#vista.
 */
const Icono = ({ d, className = "h-5 w-5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {[].concat(d).map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);
const I = {
  inicio: ["M3 11 12 4l9 7", "M5 10v10h14V10"],
  solicitudes: ["M7 3h8l4 4v14H7z", "M15 3v4h4", "M10 12h6M10 16h6"],
  tarjetas: ["M3 6h18v12H3z", "M3 10h18", "M7 15h4"],
  perfil: [
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5",
  ],
  mas: "M12 5v14M5 12h14",
  cuenta: ["M3 10 12 4l9 6", "M5 10v8M9 10v8M15 10v8M19 10v8", "M3 20h18"],
  ayuda: [
    "M21 12a9 9 0 1 1-4-7.5L21 3l-.5 4.5A9 9 0 0 1 21 12z",
    "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5",
    "M12 17h.01",
  ],
  legal: ["M6 3h9l3 3v15H6z", "M9 9h6M9 13h6M9 17h3"],
  noticias: [
    "M4 10v4h3l6 4V6l-6 4z",
    "M17 9a4 4 0 0 1 0 6",
    "M19.5 6.5a8 8 0 0 1 0 11",
  ],
};

export const VISTAS = [
  { k: "resumen", t: "Resumen", corto: "Inicio", icono: I.inicio },
  { k: "solicitudes", t: "Solicitudes", icono: I.solicitudes },
  {
    k: "bancos",
    t: "Tarjetas y cuentas",
    corto: "Tarjetas",
    icono: I.tarjetas,
  },
  { k: "noticias", t: "Noticias", icono: I.noticias },
  { k: "perfil", t: "Mi perfil", corto: "Perfil", icono: I.perfil },
];
const vista = (k) => VISTAS.find((v) => v.k === k);

const ACCIONES = [
  {
    k: "nueva",
    t: "Nueva solicitud",
    href: "/cuenta/solicitud-nueva",
    icono: I.mas,
    principal: true,
  },
  {
    k: "tarjeta",
    t: "Agregar tarjeta",
    href: "/cuenta/tarjeta-nueva",
    icono: I.tarjetas,
  },
  {
    k: "cuenta",
    t: "Agregar cuenta",
    href: "/cuenta/cuenta-nueva",
    icono: I.cuenta,
  },
];

/** Un enlace a una vista: botón dentro de Mi cuenta, enlace desde fuera. */
function Destino({ vista, onIr, className, children, ...resto }) {
  if (onIr)
    return (
      <button
        type="button"
        onClick={() => onIr(vista)}
        className={className}
        {...resto}
      >
        {children}
      </button>
    );
  return (
    <Link href={`/cuenta#${vista}`} className={className} {...resto}>
      {children}
    </Link>
  );
}

export default function MarcoCuenta({
  activa,
  onIr,
  enCurso = 0,
  noticiasNuevas = 0,
  children,
}) {
  return (
    <div className="flex w-full">
      {/* ── Barra lateral (computadora) ── */}
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] scroll-noche w-[260px] shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-[#0B1426] px-3 pb-4 pt-3 text-white lg:flex">
        <nav aria-label="Mi cuenta" className="space-y-1">
          <p className="px-3 pb-1 pt-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-white/40">
            Mi cuenta
          </p>
          {VISTAS.map((v) => {
            const on = activa === v.k;
            return (
              <Destino
                key={v.k}
                vista={v.k}
                onIr={onIr}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition",
                  on
                    ? "bg-white/10 text-white"
                    : "text-white/65 hover:bg-white/5 hover:text-white",
                )}
              >
                {on && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-oro-500"
                    aria-hidden
                  />
                )}
                <Icono
                  d={v.icono}
                  className={cn("h-5 w-5", on ? "text-oro-500" : "")}
                />
                <span className="flex-1">{v.t}</span>
                {v.k === "noticias" && noticiasNuevas > 0 && (
                  <span className="rounded-full bg-[#3B6FD8] px-2 py-0.5 text-[0.65rem] font-bold uppercase text-white">
                    {noticiasNuevas} nueva{noticiasNuevas === 1 ? "" : "s"}
                  </span>
                )}
                {v.k === "solicitudes" && enCurso > 0 && (
                  <span className="cifras rounded-full bg-oro-500 px-2 py-0.5 text-[0.7rem] font-bold text-marca-900">
                    {enCurso}
                  </span>
                )}
              </Destino>
            );
          })}

          <p className="px-3 pb-1 pt-5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-white/40">
            Operar
          </p>
          {ACCIONES.map((a) => {
            const on = activa === a.k;
            return (
              <Link
                key={a.k}
                href={a.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  a.principal
                    ? on
                      ? "bg-oro-300 text-marca-900"
                      : "bg-oro-500 text-marca-900 hover:bg-oro-300"
                    : on
                      ? "bg-white/10 text-white"
                      : "text-white/65 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icono d={a.icono} />
                {a.t}
              </Link>
            );
          })}

          <p className="px-3 pb-1 pt-5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-white/40">
            Ayuda
          </p>
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/65 transition hover:bg-white/5 hover:text-white"
          >
            <Icono d={I.ayuda} />
            Escríbenos por WhatsApp
          </a>
          <a
            href="/terminos"
            target="_blank"
            rel="noopener"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/65 transition hover:bg-white/5 hover:text-white"
          >
            <Icono d={I.legal} />
            Términos y privacidad
          </a>
        </nav>
      </aside>

      {/* ── Contenido ── */}
      <div className="min-w-0 flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </div>

      {/* ── Barra inferior (celular) ── */}
      <nav
        aria-label="Mi cuenta"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0B1426]/95 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 items-end">
          {[
            vista("resumen"),
            vista("solicitudes"),
            null,
            vista("bancos"),
            vista("perfil"),
          ].map((v, i) =>
            v ? (
              <li key={v.k}>
                <Destino
                  vista={v.k}
                  onIr={onIr}
                  aria-current={activa === v.k ? "page" : undefined}
                  className={cn(
                    "relative flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-[0.68rem] font-semibold transition",
                    activa === v.k ? "text-oro-500" : "text-white/60",
                  )}
                >
                  <Icono d={v.icono} />
                  {v.corto || v.t}
                  {v.k === "solicitudes" && enCurso > 0 && (
                    <span className="cifras absolute right-3 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-oro-500 px-1 text-[0.6rem] font-bold text-marca-900">
                      {enCurso}
                    </span>
                  )}
                </Destino>
              </li>
            ) : (
              <li key={`nueva-${i}`} className="flex justify-center">
                <Link
                  href="/cuenta/solicitud-nueva"
                  aria-label="Nueva solicitud"
                  className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-oro-500 text-marca-900 shadow-[0_10px_24px_-8px_rgba(232,184,0,0.8)] ring-4 ring-[#E6ECF4]"
                >
                  <Icono d={I.mas} className="h-6 w-6" />
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
    </div>
  );
}
