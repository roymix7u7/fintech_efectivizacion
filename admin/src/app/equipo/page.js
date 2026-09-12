"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { actualizar, registrarAuditoria } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Personas } from "@/components/shell";
import { Vacio, Aviso, Estado } from "@/components/marca";

const ROLES = [
  {
    clave: "gestor",
    etiqueta: "Gestor",
    detalle: "Atiende la cola que se le asigna",
  },
  {
    clave: "supervisor",
    etiqueta: "Supervisor",
    detalle: "Ve todas las colas, reasigna y mide a su sede",
  },
  {
    clave: "admin",
    etiqueta: "Administrador",
    detalle: "Además configura comisiones, sedes y auditoría",
  },
];

export default function EquipoPage() {
  const [session, setSession] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [rendimiento, setRendimiento] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroSede, setFiltroSede] = useState("");
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [contadores, setContadores] = useState({});
  const router = useRouter();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: e } = await supabase.rpc("listar_equipo");
    if (e) {
      setError(
        "No se pudo cargar el equipo: " +
          e.message +
          ". ¿Ejecutaste server/09a y server/09b?",
      );
      setLoading(false);
      return;
    }
    setEquipo(data || []);

    const { data: sedesData } = await supabase
      .from("sedes")
      .select("id, nombre, activa")
      .order("nombre");
    setSedes(sedesData || []);

    const { data: rend } = await supabase.rpc("rendimiento_equipo", {
      p_dias: 7,
      p_sede: null,
    });
    setRendimiento(rend || []);

    const { colas } = await estadoCola();
    setContadores(contadoresDe(colas));
    setLoading(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargar();
    });
  }, [router, cargar]);

  async function cambiarRol(persona, rol) {
    if (persona.id === session.user.id) {
      setError("No puedes cambiarte el rol a ti mismo.");
      return;
    }
    setGuardando(persona.id);
    setError("");
    const r = await actualizar("users", { id: persona.id }, { rol });
    setGuardando(null);
    if (!r.ok) return setError("No se pudo cambiar el rol: " + r.error);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "CAMBIAR_ROL",
      entidad: "users",
      entidad_id: persona.id,
      datos_antes: { rol: persona.rol },
      datos_despues: { rol },
    });
    setOk(`${persona.email} ahora es ${rol}.`);
    cargar();
  }

  async function cambiarSede(persona, sedeId) {
    setGuardando(persona.id);
    setError("");
    const r = await actualizar(
      "users",
      { id: persona.id },
      { sede_id: sedeId || null },
    );
    setGuardando(null);
    if (!r.ok) return setError("No se pudo cambiar la sede: " + r.error);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "CAMBIAR_SEDE",
      entidad: "users",
      entidad_id: persona.id,
      datos_despues: { sede_id: sedeId },
    });
    cargar();
  }

  async function alternarBloqueo(persona) {
    if (persona.id === session.user.id) {
      setError("No puedes bloquearte a ti mismo.");
      return;
    }
    const nuevo = persona.estado === "bloqueado" ? "activo" : "bloqueado";
    if (
      nuevo === "bloqueado" &&
      !confirm(
        `${persona.email} dejará de poder entrar al panel de inmediato. ¿Continuar?`,
      )
    )
      return;

    setGuardando(persona.id);
    setError("");
    const r = await actualizar("users", { id: persona.id }, { estado: nuevo });
    setGuardando(null);
    if (!r.ok) return setError("No se pudo cambiar el estado: " + r.error);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: nuevo === "bloqueado" ? "BLOQUEAR_STAFF" : "DESBLOQUEAR_STAFF",
      entidad: "users",
      entidad_id: persona.id,
    });
    setOk(`${persona.email} quedó ${nuevo}.`);
    cargar();
  }

  const visibles = useMemo(() => {
    let base = equipo;
    if (filtroSede) {
      base =
        filtroSede === "sin"
          ? base.filter((p) => !p.sede_id)
          : base.filter((p) => p.sede_id === filtroSede);
    }
    const t = busqueda.trim().toLowerCase();
    if (!t) return base;
    return base.filter((p) =>
      [p.email, p.rol, p.sede].filter(Boolean).join(" ").toLowerCase().includes(t),
    );
  }, [equipo, busqueda, filtroSede]);

  if (!session) return null;

  const esAdmin = session.rol === "admin";
  const metricasDe = (id) => rendimiento.find((r) => r.usuario_id === id);

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Equipo"
      descripcion={`${equipo.length} persona${equipo.length === 1 ? "" : "s"} con acceso al panel`}
    >
      {error && (
        <div className="mb-4">
          <Aviso onCerrar={() => setError("")}>{error}</Aviso>
        </div>
      )}
      {ok && (
        <div className="mb-4">
          <Aviso tono="info" onCerrar={() => setOk("")}>
            {ok}
          </Aviso>
        </div>
      )}

      {/* Cómo dar de alta a alguien nuevo */}
      <details className="mb-5 rounded-xl border border-border bg-card p-4 shadow-panel">
        <summary className="cursor-pointer text-[14px] font-semibold">
          Cómo agregar a alguien nuevo
        </summary>
        <ol className="mt-3 space-y-2 text-[13px] text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">1.</span> En
            Supabase, entra a Authentication, Users, y pulsa Add user. Escribe
            su correo y una contraseña temporal.
          </li>
          <li>
            <span className="font-semibold text-foreground">2.</span> Pídele que
            entre una vez al panel con esa contraseña. Su cuenta aparecerá
            automáticamente en esta lista como cliente.
          </li>
          <li>
            <span className="font-semibold text-foreground">3.</span> Asígnale
            aquí su rol y su sede.
          </li>
        </ol>
        <p className="mt-3 text-[12px] text-muted-foreground">
          El paso de Supabase es necesario porque crear cuentas desde el
          navegador exigiría la clave de servicio, que nunca debe viajar al
          cliente.
        </p>
      </details>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Correo, rol o sede"
            className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
          />
        </div>
        {esAdmin && (
          <select
            value={filtroSede}
            onChange={(e) => setFiltroSede(e.target.value)}
            className="rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-marca-500"
          >
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
            <option value="sin">Sin sede</option>
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <Vacio
          icono={<Personas className="h-5 w-5" />}
          titulo={busqueda || filtroSede ? "Sin coincidencias" : "Equipo vacío"}
          detalle={
            busqueda || filtroSede
              ? "Nadie coincide con el filtro."
              : "Todavía no hay nadie con acceso al panel además de ti."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <ul className="divide-y divide-border">
            {visibles.map((p) => {
              const m = metricasDe(p.id);
              const yo = p.id === session.user.id;
              const bloqueado = p.estado === "bloqueado";
              return (
                <li
                  key={p.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-4 py-3.5 transition",
                    bloqueado ? "bg-muted/40 opacity-70" : "hover:bg-muted/30",
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-50 text-[13px] font-bold text-marca-700">
                    {(p.email || "?").slice(0, 2).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {p.email}
                      {yo && (
                        <span className="rounded bg-oro-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-oro-700">
                          tú
                        </span>
                      )}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {p.sede || "Sin sede"}
                      {m && m.resueltas > 0 && (
                        <>
                          {" · "}
                          <span className="cifras">{m.resueltas}</span> resueltas
                          esta semana
                        </>
                      )}
                    </p>
                  </div>

                  {bloqueado && (
                    <Estado valor="bloqueado" className="shrink-0" />
                  )}

                  {/* Sede */}
                  {esAdmin && (
                    <select
                      value={p.sede_id || ""}
                      onChange={(e) => cambiarSede(p, e.target.value)}
                      disabled={guardando === p.id || p.rol === "admin"}
                      className="shrink-0 rounded-lg border border-input bg-card px-2 py-1.5 text-[13px] outline-none focus:border-marca-500 disabled:opacity-40"
                    >
                      <option value="">Sin sede</option>
                      {sedes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Rol */}
                  <select
                    value={p.rol}
                    onChange={(e) => cambiarRol(p, e.target.value)}
                    disabled={guardando === p.id || yo}
                    title={yo ? "No puedes cambiarte el rol a ti mismo" : undefined}
                    className="shrink-0 rounded-lg border border-input bg-card px-2 py-1.5 text-[13px] outline-none focus:border-marca-500 disabled:opacity-40"
                  >
                    {p.rol === "cliente" && (
                      <option value="cliente">Sin rol asignado</option>
                    )}
                    {ROLES.filter(
                      (r) => esAdmin || r.clave === "gestor",
                    ).map((r) => (
                      <option key={r.clave} value={r.clave}>
                        {r.etiqueta}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => alternarBloqueo(p)}
                    disabled={guardando === p.id || yo}
                    className={cn(
                      "shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-40",
                      bloqueado
                        ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        : "border-border text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-700",
                    )}
                  >
                    {bloqueado ? "Desbloquear" : "Bloquear"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Qué puede hacer cada rol */}
      <div className="mt-5 rounded-xl border border-border bg-card p-4 shadow-panel">
        <h3 className="mb-3 text-[13px] font-semibold">Qué puede hacer cada rol</h3>
        <dl className="space-y-2.5">
          {ROLES.map((r) => (
            <div key={r.clave} className="flex gap-3">
              <dt className="w-28 shrink-0 text-[13px] font-medium">
                {r.etiqueta}
              </dt>
              <dd className="text-[13px] text-muted-foreground">{r.detalle}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Shell>
  );
}
