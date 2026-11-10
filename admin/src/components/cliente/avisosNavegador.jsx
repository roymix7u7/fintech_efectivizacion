"use client";

import { useEffect, useState } from "react";
import { activarAvisos, avisosPosibles, permisoAvisos, renovarAvisos, yaAcepto } from "@/lib/avisosNavegador";

/**
 * "¿Te avisamos cuando tu asesor responda?" (lib/avisosNavegador.js).
 *
 * Sale cuando el cliente cierra el chat después de usarlo: es justo
 * cuando le sirve, y así no tapa el chat abierto (que en el celular ocupa
 * toda la pantalla). Nunca al entrar a la página, que es cuando la gente
 * bloquea los avisos sin leer.
 *
 * "Ahora no" lo calla 14 días. Si este cliente ya los aceptó aquí, solo se
 * renueva el registro en silencio.
 */
const LUEGO = (userId) => `atk-avisos-luego:${userId}`;
const DIAS_LUEGO = 14;

function calladoHasta(userId) {
  try {
    return Number(localStorage.getItem(LUEGO(userId)) || 0);
  } catch {
    return 0;
  }
}

export default function AvisosNavegador({ sb, usuarioId }) {
  const [visible, setVisible] = useState(false);
  const [paso, setPaso] = useState("pregunta"); // pregunta | activando | listo | bloqueado
  const [error, setError] = useState("");

  // Si ya los aceptó en este navegador, se vuelve a asociar a su cuenta.
  useEffect(() => {
    if (usuarioId) renovarAvisos(sb, usuarioId);
  }, [sb, usuarioId]);

  useEffect(() => {
    if (!usuarioId || !avisosPosibles()) return;
    let uso = false;
    const usar = () => {
      uso = true;
    };
    const alCerrar = () => {
      if (!uso) return;
      const permiso = permisoAvisos();
      const pendiente = permiso === "default" || (permiso === "granted" && !yaAcepto(usuarioId));
      if (pendiente && Date.now() > calladoHasta(usuarioId)) setVisible(true);
    };
    window.addEventListener("chatwoot:opened", usar);
    window.addEventListener("chatwoot:on-start-conversation", usar);
    window.addEventListener("chatwoot:closed", alCerrar);
    return () => {
      window.removeEventListener("chatwoot:opened", usar);
      window.removeEventListener("chatwoot:on-start-conversation", usar);
      window.removeEventListener("chatwoot:closed", alCerrar);
    };
  }, [usuarioId]);

  function ahoraNo() {
    try {
      localStorage.setItem(LUEGO(usuarioId), String(Date.now() + DIAS_LUEGO * 86_400_000));
    } catch {}
    setVisible(false);
  }

  async function activar() {
    setError("");
    setPaso("activando");
    try {
      const r = await activarAvisos(sb, usuarioId);
      if (r === "granted") {
        setPaso("listo");
        setTimeout(() => setVisible(false), 4000);
      } else {
        setPaso("bloqueado");
      }
    } catch (e) {
      setError(e.message || "No pudimos activar los avisos.");
      setPaso("pregunta");
    }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Avisos del chat"
      className="fixed right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-marca-100 bg-white p-4 text-marca-900 shadow-[0_18px_50px_rgba(15,27,51,0.25)] bottom-[calc(150px+env(safe-area-inset-bottom))] lg:bottom-24"
    >
      {paso === "listo" ? (
        <p className="text-sm font-semibold">Listo. Te avisaremos cuando tu asesor responda.</p>
      ) : paso === "bloqueado" ? (
        <>
          <p className="text-sm font-semibold">Los avisos están bloqueados en este navegador.</p>
          <p className="mt-1 text-xs text-marca-600">
            Para activarlos, toca el candado junto a la dirección de la página → Notificaciones → Permitir.
          </p>
          <button onClick={() => setVisible(false)} className="mt-3 text-sm font-semibold underline">
            Entendido
          </button>
        </>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-oro-100 text-oro-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">¿Te avisamos cuando tu asesor responda?</p>
              <p className="mt-0.5 text-xs text-marca-600">
                Te llegará una notificación aunque cierres esta página.
              </p>
            </div>
          </div>
          {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={activar}
              disabled={paso === "activando"}
              className="flex-1 rounded-full bg-marca-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-70"
            >
              {paso === "activando" ? "Activando…" : "Sí, avísame"}
            </button>
            <button onClick={ahoraNo} className="rounded-full px-4 py-2 text-sm font-semibold text-marca-600 hover:bg-marca-50">
              Ahora no
            </button>
          </div>
        </>
      )}
    </div>
  );
}
