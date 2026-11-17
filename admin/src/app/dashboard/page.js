"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { estadoCola } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Flecha, Documento, Persona, Tarjeta, Billete, Reclamo, Escudo, Manos } from "@/components/shell";
import { Aviso } from "@/components/marca";
import ResumenGraficos from "@/components/resumenGraficos";
import Pista from "@/components/pista";
import { EsqueletoTarjetas, CargaPantalla } from "@/components/carga";

export default function DashboardPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [colas, setColas] = useState({});
  const [extra, setExtra] = useState({});
  const [mias, setMias] = useState(null);
  const router = useRouter();

  useEffect(() => {
    let vivo = true;
    getSession()
      .then(async (s) => {
        if (!vivo) return;
        if (!s) return router.push("/login");
        setSession(s);
        // Un gestor no necesita el volumen de la empresa, y tampoco
        // debería verlo: se le muestran sus números y su cola.
        const tareas = [cargarColas()];
        if (s.rol === "gestor") tareas.push(cargarMias());
        else tareas.push(cargarExtra(s.rol));
        await Promise.all(tareas);
      })
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [router]);

  async function cargarColas() {
    const { colas: c, error: e } = await estadoCola();
    if (e) setError("No se pudieron cargar las colas: " + e);
    setColas(c);
  }

  async function cargarMias() {
    const { data, error: e } = await supabase.rpc("mis_metricas");
    if (e) return setError("No se pudieron cargar tus indicadores: " + e.message);
    setMias(Array.isArray(data) ? data[0] : data);
  }

  async function cargarExtra(rol) {
    const contar = (tabla, aplicar) => {
      let q = supabase.from(tabla).select("id", { count: "exact", head: true });
      q = aplicar(q);
      return q.then(({ count }) => count || 0);
    };
    const [activos, reclamos, pedidos, pagos] = await Promise.all([
      contar("users", (q) => q.eq("rol", "cliente").eq("estado", "activo")),
      contar("reclamaciones", (q) => q.eq("estado", "pendiente")),
      contar("solicitudes_datos", (q) => q.in("estado", ["pendiente", "en_proceso"])),
      rol === "admin"
        ? supabase.rpc("pagos_resumen").then(({ data }) => (data || []).reduce((n, r) => n + Number(r.por_pagar || 0), 0))
        : Promise.resolve(null),
    ]);
    setExtra({ activos, reclamos, pedidos, pagos });
  }

  if (!session) return loading ? <CargaPantalla /> : null;

  const esGestor = session.rol === "gestor";
  const esAdmin = session.rol === "admin";
  const hoy = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  const COLAS = [
    { tipo: "solicitud", titulo: "Solicitudes", detalle: "Comprobantes por revisar", ruta: "/solicitudes", icono: Documento },
    { tipo: "kyc", titulo: "Verificación", detalle: "Identidades por revisar", ruta: "/kyc", icono: Persona },
    { tipo: "tarjeta", titulo: "Tarjetas", detalle: "Tarjetas por verificar", ruta: "/tarjetas", icono: Tarjeta },
  ];

  const totalPendiente = COLAS.reduce((n, c) => n + Number(colas[c.tipo]?.pendientes || 0), 0);

  return (
    <Shell
      session={session}
      titulo="Resumen"
      descripcion={hoy.charAt(0).toUpperCase() + hoy.slice(1)}
      ayuda="Los números se actualizan al entrar a esta pantalla. Pulsa una cola para ir a atenderla; los indicadores de abajo se pueden ver por 7, 30 o 90 días."
    >
      {error && (
        <Aviso className="mb-4" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      {/* ── Para atender ahora ── */}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="t-seccion">{esGestor ? "Tu trabajo" : "Para atender ahora"}</h2>
        <span className="text-sm text-muted-foreground">
          {totalPendiente > 0 ? `${totalPendiente} en las colas` : "Colas al día"}
        </span>
      </div>

      {loading ? (
        <EsqueletoTarjetas cuantas={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {COLAS.map((c) => {
            const q = colas[c.tipo] || {};
            const pend = Number(q.pendientes || 0);
            const Icono = c.icono;
            return (
              <Link
                key={c.tipo}
                href={c.ruta}
                className={cn(
                  "group flex items-start gap-4 rounded-xl border bg-card p-4 shadow-panel transition hover:-translate-y-px hover:shadow-alzado",
                  pend > 0 ? "border-oro-300" : "border-border",
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    pend > 0 ? "bg-oro-100 text-oro-700" : "bg-marca-50 text-marca-500",
                  )}
                >
                  <Icono className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-muted-foreground">{c.detalle}</p>
                  <p className={cn("cifras font-heading text-3xl font-semibold leading-tight", pend > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {esGestor ? Number(q.mios || 0) : pend}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-chico text-muted-foreground">
                    {esGestor ? (
                      <span>
                        tuyos · <span className="cifras font-semibold">{Number(q.libres || 0)}</span> libres en la cola
                      </span>
                    ) : (
                      <>
                        <Pista texto="Nadie las tiene tomadas: el siguiente gestor que pida un caso se lleva la más antigua.">
                          <span className="cursor-help">
                            <span className="cifras font-semibold text-foreground">{Number(q.libres || 0)}</span> libres
                          </span>
                        </Pista>
                        <Pista texto="Un gestor las está revisando ahora mismo.">
                          <span className="cursor-help">
                            <span className="cifras font-semibold text-foreground">{Number(q.tomados || 0)}</span> en revisión
                          </span>
                        </Pista>
                      </>
                    )}
                  </div>
                </div>
                <Flecha className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Lo demás que tiene plazo o mueve dinero */}
      {!esGestor && !loading && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {esAdmin && (
            <Mini href="/pagos" icono={Billete} titulo="Por pagar" valor={extra.pagos} dinero pista="Solicitudes aprobadas esperando la transferencia." />
          )}
          <Mini href="/reclamaciones" icono={Reclamo} titulo="Reclamos por responder" valor={extra.reclamos} urgente pista="Tienen plazo legal de respuesta." />
          <Mini href="/pedidos-datos" icono={Escudo} titulo="Pedidos de datos" valor={extra.pedidos} urgente pista="Clientes que pidieron eliminar su cuenta. Tienen plazo legal." />
          <Mini icono={Persona} titulo="Clientes verificados" valor={extra.activos} pista="Clientes con la identidad aprobada que pueden operar." />
        </div>
      )}

      {/* ── Gestor: sus números ── */}
      {esGestor && mias && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Resueltos hoy", v: mias.resueltas_hoy },
            { t: "Aprobados hoy", v: mias.aprobadas_hoy },
            { t: "Rechazados u observados hoy", v: mias.rechazadas_hoy },
            { t: "Resueltos esta semana", v: mias.resueltas_semana },
          ].map((x) => (
            <div key={x.t} className="rounded-xl border border-border bg-card p-4 shadow-panel">
              <p className="text-sm font-semibold text-muted-foreground">{x.t}</p>
              <p className="cifras mt-1 font-heading text-2xl font-semibold">{Number(x.v || 0)}</p>
            </div>
          ))}
        </div>
      )}

      {esGestor && (
        <div className="mt-5 flex flex-wrap gap-2">
          {COLAS.map((c) => (
            <Link
              key={c.tipo}
              href={c.ruta}
              className="pulsable inline-flex h-10 items-center gap-2 rounded-lg bg-marca-700 px-4 text-sm font-semibold text-white shadow-panel hover:bg-marca-600"
            >
              <Manos className="h-4 w-4" />
              Atender {c.titulo.toLowerCase()}
            </Link>
          ))}
        </div>
      )}

      {/* ── Admin y supervisor: indicadores ── */}
      {!esGestor && <ResumenGraficos esAdmin={esAdmin} />}
    </Shell>
  );
}

function Mini({ href, icono: Icono, titulo, valor, urgente, dinero, pista }) {
  const n = Number(valor || 0);
  const resaltar = (urgente || dinero) && n > 0;
  const contenido = (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          resaltar ? (dinero ? "bg-oro-500 text-marca-900" : "bg-red-50 text-red-600") : "bg-muted text-muted-foreground",
        )}
      >
        <Icono className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">{titulo}</span>
      <span className={cn("cifras font-heading text-xl font-semibold", resaltar ? "text-foreground" : "text-muted-foreground")}>
        {valor == null ? "—" : n}
      </span>
    </>
  );
  const clase = "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-panel";
  const caja = href ? (
    <Link href={href} className={cn(clase, "transition hover:shadow-alzado")}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
  return pista ? (
    <Pista texto={pista} className="block w-full">
      {caja}
    </Pista>
  ) : (
    caja
  );
}
