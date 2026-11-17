"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { CHAT_EN_PANEL, abrirChatEnPestana } from "@/lib/chatPanel";
import { precargarChat, mandarAlChat, useInfoChat } from "@/components/chatIncrustado";
import Pista from "@/components/pista";

/**
 * El chat de atención en la barra del panel.
 *
 *   · Con el chat propio: el botón dorado lleva a /chat, donde el chat
 *     está dentro del panel (sin su propia barra), y muestra cuántos
 *     mensajes hay sin leer aunque se esté en otra sección. Estando en el
 *     chat, al lado aparece "Más del chat": contactos, reportes, ajustes
 *     (lo que el chat le permita a esta persona), sus avisos, su perfil y
 *     abrirlo en otra pestaña.
 *   · Con Chatwoot: el botón lo abre en otra pestaña.
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

const Trazo = ({ d, className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0", className)} aria-hidden>
    <path d={d} />
  </svg>
);
const ICONOS = {
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.3A8 8 0 1 1 21 12z",
  contacts: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
  reports: "M5 20V10m7 10V4m7 16v-7",
  campaigns: "M4 10v4l10 5V5L4 10zm14-1a4 4 0 010 6",
  help: "M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zm0 13a3 3 0 013-3h11",
  settings: "M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M8 14v6",
  avisos: "M6 17V11a6 6 0 0112 0v6l2 2H4l2-2zm4 4h4",
  perfil: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
  pestana: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  mas: "M5 12h.01M12 12h.01M19 12h.01",
};
// Cómo se llaman en el panel las secciones del chat.
const NOMBRES = { contacts: "Contactos", reports: "Reportes del chat", campaigns: "Campañas", help: "Centro de ayuda", settings: "Ajustes del chat" };

const Globo = ({ n, className }) =>
  n > 0 ? (
    <span className={cn("rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-[18px] text-white", className)}>{n > 99 ? "99+" : n}</span>
  ) : null;

export default function AbrirChat({ userId, compacta }) {
  const [activo, setActivo] = useState(atiende?.id === userId ? atiende.activo : false);
  const [abriendo, setAbriendo] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const enChat = usePathname() === "/chat";
  const info = useInfoChat();

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
    setMenu(false);
    setAbriendo(true);
    try {
      await abrirChatEnPestana();
    } catch (e) {
      setError(e.message);
    } finally {
      setAbriendo(false);
    }
  }

  function conversaciones() {
    if (!CHAT_EN_PANEL) return enPestana();
    mandarAlChat({ type: "atk-chat:navigate", route: "" });
    if (!enChat) router.push("/chat");
  }
  function seccion(route) {
    setMenu(false);
    mandarAlChat({ type: "atk-chat:navigate", route });
  }
  function panel(nombre) {
    setMenu(false);
    mandarAlChat({ type: "atk-chat:panel", panel: nombre });
  }

  if (!activo) return null;

  const texto = CHAT_EN_PANEL ? "Chat de atención" : "Abrir chat de atención";
  const sinLeer = info?.unread || 0;
  const avisos = info?.notifs || 0;
  // Dorado lleno solo cuando se está en las conversaciones.
  const enConversaciones = enChat && !info?.route;
  const boton = (
    <button
      onClick={conversaciones}
      disabled={abriendo && !CHAT_EN_PANEL}
      aria-label={sinLeer ? `${texto}, ${sinLeer} sin leer` : texto}
      aria-current={enConversaciones ? "page" : undefined}
      className={cn(
        "relative flex h-9 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-sm font-semibold ring-1 transition disabled:opacity-60",
        enConversaciones ? "bg-oro-500 text-marca-900 ring-oro-500" : "bg-oro-500/10 text-oro-300 ring-oro-500/25 hover:bg-oro-500/20",
        compacta && "lg:w-9 lg:flex-none lg:justify-center lg:px-0",
      )}
    >
      <Trazo d={ICONOS.chat} />
      <span className={cn("min-w-0 flex-1 truncate text-left", compacta && "lg:hidden")}>{abriendo && !CHAT_EN_PANEL ? "Abriendo…" : texto}</span>
      <Globo n={sinLeer} className={cn(compacta && "lg:absolute lg:-right-1.5 lg:-top-1.5")} />
    </button>
  );

  const secciones = (info?.nav || []).filter((n) => n.route && NOMBRES[n.route]);
  const opcion = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition hover:bg-muted";

  return (
    <div>
      <div className={cn("flex items-center gap-1", compacta && "lg:flex-col")}>
        {compacta ? (
          <Pista texto={texto} lado="right">
            {boton}
          </Pista>
        ) : (
          boton
        )}
        {CHAT_EN_PANEL && enChat && (
          <Popover.Root open={menu} onOpenChange={setMenu}>
            <Popover.Trigger asChild>
              <button
                aria-label={avisos ? `Más del chat, ${avisos} avisos sin leer` : "Más del chat"}
                title="Más del chat: contactos, reportes, ajustes y avisos"
                className={cn(
                  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/5 hover:text-white",
                  enChat && info?.route ? "bg-white/10 text-white" : "text-white/60",
                )}
              >
                <Trazo d={ICONOS.mas} className="h-5 w-5" />
                <Globo n={avisos} className="absolute -right-1.5 -top-1.5" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="right" align="end" sideOffset={8} className="z-50 w-[250px] rounded-xl border border-border bg-card p-1.5 text-foreground shadow-alzado">
                <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">Chat de atención</p>
                {secciones.map((n) => (
                  <button key={n.route} onClick={() => seccion(n.route)} className={cn(opcion, info?.route === n.route && "bg-muted")}>
                    <Trazo d={ICONOS[n.route]} className="h-4 w-4 text-muted-foreground" />
                    {NOMBRES[n.route]}
                  </button>
                ))}
                {secciones.length > 0 && <div className="my-1 border-t border-border" />}
                <button onClick={() => panel("notifs")} className={opcion}>
                  <Trazo d={ICONOS.avisos} className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Avisos del chat</span>
                  <Globo n={avisos} />
                </button>
                <button onClick={() => panel("user")} className={opcion}>
                  <Trazo d={ICONOS.perfil} className="h-4 w-4 text-muted-foreground" />
                  Mi perfil en el chat
                </button>
                <button onClick={enPestana} className={opcion}>
                  <Trazo d={ICONOS.pestana} className="h-4 w-4 text-muted-foreground" />
                  Abrir en otra pestaña
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
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
