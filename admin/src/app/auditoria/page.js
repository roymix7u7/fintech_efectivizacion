"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Reloj } from "@/components/shell";
import Paginador from "@/components/paginador";
import { EsqueletoFilas, BarraCarga, Esqueleto } from "@/components/carga";
import { Vacio, Aviso } from "@/components/marca";

const POR_PAGINA = 30;

/**
 * Color por familia de acción, no uno por cada nombre. Aprobar algo es
 * verde venga de donde venga, y así una acción nueva hereda su color
 * sin tener que tocar esta tabla.
 */
function tonoDe(accion = "") {
  if (/^APROBAR|^ACTIVAR|^DESBLOQUEAR|^CREAR_STAFF/.test(accion))
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (/^RECHAZAR|^OBSERVAR|^BLOQUEAR|^DESACTIVAR|^QUITAR/.test(accion))
    return "bg-red-50 text-red-700 ring-red-200";
  if (/^CREAR|^EDITAR|^CAMBIAR|^COMISION/.test(accion))
    return "bg-marca-50 text-marca-700 ring-marca-200";
  return "bg-muted text-muted-foreground ring-border";
}

function fechaLarga(iso) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditoriaPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [logs, setLogs] = useState([]);
  const [accion, setAccion] = useState("");
  const [fecha, setFecha] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState("");
  const [contadores, setContadores] = useState({});
  const [abierto, setAbierto] = useState(null);
  const router = useRouter();

  const termino = useRetraso(accion, 350);
  const peticion = useRef(0);

  const cargar = useCallback(async (buscar, dia, pag, silencioso) => {
    const mia = ++peticion.current;
    if (silencioso) setRefrescando(true);
    else setPrimeraCarga(true);
    setError("");

    // El historial de auditoría no se borra nunca, así que se pide
    // una página a la vez y el conteo lo calcula el servidor.
    let q = supabase
      .from("auditoria_logs")
      .select("*, users(email)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1);

    if (buscar) q = q.ilike("accion", `%${buscar}%`);
    if (dia) q = q.gte("created_at", dia).lte("created_at", dia + "T23:59:59");

    const { data, count, error: consultaError } = await q;
    if (mia !== peticion.current) return;

    if (consultaError) {
      setError(explicarError(consultaError, "No se pudo cargar la auditoría."));
      setLogs([]);
      setTotal(0);
    } else {
      setLogs(data || []);
      setTotal(count || 0);
    }
    setPrimeraCarga(false);
    setRefrescando(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargar("", "", 0, false);
      estadoCola().then(({ colas }) => setContadores(contadoresDe(colas)));
    });
  }, [router, cargar]);

  useEffect(() => {
    if (!session) return;
    cargar(termino, fecha, pagina, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termino, fecha, pagina]);

  useEffect(() => {
    setPagina(0);
  }, [termino, fecha]);

  if (!session) return null;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Auditoría"
      descripcion={
        primeraCarga
          ? "Cargando..."
          : `${total} ${total === 1 ? "acción registrada" : "acciones registradas"}`
      }
    >
      <BarraCarga activa={refrescando} />

      {error && (
        <div className="mb-5 animate-aparecer">
          <Aviso onCerrar={() => setError("")}>{error}</Aviso>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            placeholder="Tipo de acción: aprobar, comision, rol..."
            className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-9 text-[0.9333rem] outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
          />
          {accion !== termino && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Esqueleto className="h-3 w-3 rounded-full" />
            </span>
          )}
        </div>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="cifras rounded-lg border border-input bg-card px-3 py-2.5 text-[0.9333rem] outline-none focus:border-marca-500"
        />
        {(accion || fecha) && (
          <button
            onClick={() => {
              setAccion("");
              setFecha("");
            }}
            className="pulsable rounded-lg border border-border px-3 py-2.5 text-[0.8667rem] font-medium text-muted-foreground hover:bg-muted"
          >
            Limpiar
          </button>
        )}
      </div>

      {primeraCarga ? (
        <EsqueletoFilas filas={10} alto="h-[56px]" />
      ) : logs.length === 0 ? (
        <Vacio
          icono={<Reloj className="h-5 w-5" />}
          titulo={accion || fecha ? "Sin coincidencias" : "Sin registros"}
          detalle={
            accion || fecha
              ? "Ninguna acción coincide con el filtro."
              : "Todavía no se ha registrado ninguna acción."
          }
        />
      ) : (
        <>
          <div
            className={cn(
              "overflow-hidden rounded-xl border border-border bg-card shadow-panel transition-opacity",
              refrescando && "opacity-60",
            )}
          >
            <ul className="divide-y divide-border">
              {logs.map((l, i) => {
                const expandido = abierto === l.id;
                const tieneDetalle = l.datos_antes || l.datos_despues;
                return (
                  <li
                    key={l.id}
                    className="entra"
                    style={{ "--retraso": `${Math.min(i, 16) * 22}ms` }}
                  >
                    <button
                      onClick={() =>
                        setAbierto(expandido ? null : tieneDetalle ? l.id : null)
                      }
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                        tieneDetalle ? "hover:bg-muted/40" : "cursor-default",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-1 text-[0.7333rem] font-semibold uppercase tracking-wide ring-1 ring-inset",
                          tonoDe(l.accion),
                        )}
                      >
                        {l.accion.replace(/_/g, " ")}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8667rem] font-medium">
                          {l.users?.email || "Sistema"}
                        </p>
                        <p className="t-micro truncate">{l.entidad}</p>
                      </div>

                      <span className="cifras hidden shrink-0 text-[0.8rem] text-muted-foreground sm:block">
                        {fechaLarga(l.created_at)}
                      </span>

                      {tieneDetalle && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            expandido && "rotate-180",
                          )}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      )}
                    </button>

                    {expandido && (
                      <div className="animate-aparecer border-t border-border bg-muted/30 px-4 py-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[
                            { t: "Antes", d: l.datos_antes },
                            { t: "Después", d: l.datos_despues },
                          ]
                            .filter((x) => x.d)
                            .map((x) => (
                              <div key={x.t}>
                                <p className="t-etiqueta mb-1">{x.t}</p>
                                <pre className="cifras scroll-fino overflow-x-auto rounded-md border border-border bg-card p-2.5 font-mono text-[0.7333rem] leading-relaxed">
                                  {JSON.stringify(x.d, null, 2)}
                                </pre>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <Paginador
            pagina={pagina}
            porPagina={POR_PAGINA}
            total={total}
            cargando={refrescando}
            onCambio={setPagina}
          />
        </>
      )}
    </Shell>
  );
}
