"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PERIODOS, DIAS, duracion } from "@/lib/atencion";
import { cn } from "@/lib/utils";
import Shell from "@/components/shell";
import { Aviso, Vacio } from "@/components/marca";
import { Panel, Segmentos } from "@/components/piezas";

/**
 * Atención al cliente: los chats de Chatwoot de una sede.
 *
 * El supervisor ve solo la suya (la decide el servidor, no esta página);
 * el administrador elige la sede o todas. Los números los arma
 * /api/atencion, que habla con Chatwoot sin exponer su clave.
 */
const ROLES = ["admin", "supervisor"];
const CADA_MS = 60_000;

const ESTADO_ASESOR = {
  online: { texto: "En línea", punto: "bg-emerald-500" },
  busy: { texto: "Ocupado", punto: "bg-oro-500" },
  offline: { texto: "Desconectado", punto: "bg-muted-foreground/40" },
};

const hace = (seg) => {
  if (!seg) return "";
  const min = Math.max(1, Math.round((Date.now() / 1000 - seg) / 60));
  return min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} d`;
};

export default function AtencionPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [periodo, setPeriodo] = useState("hoy");
  const [sede, setSede] = useState("todas");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!ROLES.includes(s.rol)) return router.push("/dashboard");
      setSession(s);
    });
  }, [router]);

  const cargar = useCallback(async () => {
    const {
      data: { session: sb },
    } = await supabase.auth.getSession();
    if (!sb) return router.push("/login");
    setCargando(true);
    try {
      const r = await fetch(`/api/atencion?periodo=${periodo}&sede=${encodeURIComponent(sede)}`, {
        headers: { Authorization: `Bearer ${sb.access_token}` },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo cargar el reporte.");
      setDatos(j);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [periodo, sede, router]);

  useEffect(() => {
    if (!session || !ROLES.includes(session.rol)) return;
    cargar();
    const t = setInterval(cargar, CADA_MS);
    return () => clearInterval(t);
  }, [session, cargar]);

  if (!session) return null;

  const r = datos?.resumen;
  const nombreSede = datos?.sede?.nombre || (datos ? "Todas las sedes" : "");
  const periodoTexto = PERIODOS.find((p) => p.clave === periodo)?.etiqueta.toLowerCase();
  const atencion = datos?.atencion;
  const pendientes =
    (atencion?.paraSupervisor.length || 0) + (atencion?.reclamosUrgentes.length || 0) + (atencion?.calificacionesBajas.length || 0);

  return (
    <Shell
      session={session}
      titulo="Atención al cliente"
      descripcion={nombreSede ? `${nombreSede} · ${periodoTexto}` : "Chats de la web y el app"}
      ayuda="Los chats de Chatwoot de tu sede: cuánto se atendió, qué tan rápido, cómo calificaron los clientes y qué necesita tu atención. Se actualiza cada minuto."
      acciones={
        datos?.chatwoot && (
          <a
            href={datos.chatwoot}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted"
          >
            Abrir Chatwoot
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </a>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmentos opciones={PERIODOS} valor={periodo} onCambio={setPeriodo} />
        {datos?.sedes && (
          <Segmentos
            opciones={[{ clave: "todas", etiqueta: "Todas" }, ...datos.sedes.map((s) => ({ clave: s.id, etiqueta: s.nombre }))]}
            valor={sede}
            onCambio={setSede}
          />
        )}
        {cargando && datos && <span className="text-xs text-muted-foreground">Actualizando…</span>}
      </div>

      {error && (
        <Aviso className="mb-4" titulo="No se pudo cargar el reporte" accion={<button onClick={cargar} className="font-semibold underline">Reintentar</button>}>
          {error}
        </Aviso>
      )}

      {!datos && cargando && <Esqueleto />}

      {datos && (
        <div className="space-y-4">
          {/* ── Resumen ── */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Cifra titulo="Chats atendidos" valor={r.atendidas} detalle={`${r.resueltas} resueltos`} />
            <Cifra titulo="Abiertos ahora" valor={r.abiertas} />
            <Cifra
              titulo="En cola"
              valor={r.enCola}
              detalle="Sin asesor · todas"
              alerta={r.enCola > 0}
            />
            <Cifra titulo="1.ª respuesta" valor={duracion(r.primeraRespuesta)} detalle="Promedio" />
            <Cifra titulo="Resolución" valor={duracion(r.resolucion)} detalle="Promedio" />
            <Cifra
              titulo="Satisfacción"
              valor={r.satisfaccion.promedio != null ? `${r.satisfaccion.promedio.toLocaleString("es-PE")} / 5` : null}
              detalle={
                r.satisfaccion.respuestas
                  ? `${r.satisfaccion.contentos} % contentos (${r.satisfaccion.respuestas})`
                  : "Sin encuestas"
              }
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            {/* ── Asesores ── */}
            <Panel titulo={`Asesores · ${nombreSede}`} cuerpo="p-0">
              {datos.asesores.length === 0 ? (
                <div className="p-4">
                  <Vacio
                    titulo="Sin asesores en esta sede"
                    detalle="Ningún asesor de Chatwoot tiene esta sede todavía. Agrega sus correos en SEDES (soporte/chatwoot/configurar.rb) y corre el script."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="whitespace-nowrap border-b border-border text-left text-xs font-semibold text-muted-foreground">
                        <th className="px-4 py-2.5">Asesor</th>
                        <th className="px-3 py-2.5 text-right">Chats</th>
                        <th className="px-3 py-2.5 text-right">1.ª respuesta</th>
                        <th className="px-3 py-2.5 text-right">Resolución</th>
                        <th className="px-4 py-2.5 text-right">Satisfacción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {datos.asesores.map((a) => {
                        const e = ESTADO_ASESOR[a.estado] || ESTADO_ASESOR.offline;
                        const bajo = a.satisfaccion.promedio != null && a.satisfaccion.promedio < 4;
                        return (
                          <tr key={a.id}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className={cn("h-2 w-2 shrink-0 rounded-full", e.punto)} title={e.texto} />
                                <span className="whitespace-nowrap font-semibold">{a.nombre}</span>
                                {a.jefe && <span className="rounded-full bg-marca-100 px-2 py-0.5 text-[11px] font-bold text-marca-700">Jefe</span>}
                              </div>
                              <span className="ml-4 text-xs text-muted-foreground">
                                {e.texto}
                                {!a.confirmado && <span className="font-semibold text-oro-700"> · sin aceptar invitación</span>}
                              </span>
                            </td>
                            <td className="cifras px-3 py-2.5 text-right">
                              {a.atendidas}
                              <span className="block whitespace-nowrap text-xs text-muted-foreground">{a.resueltas} resueltos</span>
                            </td>
                            <td className="cifras px-3 py-2.5 text-right">{duracion(a.primeraRespuesta) || "—"}</td>
                            <td className="cifras px-3 py-2.5 text-right">{duracion(a.resolucion) || "—"}</td>
                            <td className={cn("cifras px-4 py-2.5 text-right", bajo && "font-semibold text-red-700")}>
                              {a.satisfaccion.promedio != null ? `${a.satisfaccion.promedio.toLocaleString("es-PE")} ★` : "—"}
                              {a.satisfaccion.respuestas > 0 && (
                                <span className="block text-xs font-normal text-muted-foreground">{a.satisfaccion.respuestas} enc.</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {/* ── Requiere atención ── */}
            <Panel
              titulo="Requiere tu atención"
              tono={pendientes > 0 ? "atencion" : undefined}
              acciones={<span className="cifras text-xs font-semibold text-muted-foreground">{pendientes}</span>}
              cuerpo="p-0"
            >
              {pendientes === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Todo en orden: nada pendiente para ti.</p>
              ) : (
                <div className="divide-y divide-border">
                  <Lista
                    titulo="Pidieron supervisor"
                    items={atencion.paraSupervisor}
                    render={(c) => (
                      <>
                        <span className="font-semibold">{c.cliente}</span>
                        <span className="text-muted-foreground"> · #{c.id}{c.asesor ? ` · ${c.asesor}` : " · sin asesor"}</span>
                        <span className="block text-xs text-muted-foreground">Esperando {hace(c.desde).replace("hace ", "")}</span>
                      </>
                    )}
                  />
                  <Lista
                    titulo="Reclamos urgentes abiertos"
                    tono="error"
                    items={atencion.reclamosUrgentes}
                    render={(c) => (
                      <>
                        <span className="font-semibold">{c.cliente}</span>
                        <span className="text-muted-foreground"> · #{c.id}{c.asesor ? ` · ${c.asesor}` : " · sin asesor"}</span>
                        <span className="block text-xs text-muted-foreground">Último movimiento {hace(c.desde)}</span>
                      </>
                    )}
                  />
                  <Lista
                    titulo="Calificaciones bajas"
                    items={atencion.calificacionesBajas}
                    render={(c) => (
                      <>
                        <span className="font-semibold text-red-700">{"★".repeat(c.nota)}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {c.cliente}
                          {c.asesor ? ` · atendió ${c.asesor}` : ""} · {hace(c.fecha)}
                        </span>
                        {c.comentario && <span className="mt-0.5 block text-xs italic text-foreground">“{c.comentario}”</span>}
                      </>
                    )}
                  />
                </div>
              )}
            </Panel>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[1fr_1.7fr]">
            <Motivos motivos={datos.motivos} />
            <div className="min-w-0 space-y-4">
              <HorasPico horas={datos.horas} />
              <Negocio negocio={datos.negocio} />
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Por qué escriben: el "Motivo de contacto" que marca el asesor. */
function Motivos({ motivos }) {
  const max = Math.max(1, ...motivos.lista.map((m) => m.total));
  const marcados = motivos.total - motivos.sinMotivo;
  return (
    <Panel
      titulo="Por qué escriben"
      acciones={
        <span className="text-xs text-muted-foreground">
          {motivos.total ? `${marcados} de ${motivos.total} con motivo` : ""}
        </span>
      }
    >
      {motivos.lista.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          {motivos.total ? "Los asesores todavía no marcaron el motivo de ningún chat." : "Sin chats en este periodo."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {motivos.lista.map((m) => (
            <li key={m.motivo}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{m.motivo}</span>
                <span className="cifras shrink-0 text-muted-foreground">
                  {m.total} · {Math.round((m.total / marcados) * 100)} %
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-marca-600" style={{ width: `${(m.total / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {motivos.sinMotivo > 0 && motivos.lista.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {motivos.sinMotivo} {motivos.sinMotivo === 1 ? "chat quedó" : "chats quedaron"} sin motivo: recuerda a tu equipo marcarlo antes de resolver.
        </p>
      )}
    </Panel>
  );
}

/** Qué pasó después del chat: si el cliente terminó haciendo una solicitud. */
function Negocio({ negocio }) {
  const pct = negocio.clientes ? Math.round((negocio.conSolicitud / negocio.clientes) * 100) : null;
  return (
    <Panel titulo="Después del chat">
      <div className="flex items-end gap-3">
        <p className="cifras font-heading text-3xl font-semibold leading-none">{negocio.conSolicitud}</p>
        <p className="pb-0.5 text-sm text-muted-foreground">
          de {negocio.clientes} {negocio.clientes === 1 ? "cliente" : "clientes"} hicieron una solicitud
          {pct != null && <span className="font-semibold text-foreground"> ({pct} %)</span>}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Solicitudes enviadas hasta {negocio.dias} días después de su primer chat del periodo. Solo cuenta a quien escribió con su cuenta.
        {negocio.muestra && ` Calculado sobre los ${negocio.chats} chats más recientes.`}
      </p>
    </Panel>
  );
}

/** Mapa de calor día × hora (hora de Lima) de los chats que entraron. */
function HorasPico({ horas }) {
  const { celdas } = horas;
  const max = Math.max(0, ...celdas.flat());
  // Se muestran de 7:00 a 22:00; lo de madrugada se suma al borde.
  const desde = 7;
  const hasta = 22;
  const cols = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const valor = (dia, h) =>
    h === desde ? celdas[dia].slice(0, desde + 1).reduce((a, b) => a + b, 0) : h === hasta ? celdas[dia].slice(hasta).reduce((a, b) => a + b, 0) : celdas[dia][h];

  const picos = [];
  celdas.forEach((fila, d) => fila.forEach((n, h) => n > 0 && picos.push({ d, h, n })));
  picos.sort((a, b) => b.n - a.n);

  const tono = (n) => {
    if (!n || !max) return "bg-muted";
    const r = n / max;
    return r > 0.75 ? "bg-marca-900" : r > 0.5 ? "bg-marca-700" : r > 0.25 ? "bg-marca-500" : "bg-marca-200";
  };

  return (
    <Panel
      titulo="Horas pico"
      ayuda="Cuántos chats entraron en cada hora (hora de Lima). Sirve para decidir cuántos asesores conectar en cada turno."
    >
      {max === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin chats en este periodo.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-[3px] text-[11px]">
              <thead>
                <tr>
                  <th className="w-9" />
                  {cols.map((h) => (
                    <th key={h} className="cifras font-normal text-muted-foreground">
                      {h % 2 === 1 ? "" : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIAS.map((dia, d) => (
                  <tr key={dia}>
                    <th className="pr-1 text-left font-semibold text-muted-foreground">{dia}</th>
                    {cols.map((h) => {
                      const n = valor(d, h);
                      return (
                        <td key={h} title={`${dia} ${h}:00 · ${n} ${n === 1 ? "chat" : "chats"}`} className={cn("h-6 rounded", tono(n))} />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Más chats:{" "}
              {picos
                .slice(0, 3)
                .map((p) => `${DIAS[p.d]} ${p.h}:00 (${p.n})`)
                .join(" · ")}
            </span>
            <span className="flex items-center gap-1">
              Menos
              {["bg-muted", "bg-marca-200", "bg-marca-500", "bg-marca-700", "bg-marca-900"].map((c) => (
                <span key={c} className={cn("h-3 w-3 rounded-sm", c)} />
              ))}
              Más
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

function Cifra({ titulo, valor, detalle, alerta }) {
  return (
    <div className={cn("rounded-xl border bg-card px-4 py-3 shadow-panel", alerta ? "border-oro-300" : "border-border")}>
      <p className="text-xs font-semibold text-muted-foreground">{titulo}</p>
      <p className={cn("cifras mt-1 font-heading text-2xl font-semibold leading-tight", valor == null && "text-muted-foreground")}>
        {valor ?? "—"}
      </p>
      {detalle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

function Lista({ titulo, items, render, tono }) {
  if (!items.length) return null;
  return (
    <section className="px-4 py-3">
      <h3 className={cn("mb-1.5 text-xs font-bold uppercase tracking-wide", tono === "error" ? "text-red-700" : "text-muted-foreground")}>
        {titulo} · {items.length}
      </h3>
      <ul className="space-y-1.5">
        {items.map((c, i) => (
          <li key={c.id ?? i} className="text-sm">
            {c.enlace ? (
              <a href={c.enlace} target="_blank" rel="noopener" className="block rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted">
                {render(c)}
              </a>
            ) : (
              <div className="px-0 py-1.5">{render(c)}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Esqueleto() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Cargando">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[86px] rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="h-64 rounded-xl bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
