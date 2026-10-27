"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Reloj } from "@/components/shell";
import Paginador from "@/components/paginador";
import { EsqueletoFilas, BarraCarga, BotonAccion, CargaPantalla } from "@/components/carga";
import { Vacio, Aviso } from "@/components/marca";
import { Segmentos, Buscador, Barra, Leyenda } from "@/components/piezas";

const POR_PAGINA = 30;

/**
 * Color por familia de acción, no uno por cada nombre. Aprobar algo es
 * verde venga de donde venga, y así una acción nueva hereda su color
 * sin tener que tocar esta tabla.
 */
function tonoDe(accion = "") {
  if (/^APROBAR|^ACTIVAR|^DESBLOQUEAR|^CREAR_STAFF|^ACEPTA/.test(accion)) return "bg-emerald-50 text-emerald-700";
  if (/^RECHAZAR|^OBSERVAR|^BLOQUEAR|^DESACTIVAR|^QUITAR|^ELIMINAR|^RETIRA|^ANONIMIZAR/.test(accion)) return "bg-red-50 text-red-700";
  if (/^CREAR|^EDITAR|^CAMBIAR|^COMISION|^ASIGNAR|^PUBLICAR|^GUARDAR|^FIJAR/.test(accion)) return "bg-marca-100 text-marca-700";
  if (/PAGO|LOTE/.test(accion)) return "bg-oro-100 text-oro-700";
  return "bg-muted text-muted-foreground";
}

// Atajos para lo que más se busca. Filtran por una parte del nombre.
const FAMILIAS = [
  { clave: "", etiqueta: "Todo" },
  { clave: "APROBAR", etiqueta: "Aprobaciones" },
  { clave: "RECHAZAR", etiqueta: "Rechazos" },
  { clave: "BLOQUEAR", etiqueta: "Bloqueos" },
  { clave: "ROL", etiqueta: "Roles" },
  { clave: "COMISION", etiqueta: "Comisiones" },
  { clave: "PAGO", etiqueta: "Pagos" },
];

function fechaLarga(iso) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const hoyISO = (dias = 0) => {
  const d = new Date(Date.now() - dias * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Un valor del detalle, legible: listas separadas por comas, objetos en una línea. */
function valorLegible(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.map(valorLegible).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function AuditoriaPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [logs, setLogs] = useState([]);
  const [accion, setAccion] = useState("");
  const [familia, setFamilia] = useState("");
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

    // Lo escrito se busca con o sin guiones bajos: "cambiar rol" encuentra CAMBIAR_ROL.
    if (buscar) q = q.ilike("accion", `%${buscar.trim().replace(/\s+/g, "_")}%`);
    if (dia) {
      // El día en hora de Lima, no en UTC: si no, lo de la noche caía en el día siguiente.
      const desde = new Date(`${dia}T00:00:00`).toISOString();
      const hasta = new Date(`${dia}T23:59:59.999`).toISOString();
      q = q.gte("created_at", desde).lte("created_at", hasta);
    }

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

  const filtroAccion = termino || familia;

  useEffect(() => {
    if (!session) return;
    cargar(filtroAccion, fecha, pagina, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroAccion, fecha, pagina]);

  useEffect(() => {
    setPagina(0);
  }, [filtroAccion, fecha]);

  if (!session) return <CargaPantalla />;

  const hayFiltro = accion || fecha || familia;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Auditoría"
      descripcion={primeraCarga ? "Cargando..." : `${total} ${total === 1 ? "acción registrada" : "acciones registradas"}${hayFiltro ? " con el filtro" : ""}`}
      ayuda="Todo lo que hace el equipo queda registrado aquí con su nombre y la hora. No se puede borrar ni editar. Pulsa una fila para ver qué cambió."
    >
      <BarraCarga activa={refrescando} />

      {error && (
        <Aviso className="mb-4 animate-aparecer" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={familia}
          onCambio={(v) => {
            setFamilia(v);
            setAccion("");
          }}
          tamano="chico"
          opciones={FAMILIAS}
        />
      </Barra>
      <Barra>
        <Buscador
          valor={accion}
          onCambio={(v) => {
            setAccion(v);
            if (v) setFamilia("");
          }}
          pendiente={accion !== termino}
          placeholder="Buscar una acción: cambiar rol, bloque, guía..."
          className="w-full sm:w-80"
        />
        <input
          id="fecha"
          type="date"
          aria-label="Filtrar por día"
          value={fecha}
          max={hoyISO()}
          onChange={(e) => setFecha(e.target.value)}
          className="campo cifras h-10 w-auto"
        />
        <BotonAccion tono={fecha === hoyISO() ? "primario" : "neutro"} tamano="chico" onClick={() => setFecha(hoyISO())}>
          Hoy
        </BotonAccion>
        <BotonAccion tono={fecha === hoyISO(1) ? "primario" : "neutro"} tamano="chico" onClick={() => setFecha(hoyISO(1))}>
          Ayer
        </BotonAccion>
        {hayFiltro && (
          <BotonAccion
            tono="suave"
            tamano="chico"
            onClick={() => {
              setAccion("");
              setFecha("");
              setFamilia("");
            }}
          >
            Limpiar filtros
          </BotonAccion>
        )}
      </Barra>

      {primeraCarga ? (
        <EsqueletoFilas filas={10} alto="h-[52px]" />
      ) : logs.length === 0 ? (
        <Vacio
          icono={<Reloj />}
          titulo={hayFiltro ? "Sin coincidencias" : "Sin registros"}
          detalle={hayFiltro ? "Ninguna acción coincide con el filtro." : "Todavía no se ha registrado ninguna acción."}
        />
      ) : (
        <>
          <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-panel transition-opacity", refrescando && "opacity-60")}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-4 py-2.5 t-etiqueta">Acción</th>
                    <th className="px-4 py-2.5 t-etiqueta">Quién</th>
                    <th className="px-4 py-2.5 t-etiqueta">Sobre</th>
                    <th className="px-4 py-2.5 t-etiqueta">Cuándo</th>
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((l) => {
                    const expandido = abierto === l.id;
                    const tieneDetalle = l.datos_antes || l.datos_despues;
                    const claves = [...new Set([...Object.keys(l.datos_antes || {}), ...Object.keys(l.datos_despues || {})])];
                    return (
                      <Fragment key={l.id}>
                        <tr
                          onClick={() => tieneDetalle && setAbierto(expandido ? null : l.id)}
                          className={cn("transition", tieneDetalle ? "cursor-pointer hover:bg-muted/40" : "", expandido && "bg-muted/40")}
                        >
                          <td className="px-4 py-2.5">
                            <span className={cn("inline-block rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide", tonoDe(l.accion))}>
                              {l.accion.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="max-w-[240px] truncate px-4 py-2.5 font-semibold">{l.users?.email || "Sistema"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{(l.entidad || "").replace(/_/g, " ")}</td>
                          <td className="cifras whitespace-nowrap px-4 py-2.5 text-muted-foreground">{fechaLarga(l.created_at)}</td>
                          <td className="px-2 py-2.5">
                            {tieneDetalle && (
                              <button
                                aria-label={expandido ? "Ocultar el detalle" : "Ver el detalle"}
                                aria-expanded={expandido}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-card"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  className={cn("h-4 w-4 transition-transform", expandido && "rotate-180")}
                                >
                                  <path d="m6 9 6 6 6-6" />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandido && (
                          <tr className="bg-muted/30">
                            <td colSpan={5} className="px-4 py-3">
                              <table className="w-full max-w-3xl text-chico">
                                <thead>
                                  <tr className="text-left">
                                    <th className="w-1/4 pb-1 t-etiqueta">Dato</th>
                                    {l.datos_antes && <th className="pb-1 t-etiqueta">Antes</th>}
                                    <th className="pb-1 t-etiqueta">{l.datos_antes ? "Después" : "Valor"}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {claves.map((k) => {
                                    const antes = l.datos_antes?.[k];
                                    const despues = l.datos_despues?.[k];
                                    const cambio = l.datos_antes && JSON.stringify(antes) !== JSON.stringify(despues);
                                    return (
                                      <tr key={k} className="border-t border-border/70 align-top">
                                        <td className="py-1.5 pr-3 font-semibold text-muted-foreground">{k.replace(/_/g, " ")}</td>
                                        {l.datos_antes && <td className="cifras break-all py-1.5 pr-3 text-muted-foreground line-through decoration-red-300">{cambio ? valorLegible(antes) : ""}</td>}
                                        <td className={cn("cifras break-all py-1.5 font-semibold", cambio && "text-emerald-700")}>{valorLegible(despues ?? (l.datos_antes ? undefined : antes))}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-4 py-2.5">
              <Leyenda
                items={[
                  { texto: "Aprobar o activar", color: "bg-emerald-500" },
                  { texto: "Rechazar, bloquear o quitar", color: "bg-red-500" },
                  { texto: "Crear o cambiar", color: "bg-marca-500" },
                  { texto: "Pagos", color: "bg-oro-500" },
                ]}
              />
            </div>
          </div>

          <Paginador pagina={pagina} porPagina={POR_PAGINA} total={total} cargando={refrescando} onCambio={setPagina} />
        </>
      )}
    </Shell>
  );
}
