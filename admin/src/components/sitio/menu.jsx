"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { enlaceWhatsapp } from "./datos";

const ENLACES = [
  { href: "#servicio", texto: "Servicio" },
  { href: "#comisiones", texto: "Comisiones" },
  { href: "#seguridad", texto: "Seguridad" },
  { href: "#nosotros", texto: "Nosotros" },
  { href: "#preguntas", texto: "Ayuda" },
];

/**
 * Barra flotante y centrada. Siempre tiene fondo propio (azul noche con
 * desenfoque y sombra): antes era transparente y, al bajar, las letras
 * quedaban encima del contenido y no se leían.
 */
export default function Menu() {
  const [bajo, setBajo] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const conSesion = useSesionAbierta();

  useEffect(() => {
    const alBajar = () => setBajo(window.scrollY > 24);
    alBajar();
    window.addEventListener("scroll", alBajar, { passive: true });
    return () => window.removeEventListener("scroll", alBajar);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:pt-4">
      <nav
        aria-label="Principal"
        className={cn(
          "mx-auto flex h-14 max-w-5xl items-center gap-2 rounded-full pl-2 pr-2 ring-1 backdrop-blur-xl transition-all duration-300",
          bajo || abierto
            ? "bg-[#0B1426]/90 shadow-[0_12px_40px_-8px_rgba(11,20,38,0.55)] ring-white/10"
            : "bg-[#0B1426]/60 shadow-[0_8px_30px_-10px_rgba(11,20,38,0.4)] ring-white/15",
        )}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3"
          aria-label="AlToque Perú WK, inicio"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0F1B33] ring-1 ring-white/10">
            <Image
              src="/logo.png"
              alt=""
              width={26}
              height={26}
              priority
              className="object-contain"
            />
          </span>
          <span className="whitespace-nowrap font-heading text-[0.9rem] font-bold tracking-[0.06em] text-white">
            ALTOQUE PERU <span className="text-oro-500">WK</span>
          </span>
        </Link>

        <ul className="mx-auto hidden min-w-0 items-center lg:flex">
          {ENLACES.map((e) => (
            <li key={e.href}>
              <a
                href={e.href}
                className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white xl:px-4"
              >
                {e.texto}
              </a>
            </li>
          ))}
        </ul>

        {/* WhatsApp no va aquí: el botón flotante ya está siempre a la
            vista, y con él la barra no alcanzaba y "Crear cuenta" se
            salía del borde. */}
        <div className="ml-auto hidden shrink-0 items-center gap-1 lg:flex">
          {conSesion ? (
            <Link
              href="/cuenta"
              className="whitespace-nowrap rounded-full bg-oro-500 px-5 py-2.5 text-sm font-bold text-marca-900 transition hover:bg-oro-300"
            >
              Mi cuenta
            </Link>
          ) : (
            <>
              <Link
                href="/ingresar"
                className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Ingresar
              </Link>
              <Link
                href="/registro"
                className="whitespace-nowrap rounded-full bg-oro-500 px-5 py-2.5 text-sm font-bold text-marca-900 transition hover:bg-oro-300"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </div>

        {/* En el celular el acceso queda a la vista, no escondido en el menú. */}
        <Link
          href={conSesion ? "/cuenta" : "/ingresar"}
          className="ml-auto whitespace-nowrap rounded-full bg-oro-500 px-3.5 py-2 text-sm font-bold text-marca-900 lg:hidden"
        >
          {conSesion ? "Mi cuenta" : "Ingresar"}
        </Link>

        <button
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-controls="menu-movil"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 lg:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="h-5 w-5"
          >
            {abierto ? (
              <path d="M18 6 6 18M6 6l12 12" />
            ) : (
              <path d="M4 8h16M4 16h16" />
            )}
          </svg>
        </button>
      </nav>

      {abierto && (
        <div
          id="menu-movil"
          className="mx-auto mt-2 max-w-5xl overflow-hidden rounded-3xl bg-[#0B1426]/95 p-3 shadow-[0_24px_60px_-12px_rgba(11,20,38,0.6)] ring-1 ring-white/10 backdrop-blur-xl lg:hidden"
        >
          <ul>
            {ENLACES.map((e) => (
              <li key={e.href}>
                <a
                  href={e.href}
                  onClick={() => setAbierto(false)}
                  className="block rounded-2xl px-4 py-3.5 font-heading text-lg font-normal text-white transition hover:bg-white/10"
                >
                  {e.texto}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid gap-2 border-t border-white/10 pt-3">
            {conSesion ? (
              <Link
                href="/cuenta"
                className="rounded-full bg-oro-500 px-5 py-3.5 text-center font-bold text-marca-900"
              >
                Mi cuenta
              </Link>
            ) : (
              <>
                <Link
                  href="/registro"
                  className="rounded-full bg-oro-500 px-5 py-3.5 text-center font-bold text-marca-900"
                >
                  Crear cuenta
                </Link>
                <Link
                  href="/ingresar"
                  className="rounded-full px-5 py-3.5 text-center font-semibold text-white ring-1 ring-white/20"
                >
                  Ingresar
                </Link>
              </>
            )}
            <a
              href={enlaceWhatsapp()}
              target="_blank"
              rel="noopener"
              className="rounded-full px-5 py-3.5 text-center font-semibold text-white ring-1 ring-white/20"
            >
              Escríbenos por WhatsApp
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

/**
 * ¿Hay una sesión de cliente vigente en este navegador? Se lee de lo
 * guardado (sin cargar Supabase en la portada): la sesión existe y no
 * pasaron las dos horas.
 */
function useSesionAbierta() {
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    try {
      const inicio = Number(localStorage.getItem("atk-cliente:inicio"));
      setAbierta(
        Boolean(localStorage.getItem("atk-cliente")) &&
          inicio > 0 &&
          Date.now() - inicio < 2 * 60 * 60 * 1000,
      );
    } catch {}
  }, []);
  return abierta;
}
