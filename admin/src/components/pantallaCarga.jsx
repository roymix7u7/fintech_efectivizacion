"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Señales de carga de toda la web (panel, Mi cuenta y landing):
 *
 *   · Pantalla completa (mostrarCarga / ocultarCarga): al entrar y al
 *     cerrar sesión, para que se vea que algo está pasando.
 *   · Barra fina arriba: al tocar un enlace interno que cambia de
 *     página, hasta que la página nueva aparece.
 *
 * Ambas se apagan solas cuando cambia la dirección, y nunca duran más de
 * 15 s (si algo falla, la página no queda tapada).
 */
const EVENTO = "atk:carga";

export function mostrarCarga(texto = "Cargando…") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO, { detail: { texto } }));
}

export function ocultarCarga() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO, { detail: null }));
}

const MAXIMO_MS = 15_000;

export default function PantallaCarga() {
  const pathname = usePathname();
  const [texto, setTexto] = useState(null); // pantalla completa
  const [barra, setBarra] = useState(false); // barra de navegación
  const ruta = useRef(pathname);

  // Pantalla completa a pedido.
  useEffect(() => {
    const alPedir = (e) => setTexto(e.detail?.texto ?? null);
    window.addEventListener(EVENTO, alPedir);
    return () => window.removeEventListener(EVENTO, alPedir);
  }, []);

  // Barra al tocar un enlace interno hacia otra página.
  useEffect(() => {
    const alTocar = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setBarra(true);
    };
    document.addEventListener("click", alTocar, true);
    return () => document.removeEventListener("click", alTocar, true);
  }, []);

  // Llegó la página nueva: todo se apaga.
  useEffect(() => {
    if (ruta.current === pathname) return;
    ruta.current = pathname;
    setBarra(false);
    setTexto(null);
  }, [pathname]);

  // Tope de seguridad.
  useEffect(() => {
    if (!texto && !barra) return;
    const t = setTimeout(() => {
      setTexto(null);
      setBarra(false);
    }, MAXIMO_MS);
    return () => clearTimeout(t);
  }, [texto, barra]);

  return (
    <>
      {(barra || texto) && (
        <div className="atk-barra-carga" role="progressbar" aria-label="Cargando" aria-busy="true">
          <span />
        </div>
      )}
      {texto && (
        <div className="atk-pantalla-carga" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-4">
            <svg viewBox="0 0 44 44" className="atk-pantalla-carga__logo h-16 w-16" aria-hidden>
              <circle cx="22" cy="22" r="22" fill="#1B2A4A" />
              <path d="M22 9.5 33 33h-5.4L22 20.6 16.4 33H11z" fill="#E8B800" />
            </svg>
            <div className="atk-pantalla-carga__pista" aria-hidden>
              <span />
            </div>
            <p className="text-sm font-semibold text-marca-900">{texto}</p>
          </div>
        </div>
      )}
    </>
  );
}
