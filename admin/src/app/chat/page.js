"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import Shell from "@/components/shell";
import { Aviso } from "@/components/marca";
import { BotonAccion, CargaPantalla, Rueda } from "@/components/carga";
import { CHAT_EN_PANEL, enlaceDelChat } from "@/components/abrirChat";

/**
 * El chat de atención dentro del panel: el asesor atiende sin salir de aquí.
 *
 * Solo con el chat propio (NEXT_PUBLIC_CHAT_URL): se pide un enlace de
 * entrada de un solo uso (/api/atencion/entrar, que comprueba la sesión y
 * que la persona tenga "Chat" en Equipo) y se carga en un marco. El chat
 * solo se deja incrustar desde este panel (PANEL_FRAME_ANCESTORS en su
 * servidor). Su sesión dura 12 horas; "Recargar" pide un enlace nuevo.
 */
export default function ChatPage() {
  const router = useRouter();
  const [session, setSession] = useState(sesionEnCache);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      setSession(s);
    });
  }, [router]);

  const entrar = useCallback(async () => {
    setError("");
    setCargando(true);
    setUrl(null);
    try {
      setUrl(await enlaceDelChat());
    } catch (e) {
      setError(e.message);
      setCargando(false);
    }
  }, []);

  const conSesion = Boolean(session);
  useEffect(() => {
    if (conSesion && CHAT_EN_PANEL) entrar();
  }, [conSesion, entrar]);

  async function otraPestana() {
    const pestana = window.open("", "atk-chat");
    if (pestana) pestana.opener = null;
    try {
      const enlace = await enlaceDelChat();
      if (pestana) pestana.location.href = enlace;
    } catch (e) {
      pestana?.close();
      setError(e.message);
    }
  }

  if (!session) return <CargaPantalla />;

  return (
    <Shell
      session={session}
      titulo="Chat de atención"
      descripcion="Conversaciones con clientes y visitantes"
      completo
      acciones={
        CHAT_EN_PANEL && (
          <>
            <BotonAccion tono="neutro" tamano="chico" onClick={entrar} disabled={cargando}>
              Recargar
            </BotonAccion>
            <BotonAccion tono="neutro" tamano="chico" onClick={otraPestana}>
              <span className="hidden sm:inline">Abrir en&nbsp;</span>otra pestaña
            </BotonAccion>
          </>
        )
      }
    >
      {!CHAT_EN_PANEL ? (
        <div className="p-5">
          <Aviso tono="info" titulo="El chat se abre en otra pestaña">
            Usa el botón «Abrir chat de atención» de la barra lateral.
          </Aviso>
        </div>
      ) : error ? (
        <div className="p-5">
          <Aviso
            titulo="No se pudo abrir el chat"
            accion={
              <button onClick={entrar} className="font-semibold underline">
                Reintentar
              </button>
            }
          >
            {error}
          </Aviso>
        </div>
      ) : (
        <div className="relative h-[calc(100dvh-60px)]">
          {cargando && (
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
              <Rueda /> Abriendo el chat…
            </div>
          )}
          {url && (
            <iframe
              key={url}
              src={url}
              title="Chat de atención"
              onLoad={() => setCargando(false)}
              // Sonido, portapapeles y pantalla completa para el chat.
              allow="autoplay; clipboard-read; clipboard-write; fullscreen"
              className="absolute inset-0 h-full w-full border-0"
            />
          )}
        </div>
      )}
    </Shell>
  );
}
