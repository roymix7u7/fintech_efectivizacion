import { supabase } from "@/lib/supabase";

/**
 * El chat de atención para el personal, desde el panel.
 *
 * Con el chat propio (NEXT_PUBLIC_CHAT_URL) se abre dentro del panel
 * (/chat, components/chatIncrustado.jsx). Chatwoot no deja incrustarse:
 * con él, el botón de la barra lo abre en otra pestaña.
 */
export const CHAT_EN_PANEL = Boolean(process.env.NEXT_PUBLIC_CHAT_URL);

/** Pide al servidor el enlace de entrada al chat (un solo uso, 5 minutos). */
export async function enlaceDelChat() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const r = await fetch("/api/atencion/entrar", {
    method: "POST",
    headers: { Authorization: `Bearer ${session?.access_token || ""}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || "No se pudo abrir el chat.");
  return j.url;
}

/** Abre el chat en otra pestaña (la pestaña se abre en el mismo clic, o el navegador la bloquea). */
export async function abrirChatEnPestana() {
  const pestana = window.open("", "atk-chat");
  if (pestana) pestana.opener = null; // el chat no puede tocar esta página
  try {
    const url = await enlaceDelChat();
    if (pestana) pestana.location.href = url;
    else window.location.href = url;
  } catch (e) {
    pestana?.close();
    throw e;
  }
}
