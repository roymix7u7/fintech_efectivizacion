"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { enlaceWhatsapp } from "./datos";

const ENLACES = [
  { href: "#como-funciona", texto: "Cómo funciona" },
  { href: "#calculadora", texto: "Comisiones" },
  { href: "#beneficios", texto: "Beneficios" },
  { href: "#locales", texto: "Locales" },
  { href: "#preguntas", texto: "Preguntas" },
];

/**
 * Barra superior. Transparente sobre la portada y sólida al bajar, para
 * que el menú se lea sobre cualquier sección.
 */
export default function Menu() {
  const [solida, setSolida] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const alBajar = () => setSolida(window.scrollY > 24);
    alBajar();
    window.addEventListener("scroll", alBajar, { passive: true });
    return () => window.removeEventListener("scroll", alBajar);
  }, []);

  useEffect(() => {
    document.body.style.overflow = abierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [abierto]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        solida || abierto ? "bg-[#0B1426]/90 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-md" : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-[72px] max-w-6xl items-center gap-6 px-5" aria-label="Principal">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="AlToque Perú WK, inicio">
          <Image src="/logo.png" alt="" width={40} height={40} priority className="object-contain" />
          <span className="hidden leading-tight sm:block">
            <span className="block font-heading text-[0.95rem] font-bold tracking-[0.12em] text-oro-500">ALTOQUE PERÚ</span>
            <span className="block text-[0.7rem] font-semibold tracking-[0.3em] text-white/50">WK</span>
          </span>
        </Link>

        <ul className="mx-auto hidden items-center gap-1 xl:flex">
          {ENLACES.map((e) => (
            <li key={e.href}>
              <a href={e.href} className="whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">
                {e.texto}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto hidden items-center gap-2 xl:flex">
          <a
            href={enlaceWhatsapp()}
            target="_blank"
            rel="noopener"
            className="rounded-full px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
          >
            Escríbenos
          </a>
          <a
            href="#empieza"
            className="rounded-full bg-oro-500 px-5 py-2.5 text-sm font-extrabold text-marca-900 shadow-[0_8px_24px_rgba(232,184,0,0.35)] transition hover:-translate-y-px hover:bg-oro-300"
          >
            Crear mi cuenta
          </a>
        </div>

        <button
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-controls="menu-movil"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10 xl:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
            {abierto ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
          </svg>
        </button>
      </nav>

      {abierto && (
        <div id="menu-movil" className="h-[calc(100dvh-72px)] overflow-y-auto border-t border-white/10 px-5 pb-8 pt-4 xl:hidden">
          <ul className="space-y-1">
            {ENLACES.map((e) => (
              <li key={e.href}>
                <a
                  href={e.href}
                  onClick={() => setAbierto(false)}
                  className="block rounded-2xl px-4 py-4 font-heading text-xl font-semibold text-white transition hover:bg-white/10"
                >
                  {e.texto}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-3">
            <a
              href="#empieza"
              onClick={() => setAbierto(false)}
              className="rounded-full bg-oro-500 px-5 py-4 text-center text-md font-extrabold text-marca-900"
            >
              Crear mi cuenta
            </a>
            <a
              href={enlaceWhatsapp()}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-white/25 px-5 py-4 text-center text-md font-bold text-white"
            >
              Escríbenos por WhatsApp
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
