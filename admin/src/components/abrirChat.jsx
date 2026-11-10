"use client";

import { useEffect, useState } from "react";
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

export default function AbrirChat({ userId, compacta }) {
  const [activo, setActivo] = useState(atiende?.id === userId ? atiende.activo : false);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");

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
    if (!error) return;
    const t = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(t);
  }, [error]);

  async function abrir() {
    setError("");
    setAbriendo(true);
    // La pestaña se abre ya (en el mismo clic), si no el navegador la bloquea.
    const pestana = window.open("", "atk-chatwoot");
    if (pestana) pestana.opener = null; // Chatwoot no puede tocar esta página
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const r = await fetch("/api/atencion/entrar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || "No se pudo abrir el chat.");
      if (pestana) pestana.location.href = j.url;
      else window.location.href = j.url;
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
        "flex h-9 w-full items-center gap-3 rounded-lg bg-oro-500/10 px-3 text-sm font-semibold text-oro-300 ring-1 ring-oro-500/25 transition hover:bg-oro-500/20 disabled:opacity-60",
        compacta && "lg:w-9 lg:justify-center lg:px-0",
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.3A8 8 0 1 1 21 12z" />
      </svg>
      <span className={cn(compacta && "lg:hidden")}>{abriendo ? "Abriendo…" : "Abrir chat de atención"}</span>
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
