"use client";

import { useState } from "react";
import { Popover } from "radix-ui";

/**
 * Menú de la persona, arriba a la derecha: su nombre, su correo, ir a
 * Mi perfil y cerrar sesión. En el celular solo se ven las iniciales.
 */
const iniciales = (nombre = "") =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

const Icono = ({ d }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
    aria-hidden
  >
    {[].concat(d).map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

export default function MenuUsuario({ nombre, correo, onPerfil, onSalir }) {
  const [abierto, setAbierto] = useState(false);
  const corto = (nombre || "").split(/\s+/)[0];

  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Menú de ${nombre || "tu cuenta"}`}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-white ring-1 ring-white/15 transition hover:bg-white/10 data-[state=open]:bg-white/10 sm:pr-3"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-oro-500 text-xs font-bold text-marca-900">
            {iniciales(nombre) || "?"}
          </span>
          <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:inline">
            {corto}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`hidden h-4 w-4 text-white/60 transition-transform sm:block ${abierto ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="desplegable z-[90] w-64 overflow-hidden rounded-2xl bg-white text-marca-900 shadow-[0_20px_50px_-12px_rgba(15,27,51,0.35)] ring-1 ring-[#DCE3EE] outline-none"
        >
          <div className="flex items-center gap-3 border-b border-[#EEF2F7] p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0B1426] text-sm font-bold text-oro-500">
              {iniciales(nombre) || "?"}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{nombre}</span>
              {correo && (
                <span className="block truncate text-chico text-[#6B7690]">
                  {correo}
                </span>
              )}
            </span>
          </div>
          <div className="p-1.5">
            {onPerfil && (
              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  onPerfil();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-[#F4F7FB]"
              >
                <Icono
                  d={[
                    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
                    "M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5",
                  ]}
                />
                Mi perfil
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                onSalir();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-700 transition hover:bg-red-50"
            >
              <Icono d={["M15 4h4v16h-4", "M10 8l-4 4 4 4", "M6 12h10"]} />
              Cerrar sesión
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
