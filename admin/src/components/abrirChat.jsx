"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { CHAT_EN_PANEL, abrirChatEnPestana } from "@/lib/chatPanel";
import { precargarChat } from "@/components/chatIncrustado";
import Pista from "@/components/pista";

/**
 * Botón dorado "Chat de atención" de la barra del panel.
 *
 *   · Con el chat propio: lleva a /chat, donde el chat está dentro del
 *     panel. Estando ahí, al lado aparece un ícono para abrirlo en otra
 *     pestaña (quien trabaja con dos ventanas).
 *   · Con Chatwoot: lo abre en otra pestaña.
 * En los dos casos se entra con la sesión del panel, sin otra contraseña
 * (/api/atencion/entrar).
 *
 * Solo aparece para quien tiene "Chat" activado en Equipo. Se recuerda
 * mientras la pestaña esté abierta para no preguntarlo en cada pantalla.
 * Apenas se sabe que la persona atiende el chat, este se va cargando por
 * detrás: el primer clic ya lo encuentra listo.
 */
let atiende = null; // { id, activo }

/** Equipo lo llama al cambiar el "Chat" de uno mismo: el botón se actualiza al instante. */
export function fijarAccesoChat(id, activo) {
  atiende = { id, activo };
  window.dispatchEvent(new CustomEvent("atk:acceso-chat", { detail: atiende }));
}

const IconoChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.3A8 8 0 1 1 21 12z" />
  </svg>
);

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

  // Atiende el chat: se va cargando por detrás.
  useEffect(() => {
    if (activo) precargarChat();
  }, [activo]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(t);
  }, [error]);

  async function enPestana() {
    setError("");
    setAbriendo(true);
    try {
      await abrirChatEnPestana();
    } catch (e) {
      setError(e.message);
    } finally {
      setAbriendo(false);
    }
  }

  if (!activo) return null;

  const texto = CHAT_EN_PANEL ? "Chat de atención" : "Abrir chat de atención";
  const boton = (
    <button
      onClick={() => (CHAT_EN_PANEL ? router.push("/chat") : enPestana())}
      disabled={abriendo && !CHAT_EN_PANEL}
      aria-label={texto}
      aria-current={enChat ? "page" : undefined}
      className={cn(
        "flex h-9 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-sm font-semibold ring-1 transition disabled:opacity-60",
        enChat ? "bg-oro-500 text-marca-900 ring-oro-500" : "bg-oro-500/10 text-oro-300 ring-oro-500/25 hover:bg-oro-500/20",
        compacta && "lg:w-9 lg:flex-none lg:justify-center lg:px-0",
      )}
    >
      <IconoChat />
      <span className={cn("truncate", compacta && "lg:hidden")}>{abriendo && !CHAT_EN_PANEL ? "Abriendo…" : texto}</span>
    </button>
  );

  return (
    <div className="mt-1">
      <div className={cn("flex items-center gap-1", compacta && "lg:flex-col")}>
        {compacta ? (
          <Pista texto={texto} lado="right">
            {boton}
          </Pista>
        ) : (
          boton
        )}
        {CHAT_EN_PANEL && enChat && (
          <Pista texto="Abrir el chat en otra pestaña" lado="right">
            <button
              onClick={enPestana}
              disabled={abriendo}
              aria-label="Abrir el chat en otra pestaña"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </button>
          </Pista>
        )}
      </div>
      {error && (
        <p role="alert" className={cn("mt-1.5 rounded-md bg-red-500/15 px-2 py-1.5 text-xs text-red-200", compacta && "lg:hidden")}>
          {error}
        </p>
      )}
    </div>
  );
}
