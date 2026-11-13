"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import Shell from "@/components/shell";
import { Aviso } from "@/components/marca";
import { CargaPantalla, Rueda } from "@/components/carga";
import { CHAT_EN_PANEL } from "@/lib/chatPanel";
import { HUECO, useEstadoChat } from "@/components/chatIncrustado";

/**
 * El chat de atención dentro del panel: el asesor atiende sin salir de aquí.
 *
 * Esta pantalla solo deja el hueco: el chat vive en
 * components/chatIncrustado.jsx (en app/layout.js), cargado una vez y
 * conectado en tiempo real, así que al volver de otra sección aparece al
 * instante. Para darle sitio, la barra del panel se pliega y no hay franja
 * de título (en el celular queda, por el botón del menú).
 *
 * Solo con el chat propio (NEXT_PUBLIC_CHAT_URL). "Abrir en otra pestaña"
 * está junto al botón dorado de la barra (components/abrirChat.jsx).
 */
export default function ChatPage() {
  const router = useRouter();
  const [session, setSession] = useState(sesionEnCache);
  const { cargando, error, reintentar } = useEstadoChat();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      setSession(s);
    });
  }, [router]);

  if (!session) return <CargaPantalla />;

  return (
    <Shell session={session} titulo="Chat de atención" completo barraPlegada encabezadoSoloMovil>
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
              <button onClick={reintentar} className="font-semibold underline">
                Reintentar
              </button>
            }
          >
            {error}
          </Aviso>
        </div>
      ) : (
        <div id={HUECO} className="flex h-[calc(100dvh-60px)] items-center justify-center gap-3 bg-background text-sm text-muted-foreground lg:h-[100dvh]">
          {cargando && (
            <>
              <Rueda /> Abriendo el chat…
            </>
          )}
        </div>
      )}
    </Shell>
  );
}
