"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { chatDisponible, cargarChatwoot } from "@/lib/chatwoot";

/**
 * Contacto flotante de la landing: chat con un asesor o WhatsApp.
 *
 * El chat es para quien todavía no tiene cuenta (bandeja "Visitantes web"
 * de Chatwoot). Para que no lo saturen con bots:
 *   1. El chat no se carga con la página: solo cuando alguien lo pide.
 *   2. Antes pasa la verificación de Cloudflare Turnstile, y el servidor
 *      la confirma (/api/turnstile). Una vez por pestaña.
 *   3. Chatwoot pide nombre y celular, limita mensajes por IP y solo
 *      deja mostrar el chat desde nuestros dominios.
 *
 * Sin NEXT_PUBLIC_CHATWOOT_VISITANTES_TOKEN o la clave de Turnstile,
 * queda solo WhatsApp.
 */
const TOKEN = process.env.NEXT_PUBLIC_CHATWOOT_VISITANTES_TOKEN;
const SITIO_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const CON_CHAT = chatDisponible(TOKEN) && Boolean(SITIO_TURNSTILE);
const VERIFICADO = "atk-chat-verificado";

let turnstileCargado = null;
function cargarTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileCargado) return turnstileCargado;
  turnstileCargado = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => {
      turnstileCargado = null;
      reject(new Error("No se pudo cargar la verificación."));
    };
    document.head.appendChild(s);
  });
  return turnstileCargado;
}

const yaVerificado = () => {
  try {
    return sessionStorage.getItem(VERIFICADO) === "1";
  } catch {
    return false;
  }
};

export default function ContactoFlotante({ whatsapp, whatsappTexto }) {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState("opciones"); // opciones | verificando | cargando
  const [error, setError] = useState("");
  const [chatListo, setChatListo] = useState(false);
  const caja = useRef(null);
  const reto = useRef(null);

  const abrirChat = useCallback(async () => {
    setPaso("cargando");
    try {
      const cw = await cargarChatwoot(TOKEN, { launcherTitle: "Chatea con un asesor" });
      setChatListo(true);
      setAbierto(false);
      setPaso("opciones");
      cw.toggle("open");
    } catch (e) {
      setError(e.message || "No se pudo abrir el chat. Escríbenos por WhatsApp.");
      setPaso("opciones");
    }
  }, []);

  async function pedirChat() {
    setError("");
    if (chatListo) {
      setAbierto(false);
      return window.$chatwoot?.toggle("open");
    }
    if (yaVerificado()) return abrirChat();
    setPaso("verificando");
  }

  // Monta el reto de Turnstile cuando se muestra el paso de verificación.
  useEffect(() => {
    if (paso !== "verificando" || !reto.current) return;
    let id = null;
    let vigente = true;
    cargarTurnstile()
      .then((ts) => {
        if (!vigente || !reto.current) return;
        id = ts.render(reto.current, {
          sitekey: SITIO_TURNSTILE,
          language: "es",
          theme: "light",
          callback: async (token) => {
            try {
              const r = await fetch("/api/turnstile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
              });
              const j = await r.json();
              if (!r.ok || !j.ok) throw new Error(j.error);
              try {
                sessionStorage.setItem(VERIFICADO, "1");
              } catch {}
              if (vigente) abrirChat();
            } catch (e) {
              if (!vigente) return;
              setError(e.message || "No pudimos verificarte. Inténtalo de nuevo.");
              setPaso("opciones");
            }
          },
          "error-callback": () => {
            if (!vigente) return;
            setError("No pudimos verificarte. Inténtalo de nuevo o escríbenos por WhatsApp.");
            setPaso("opciones");
          },
        });
      })
      .catch((e) => {
        if (!vigente) return;
        setError(e.message);
        setPaso("opciones");
      });
    return () => {
      vigente = false;
      try {
        if (id != null) window.turnstile?.remove(id);
      } catch {}
    };
  }, [paso, abrirChat]);

  // Cerrar con Escape o tocando fuera.
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e) => e.key === "Escape" && setAbierto(false);
    const fuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierto(false);
    document.addEventListener("keydown", tecla);
    document.addEventListener("mousedown", fuera);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("mousedown", fuera);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {abierto && (
        <div
          role="dialog"
          aria-label="Contáctanos"
          className="w-[300px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl bg-white text-marca-900 shadow-[0_24px_60px_rgba(15,27,51,0.35)]"
        >
          <div className="bg-marca-900 px-4 py-3.5 text-white">
            <p className="font-heading text-base font-semibold">¿En qué te ayudamos?</p>
            <p className="mt-0.5 text-xs text-white/65">Lunes a sábado, 9:00 a. m. a 6:00 p. m.</p>
          </div>

          <div className="space-y-2 p-3">
            {paso === "verificando" ? (
              <div className="space-y-2 py-1 text-center">
                <p className="text-sm font-semibold">Un momento: confirmamos que eres una persona.</p>
                <div ref={reto} className="flex min-h-[65px] justify-center" />
                <button onClick={() => setPaso("opciones")} className="text-xs text-marca-500 underline">
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                {CON_CHAT && (
                  <button
                    onClick={pedirChat}
                    disabled={paso === "cargando"}
                    className="flex w-full items-center gap-3 rounded-xl bg-marca-900 px-3.5 py-3 text-left text-white transition hover:bg-marca-700 disabled:opacity-70"
                  >
                    <IconoChat className="h-5 w-5 shrink-0 text-oro-500" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{paso === "cargando" ? "Abriendo el chat…" : "Chatear aquí"}</span>
                      <span className="block text-xs text-white/65">Te responde un asesor</span>
                    </span>
                  </button>
                )}
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener"
                  className="flex w-full items-center gap-3 rounded-xl border border-marca-100 px-3.5 py-3 transition hover:bg-marca-50"
                >
                  <IconoWhatsapp className="h-5 w-5 shrink-0 text-[#25D366]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">WhatsApp</span>
                    <span className="block text-xs text-marca-500">{whatsappTexto}</span>
                  </span>
                </a>
                {error && <p className="px-1 text-xs font-semibold text-red-700">{error}</p>}
              </>
            )}
          </div>

          <div className="border-t border-marca-100 px-4 py-2.5 text-xs text-marca-500">
            ¿Ya eres cliente?{" "}
            <Link href="/ingresar" className="font-semibold text-marca-900 underline">
              Ingresa y escríbenos desde tu cuenta
            </Link>
          </div>
        </div>
      )}

      <button
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar contacto" : "Contáctanos"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-oro-500 text-marca-900 shadow-[0_12px_30px_rgba(232,184,0,0.45)] transition hover:scale-105"
      >
        {abierto ? <IconoCerrar className="h-6 w-6" /> : <IconoChat className="h-7 w-7" />}
      </button>
    </div>
  );
}

const IconoChat = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.3A8 8 0 1 1 21 12z" />
    <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
  </svg>
);

const IconoCerrar = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const IconoWhatsapp = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
  </svg>
);
