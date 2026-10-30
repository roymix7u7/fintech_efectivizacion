"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Campana de Mis avisos, en el encabezado de Mi cuenta. Los avisos los
 * carga el contexto (contexto.jsx) y los refresca Mi cuenta al llegar
 * novedades.
 */
const fecha = (f) =>
  f
    ? new Date(f).toLocaleString("es-PE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

/** Color e ícono del aviso, con la misma regla que la app (notificaciones.js). */
function estiloAviso(a) {
  const t = `${a.titulo || ""} ${a.cuerpo || ""}`.toLowerCase();
  if (/rechaz|observ|bloque/.test(t))
    return {
      icono: "M18 6 6 18M6 6l12 12",
      clase: "bg-[#FBDADA] text-red-700",
    };
  if (/pag|deposit/.test(t))
    return {
      icono: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
      clase: "bg-[#D5F2E3] text-emerald-700",
    };
  if (/aprob|verificad|activ/.test(t))
    return { icono: "M20 6 9 17l-5-5", clase: "bg-[#FCEFC7] text-[#6E5300]" };
  return {
    icono: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    clase: "bg-[#DCE6F7] text-[#1E3A8A]",
  };
}

const haceCuanto = (iso) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "Ahora";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  if (h < 48) return "Ayer";
  return fecha(iso);
};

/**
 * Campana con lo que el equipo le respondió al cliente (identidad,
 * tarjetas, solicitudes, pagos). Cada aviso se marca como leído al
 * abrirlo, como en la app: abrir la lista no basta para decir que se
 * leyó todo.
 */
export default function MisAvisos({ sb, avisos }) {
  const [abierto, setAbierto] = useState(false);
  const [expandido, setExpandido] = useState(null);
  const [leidos, setLeidos] = useState([]);
  const lista = avisos.map((a) =>
    leidos.includes(a.id) ? { ...a, leida: true } : a,
  );
  const sinLeer = lista.filter((a) => !a.leida).length;

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [abierto]);

  async function leer(a) {
    setExpandido(expandido === a.id ? null : a.id);
    if (a.leida) return;
    setLeidos((l) => [...l, a.id]);
    await sb.from("notificaciones").update({ leida: true }).eq("id", a.id);
  }

  async function leerTodos() {
    const ids = lista.filter((a) => !a.leida).map((a) => a.id);
    if (!ids.length) return;
    setLeidos((l) => [...l, ...ids]);
    await sb.from("notificaciones").update({ leida: true }).in("id", ids);
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        aria-label={sinLeer ? `Mis avisos, ${sinLeer} sin leer` : "Mis avisos"}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/15"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {sinLeer > 0 && (
          <span className="cifras absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[0.7rem] font-bold text-white ring-2 ring-[#0B1426]">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      {abierto &&
        createPortal(
          <div
            className="fixed inset-0 z-[75] flex justify-end bg-[#0B1426]/60"
            onClick={() => setAbierto(false)}
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="avisos-titulo"
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-md flex-col bg-[#EEF2F8] text-marca-900 shadow-2xl"
            >
              <header className="flex items-center gap-3 bg-[#0B1426] px-5 py-4 text-white">
                <h2 id="avisos-titulo" className="font-heading text-lg">
                  Mis avisos
                </h2>
                {sinLeer > 0 && (
                  <span className="cifras rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold">
                    {sinLeer} sin leer
                  </span>
                )}
                <button
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </header>
              {sinLeer > 0 && (
                <div className="flex justify-end px-5 pt-3">
                  <button
                    onClick={leerTodos}
                    className="shrink-0 whitespace-nowrap rounded-full bg-[#E6ECF5] px-3.5 py-1.5 text-chico font-semibold text-marca-900 transition hover:bg-[#D8E0EC]"
                  >
                    Marcar todo como leído
                  </button>
                </div>
              )}
              <div className="scroll-fino flex-1 overflow-y-auto px-4 py-3">
                {lista.length === 0 ? (
                  <div className="rounded-2xl bg-[#E9EEF6] px-6 py-10 text-center">
                    <p className="font-semibold">Sin avisos por ahora</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-[#4F5B74]">
                      Aquí te contamos cuando revisemos tu identidad, tus
                      tarjetas o tus solicitudes.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {lista.map((a) => {
                      const e = estiloAviso(a);
                      return (
                        <li key={a.id}>
                          <button
                            onClick={() => leer(a)}
                            aria-expanded={expandido === a.id}
                            className={cn(
                              "flex w-full gap-3 rounded-2xl p-3 text-left ring-1 transition",
                              a.leida
                                ? "bg-white/60 ring-[#E3E9F2]"
                                : "bg-white ring-[#C9D6EC]",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                                e.clase,
                              )}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                                aria-hidden
                              >
                                <path d={e.icono} />
                              </svg>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start gap-2">
                                <span
                                  className={cn(
                                    "flex-1 text-sm",
                                    a.leida
                                      ? "font-medium text-[#3D4A63]"
                                      : "font-bold",
                                  )}
                                >
                                  {a.titulo}
                                </span>
                                {!a.leida && (
                                  <span
                                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600"
                                    aria-label="Sin leer"
                                  />
                                )}
                              </span>
                              {a.cuerpo && (
                                <span
                                  className={cn(
                                    "mt-0.5 block text-sm text-[#4F5B74]",
                                    expandido !== a.id && "line-clamp-2",
                                  )}
                                >
                                  {a.cuerpo}
                                </span>
                              )}
                              <span className="mt-1 block text-chico text-[#8A93A6]">
                                {haceCuanto(a.created_at)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>
          </div>,
          // Fuera del encabezado: dentro de él quedaría recortado.
          document.body,
        )}
    </>
  );
}
