"use client";

import { useEffect, useState } from "react";
import { chatDisponible, cargarChatwoot, esconderChatwoot, olvidarChatwoot } from "@/lib/chatwoot";

/**
 * Chat de atención (Chatwoot) en Mi cuenta.
 *
 * Solo para clientes con sesión: la burbuja nace oculta y aparece recién
 * cuando el servidor firmó quién es (chatwoot-identidad). Así nadie
 * alcanza a escribir como anónimo antes de identificarse, y el asesor
 * sabe con certeza con qué cliente habla.
 *
 * Al cerrar sesión, cerrarSesionCliente() olvida el chat: en una PC
 * compartida, el siguiente no ve la conversación del anterior.
 *
 * Sin NEXT_PUBLIC_CHATWOOT_URL o _WEB_TOKEN no se muestra nada. La carga
 * del SDK la comparte con el chat de visitantes (lib/chatwoot.js).
 */
const TOKEN = process.env.NEXT_PUBLIC_CHATWOOT_WEB_TOKEN;

export default function ChatSoporte({ sb, usuarioId, sobreBarra, pantalla }) {
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!chatDisponible(TOKEN) || !usuarioId) return;
    let vigente = true;
    (async () => {
      try {
        const cw = await cargarChatwoot(TOKEN, { launcherTitle: "Chatea con nosotros" });
        const { data, error } = await sb.functions.invoke(
          "chatwoot-identidad",
          { body: { canal: "web" } },
        );
        if (error) throw error;
        if (!vigente) return;
        const { identifier, phone_number, ...datos } = data;
        cw.setUser(identifier, phone_number ? { ...datos, phone_number } : datos);
        cw.toggleBubbleVisibility("show");
        setListo(true);
        // Llegó tocando "Tu asesor te respondió" (public/sw.js): se abre el chat.
        const url = new URL(window.location.href);
        if (url.searchParams.get("chat") === "1") {
          url.searchParams.delete("chat");
          window.history.replaceState(null, "", url.pathname + url.search + url.hash);
          cw.toggle("open");
        }
      } catch (e) {
        // Sin chat la cuenta sigue funcionando; queda el WhatsApp.
        console.warn("Chat de atención no disponible:", e?.message || e);
      }
    })();
    return () => {
      vigente = false;
      setListo(false);
      esconderChatwoot();
    };
  }, [sb, usuarioId]);

  // El asesor ve dónde está el cliente ("Web · Solicitudes") sin tener
  // que preguntarle. Es solo una pista: lo informa el navegador, así que
  // los datos de verdad salen de la ficha del cliente.
  useEffect(() => {
    if (!listo || !pantalla) return;
    try {
      window.$chatwoot?.setCustomAttributes({ pantalla: `Web · ${pantalla}` });
    } catch {}
  }, [listo, pantalla]);

  // En el celular, la barra inferior de Mi cuenta taparía la burbuja.
  useEffect(() => {
    document.body.classList.toggle("chat-sobre-barra", Boolean(sobreBarra));
    return () => document.body.classList.remove("chat-sobre-barra");
  }, [sobreBarra]);

  return null;
}

/** Olvida al cliente en el chat. Se llama al cerrar sesión. */
export const olvidarChat = olvidarChatwoot;
