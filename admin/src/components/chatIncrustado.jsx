"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CHAT_EN_PANEL, enlaceDelChat } from "@/lib/chatPanel";

/**
 * El chat de atención, cargado una sola vez y vivo mientras dure la sesión
 * del panel (va en app/layout.js, fuera de las pantallas).
 *
 * Cada pantalla del panel se monta de nuevo al navegar; si el chat viviera
 * dentro de /chat, se recargaría en cada visita. Aquí el marco se queda
 * cargado y conectado en tiempo real: al salir de /chat solo se esconde, y
 * al volver aparece al instante, en la conversación donde se dejó.
 *
 * La pantalla /chat solo deja un hueco (#atk-chat-hueco) y este componente
 * coloca el marco encima, siguiendo su tamaño.
 *
 * El chat sabe que está incrustado y no muestra su propia barra: la
 * navegación la pone el panel (components/abrirChat.jsx). Se entienden por
 * mensajes: el panel manda a qué sección ir (mandarAlChat) y el chat
 * informa dónde está, qué secciones puede ver esta persona y cuántos
 * mensajes y avisos tiene sin leer (useInfoChat).
 *
 * Se carga cuando la barra confirma que la persona atiende el chat
 * (evento atk:chat-precargar) o al entrar a /chat. Se descarta al cerrar
 * sesión (/login): el siguiente no hereda el chat del anterior.
 */
export const HUECO = "atk-chat-hueco";
const PRECARGAR = "atk:chat-precargar";
const ESTADO = "atk:chat-estado";
const INFO = "atk:chat-info";
const ORIGEN_CHAT = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_CHAT_URL).origin;
  } catch {
    return null;
  }
})();

// Lo último que informó el chat y la ventana del marco (una sola por pestaña).
let info = null; // { route, unread, notifs, nav: [{ route, label }], user }
let ventana = null;

/** Le dice algo al chat: { type: "atk-chat:navigate", route } o { type: "atk-chat:panel", panel }. */
export function mandarAlChat(mensaje) {
  if (ventana && ORIGEN_CHAT) ventana.postMessage(mensaje, ORIGEN_CHAT);
}

/** Lo que el chat informa de sí mismo, o null si aún no cargó. */
export function useInfoChat() {
  const [valor, setValor] = useState(info);
  useEffect(() => {
    const alCambiar = () => setValor(info);
    window.addEventListener(INFO, alCambiar);
    alCambiar();
    return () => window.removeEventListener(INFO, alCambiar);
  }, []);
  return valor;
}

/** La barra lo llama cuando sabe que la persona atiende el chat. */
export function precargarChat() {
  if (typeof window !== "undefined" && CHAT_EN_PANEL) window.dispatchEvent(new CustomEvent(PRECARGAR));
}

/** Para la pantalla /chat: { cargando, error } y reintentar(). */
export function useEstadoChat() {
  const [estado, setEstado] = useState({ cargando: true, error: "" });
  useEffect(() => {
    const alCambiar = (e) => setEstado(e.detail);
    window.addEventListener(ESTADO, alCambiar);
    window.dispatchEvent(new CustomEvent(PRECARGAR, { detail: { informar: true } }));
    return () => window.removeEventListener(ESTADO, alCambiar);
  }, []);
  const reintentar = useCallback(() => window.dispatchEvent(new CustomEvent(PRECARGAR, { detail: { forzar: true } })), []);
  return { ...estado, reintentar };
}

export default function ChatIncrustado() {
  const pathname = usePathname();
  const [url, setUrl] = useState(null);
  const [caja, setCaja] = useState(null); // { top, left, width, height } del hueco
  const estado = useRef({ cargando: false, error: "" });
  const pidiendo = useRef(false);
  const marco = useRef(null);

  // Lo que informa el chat (solo se escucha a su ventana y a su dirección).
  useEffect(() => {
    const alRecibir = (e) => {
      if (!marco.current || e.source !== marco.current.contentWindow || e.origin !== ORIGEN_CHAT) return;
      if (e.data?.type !== "atk-chat:state") return;
      const d = e.data;
      info = {
        route: String(d.route || ""),
        unread: Number(d.unread) || 0,
        notifs: Number(d.notifs) || 0,
        nav: Array.isArray(d.nav) ? d.nav.slice(0, 12).map((n) => ({ route: String(n.route || ""), label: String(n.label || "").slice(0, 40) })) : [],
      };
      window.dispatchEvent(new CustomEvent(INFO));
    };
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, []);

  const informar = useCallback((cambio) => {
    estado.current = { ...estado.current, ...cambio };
    window.dispatchEvent(new CustomEvent(ESTADO, { detail: estado.current }));
  }, []);

  const cargar = useCallback(
    async (forzar) => {
      if (pidiendo.current || (url && !forzar)) return;
      pidiendo.current = true;
      informar({ cargando: true, error: "" });
      try {
        setUrl(await enlaceDelChat());
      } catch (e) {
        setUrl(null);
        informar({ cargando: false, error: e.message });
      } finally {
        pidiendo.current = false;
      }
    },
    [url, informar],
  );

  useEffect(() => {
    if (!CHAT_EN_PANEL) return;
    const alPedir = (e) => {
      if (e.detail?.informar && (url || estado.current.error)) informar({});
      cargar(Boolean(e.detail?.forzar));
    };
    window.addEventListener(PRECARGAR, alPedir);
    return () => window.removeEventListener(PRECARGAR, alPedir);
  }, [cargar, informar, url]);

  // Al cerrar sesión se descarta.
  useEffect(() => {
    if (pathname === "/login" && url) {
      setUrl(null);
      estado.current = { cargando: false, error: "" };
      info = null;
      ventana = null;
      window.dispatchEvent(new CustomEvent(INFO));
    }
  }, [pathname, url]);

  // El marco sigue al hueco de la pantalla /chat; sin hueco, se esconde.
  useEffect(() => {
    if (pathname !== "/chat") return setCaja(null);
    let hueco = null;
    let observador = null;
    const medir = () => {
      if (!hueco) return;
      const r = hueco.getBoundingClientRect();
      setCaja({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const buscar = () => {
      hueco = document.getElementById(HUECO);
      if (!hueco) return false;
      observador = new ResizeObserver(medir);
      observador.observe(hueco);
      observador.observe(document.documentElement);
      medir();
      return true;
    };
    // El hueco aparece cuando la pantalla termina de montarse.
    let intento = null;
    if (!buscar()) intento = setInterval(() => buscar() && clearInterval(intento), 50);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      clearInterval(intento);
      observador?.disconnect();
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [pathname]);

  if (!CHAT_EN_PANEL || !url) return null;

  const visible = Boolean(caja);
  return (
    <iframe
      ref={(el) => {
        marco.current = el;
        ventana = el?.contentWindow || null;
      }}
      src={url}
      title="Chat de atención"
      onLoad={() => {
        informar({ cargando: false, error: "" });
        mandarAlChat({ type: "atk-chat:ping" });
      }}
      // Sonido, portapapeles y pantalla completa para el chat.
      allow="autoplay; clipboard-read; clipboard-write; fullscreen"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      style={
        visible
          ? { position: "fixed", top: caja.top, left: caja.left, width: caja.width, height: caja.height, border: 0, zIndex: 15 }
          : { position: "fixed", top: 0, left: -10000, width: 1200, height: 800, border: 0, visibility: "hidden", pointerEvents: "none" }
      }
    />
  );
}
