"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseCliente } from "@/lib/cliente";
import { chatDisponible, cargarChatwoot } from "@/lib/chatwoot";
import { HORARIO } from "./datos";

/**
 * Botón flotante de la landing: chat con un asesor.
 *
 * El chat es para quien todavía no tiene cuenta (bandeja "Visitantes web"
 * de Chatwoot). Para que no lo saturen con bots:
 *   1. El chat no se carga con la página: solo cuando alguien lo pide.
 *   2. Antes pasa la verificación de Cloudflare Turnstile, y el servidor
 *      la confirma (/api/turnstile). Una vez por pestaña.
 *   3. Chatwoot pide nombre y celular, limita mensajes por IP y solo
 *      deja mostrar el chat desde nuestros dominios.
 *
 * WhatsApp está oculto por ahora: para volver a mostrarlo en la tarjeta,
 * MOSTRAR_WHATSAPP = true (el enlace ya llega por props desde la landing).
 *
 * Sin NEXT_PUBLIC_CHATWOOT_VISITANTES_TOKEN o la clave de Turnstile (y con
 * WhatsApp oculto) el botón no se muestra.
 */
const MOSTRAR_WHATSAPP = false;
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
  const [atiende, setAtiende] = useState(null); // se calcula en el navegador
  // Cliente con la sesión abierta (volvió a la landing desde Mi cuenta):
  // su conversación está en el chat de clientes, con su historial. El de
  // visitantes no la tiene, y cambiar de uno a otro olvidaría la suya.
  const [cliente, setCliente] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let vigente = true;
    supabaseCliente()
      .auth.getSession()
      .then(({ data }) => vigente && setCliente(Boolean(data?.session)))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);
  const caja = useRef(null);
  const reto = useRef(null);

  useEffect(() => {
    const revisar = () => setAtiende(atiendeAhora());
    revisar();
    const t = setInterval(revisar, 60_000);
    return () => clearInterval(t);
  }, []);

  const abrirChat = useCallback(async () => {
    setPaso("cargando");
    try {
      const cw = await cargarChatwoot(TOKEN, { launcherTitle: "Chatea con un asesor" });
      setChatListo(true);
      setAbierto(false);
      setPaso("opciones");
      cw.toggle("open");
    } catch (e) {
      setError(e.message || "No se pudo abrir el chat. Inténtalo de nuevo en un momento.");
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
            setError("No pudimos verificarte. Inténtalo de nuevo.");
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

  if (!cliente && !CON_CHAT && !MOSTRAR_WHATSAPP) return null;

  return (
    <div ref={caja} className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {abierto && (
        <div
          role="dialog"
          aria-label="Chatea con un asesor"
          className="w-[320px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl bg-white text-marca-900 shadow-[0_24px_60px_rgba(15,27,51,0.35)]"
        >
          <div className="flex items-center gap-3 bg-marca-900 px-4 py-4 text-white">
            <span className="relative shrink-0">
              <MarcaAtk className="h-11 w-11" />
              <Punto atiende={atiende} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-marca-900" />
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-base font-semibold leading-tight">AlToque Perú WK</span>
              <span className="mt-0.5 block text-xs text-white/70">
                {atiende === false ? "Fuera de horario: te respondemos desde las 9:00 a. m." : "Asesores en línea: respondemos en minutos"}
              </span>
            </span>
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
                <p className="px-1 pb-1 text-sm text-marca-600">
                  ¿Dudas sobre comisiones, bancos o cómo efectivizar tu tarjeta? Escríbenos.
                </p>
                {CON_CHAT && (
                  <button
                    onClick={pedirChat}
                    disabled={paso === "cargando"}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-oro-500 px-4 py-3 text-sm font-semibold text-marca-900 transition hover:bg-oro-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-900 disabled:opacity-70"
                  >
                    <IconoChat className="h-5 w-5 shrink-0" />
                    {paso === "cargando" ? "Abriendo el chat…" : "Empezar chat"}
                  </button>
                )}
                {MOSTRAR_WHATSAPP && whatsapp && (
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
                )}
                {error && <p className="px-1 text-xs font-semibold text-red-700">{error}</p>}
                <p className="px-1 text-[11px] text-marca-500">{HORARIO.dias}, {HORARIO.horas}</p>
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
        onClick={() => (cliente ? router.push("/cuenta?chat=1") : setAbierto((a) => !a))}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar" : cliente ? "Ir a mi chat en Mi cuenta" : "Chatea con un asesor"}
        className={
          "group flex items-center gap-2.5 rounded-full bg-marca-900 text-white shadow-[0_12px_30px_rgba(15,27,51,0.4)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-marca-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oro-500 motion-reduce:transition-none motion-reduce:hover:translate-y-0 " +
          (abierto ? "h-14 w-14 justify-center" : "h-14 py-1.5 pl-1.5 pr-1.5 sm:pr-5")
        }
      >
        {abierto ? (
          <IconoCerrar className="h-6 w-6 text-oro-500" />
        ) : (
          <>
            <span className="relative shrink-0">
              <MarcaAtk className="h-11 w-11" />
              <Punto atiende={atiende} className="absolute -right-0.5 -top-0.5 ring-2 ring-marca-900" />
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold">{cliente ? "Chatea con tu asesor" : "Chatea con un asesor"}</span>
              <span className="block text-[11px] text-white/65">{cliente ? "Sigue tu conversación" : atiende === false ? "Déjanos tu mensaje" : "En línea ahora"}</span>
            </span>
          </>
        )}
      </button>
    </div>
  );
}

/** ¿Hay atención ahora? Lunes a sábado de 9:00 a 18:00, hora de Lima. */
function atiendeAhora() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short", hour: "numeric", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const hora = Number(partes.hour);
  return partes.weekday !== "Sun" && hora >= 9 && hora < 18;
}

/** Verde si hay asesores en horario; gris fuera de horario. Antes de saberlo, nada. */
const Punto = ({ atiende, className = "" }) =>
  atiende == null ? null : (
    <span
      aria-hidden
      className={`block h-3 w-3 rounded-full ${atiende ? "bg-emerald-400" : "bg-marca-300"} ${className}`}
    />
  );

/** La "Λ" dorada del logo ATK sobre un círculo azul. */
const MarcaAtk = (p) => (
  <svg viewBox="0 0 44 44" aria-hidden {...p}>
    <circle cx="22" cy="22" r="22" fill="#1B2A4A" />
    <path d="M22 9.5 L33 33 H27.6 L22 20.6 L16.4 33 H11 Z" fill="#E8B800" />
  </svg>
);

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
