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
 * Barra superior. Transparente sobre la portada oscura; al bajar se
 * vuelve blanca con texto azul, como el resto de la página.
 */
export default function Menu() {
  const [solida, setSolida] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const alBajar = () => setSolida(window.scrollY > 40);
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

  const clara = solida || abierto;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        clara ? "border-b border-[#E3E9F2] bg-white/90 backdrop-blur-md" : "border-b border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-[68px] max-w-6xl items-center gap-8 px-5" aria-label="Principal">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="AlToque Perú WK, inicio">
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition-colors", clara ? "bg-marca-900" : "bg-white/10")}>
            <Image src="/logo.png" alt="" width={26} height={26} priority className="object-contain" />
          </span>
          <span className={cn("font-heading text-[0.95rem] font-semibold tracking-tight transition-colors", clara ? "text-marca-900" : "text-white")}>
            AlToque Perú
          </span>
        </Link>

        <ul className="hidden items-center gap-7 lg:flex">
          {ENLACES.map((e) => (
            <li key={e.href}>
              <a
                href={e.href}
                className={cn("whitespace-nowrap text-sm font-medium transition-colors", clara ? "text-[#4F5B74] hover:text-marca-900" : "text-white/70 hover:text-white")}
              >
                {e.texto}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto hidden items-center gap-5 lg:flex">
          <a
            href={enlaceWhatsapp()}
            target="_blank"
            rel="noopener"
            className={cn("text-sm font-medium transition-colors", clara ? "text-[#4F5B74] hover:text-marca-900" : "text-white/80 hover:text-white")}
          >
            Escríbenos
          </a>
          <a
            href="#empieza"
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-semibold transition",
              clara ? "bg-marca-900 text-white hover:bg-marca-700" : "bg-white text-marca-900 hover:bg-oro-100",
            )}
          >
            Empieza ahora
          </a>
        </div>

        <button
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-controls="menu-movil"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          className={cn("ml-auto flex h-11 w-11 items-center justify-center rounded-full transition lg:hidden", clara ? "text-marca-900 hover:bg-[#EFF3F9]" : "text-white hover:bg-white/10")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-6 w-6">
            {abierto ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 8h16M4 16h16" />}
          </svg>
        </button>
      </nav>

      {abierto && (
        <div id="menu-movil" className="h-[calc(100dvh-68px)] overflow-y-auto bg-white px-5 pb-10 pt-4 lg:hidden">
          <ul className="divide-y divide-[#E3E9F2]">
            {ENLACES.map((e) => (
              <li key={e.href}>
                <a href={e.href} onClick={() => setAbierto(false)} className="block py-5 font-heading text-2xl font-light text-marca-900">
                  {e.texto}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-3">
            <a href="#empieza" onClick={() => setAbierto(false)} className="rounded-full bg-marca-900 px-5 py-4 text-center font-semibold text-white">
              Empieza ahora
            </a>
            <a
              href={enlaceWhatsapp()}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-[#DCE3EE] px-5 py-4 text-center font-semibold text-marca-900"
            >
              Escríbenos por WhatsApp
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
