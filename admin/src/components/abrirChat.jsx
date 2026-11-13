"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Pista from "@/components/pista";

/**
 * "Abrir chat de atención" en la barra del panel: entra a Chatwoot con la
 * sesión del panel, sin otra contraseña (/api/atencion/entrar).
 *
 * Solo aparece para quien tiene "Chat" activado en Equipo. Se recuerda
 * mientras la pestaña esté abierta para no preguntarlo en cada pantalla.
 */
let atiende = null; // { id, activo }

/** Con el chat propio, el chat se abre dentro del panel (/chat). Chatwoot no deja incrustarse: va en otra pestaña. */
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

/** Equipo lo llama al cambiar el "Chat" de uno mismo: el botón se actualiza al instante. */
export function fijarAccesoChat(id, activo) {
  atiende = { id, activo };
  window.dispatchEvent(new CustomEvent("atk:acceso-chat", { detail: atiende }));
}

export default function AbrirChat({ userId, compacta }) {
  const [activo, setActivo] = useState(atiende?.id === userId ? atiende.activo : false);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const enChat = usePathname() === "/chat";

  useEffect(() => {
    if (!userId || atiende?.id === userId) return;
    let vigente = true;
    supabase
      .from("chat_personal")
      .select("activo")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        atiende = { id: userId, activo: Boolean(data?.activo) };
        if (vigente) setActivo(atiende.activo);
      });
    return () => {
      vigente = false;
    };
  }, [userId]);

  useEffect(() => {
    const alCambiar = (e) => e.detail?.id === userId && setActivo(e.detail.activo);
    window.addEventListener("atk:acceso-chat", alCambiar);
    return () => window.removeEventListener("atk:acceso-chat", alCambiar);
  }, [userId]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(t);
  }, [error]);

  async function abrir() {
    if (CHAT_EN_PANEL) return router.push("/chat");
    setError("");
    setAbriendo(true);
    // La pestaña se abre ya (en el mismo clic), si no el navegador la bloquea.
    const pestana = window.open("", "atk-chatwoot");
    if (pestana) pestana.opener = null; // Chatwoot no puede tocar esta página
    try {
      const url = await enlaceDelChat();
      if (pestana) pestana.location.href = url;
      else window.location.href = url;
    } catch (e) {
      pestana?.close();
      setError(e.message);
    } finally {
      setAbriendo(false);
    }
  }

  if (!activo) return null;

  const boton = (
    <button
      onClick={abrir}
      disabled={abriendo}
      aria-label="Abrir chat de atención"
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold ring-1 transition disabled:opacity-60",
        enChat ? "bg-oro-500 text-marca-900 ring-oro-500" : "bg-oro-500/10 text-oro-300 ring-oro-500/25 hover:bg-oro-500/20",
        compacta && "lg:w-9 lg:justify-center lg:px-0",
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.3A8 8 0 1 1 21 12z" />
      </svg>
      <span className={cn(compacta && "lg:hidden")}>{abriendo ? "Abriendo…" : CHAT_EN_PANEL ? "Chat de atención" : "Abrir chat de atención"}</span>
    </button>
  );

  return (
    <div className="mt-1">
      {compacta ? (
        <Pista texto="Abrir chat de atención" lado="right">
          {boton}
        </Pista>
      ) : (
        boton
      )}
      {error && (
        <p role="alert" className={cn("mt-1.5 rounded-md bg-red-500/15 px-2 py-1.5 text-xs text-red-200", compacta && "lg:hidden")}>
          {error}
        </p>
      )}
    </div>
  );
}
