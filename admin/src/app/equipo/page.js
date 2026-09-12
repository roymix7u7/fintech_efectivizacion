"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { actualizar, registrarAuditoria, explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Personas } from "@/components/shell";
import { Vacio, Aviso, Estado } from "@/components/marca";
import { EsqueletoFilas, BarraCarga } from "@/components/carga";

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
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ email: "", rol: "gestor", sede_id: "" });
  const [credencial, setCredencial] = useState(null);
  const router = useRouter();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: e } = await supabase.rpc("listar_equipo");
    if (e) {
      setError(explicarError(e, "No se pudo cargar el equipo."));
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

  /**
   * Crea la cuenta llamando a la función crear-staff.
   *
   * No se puede hacer directamente desde aquí porque crear usuarios
   * exige la clave service_role, que nunca debe llegar al navegador.
   * La función vive en Supabase y comprueba por su cuenta que quien
   * llama sea administrador.
   */
  async function crearStaff() {
    const email = nuevo.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) {
      setError("Escribe un correo válido.");
      return;
    }

    setGuardando("nuevo");
    setError("");
    setCredencial(null);

    const { data, error: e } = await supabase.functions.invoke("crear-staff", {
      body: { email, rol: nuevo.rol, sede_id: nuevo.sede_id || null },
    });
    setGuardando(null);

    if (e) {
      // El mensaje de arriba solo dice que la función devolvió un
      // código distinto de 200. El motivo real viene en el cuerpo.
      let mensaje = e.message;
      let motivo = null;
      try {
        const cuerpo = await e.context?.json?.();
        if (cuerpo?.error) mensaje = cuerpo.error;
        motivo = cuerpo?.detalle || null;
      } catch {}

      // Cada motivo tiene un arreglo distinto, así que se dice cuál.
      const ayudas = {
        sesion_invalida:
          "Tu sesión caducó. Cierra sesión y vuelve a entrar.",
        sin_fila:
          "Tu cuenta de acceso no tiene fila en la tabla de usuarios. Escríbeme el identificador que aparece arriba.",
        rol_insuficiente:
          "Entra con la cuenta de administrador, o pide que te asignen ese rol.",
        sin_variables:
          "La función quedó sin sus variables de entorno. Vuelve a desplegarla.",
        fallo_consulta:
          "La función no pudo leer la tabla de usuarios. Es un problema de permisos en la base, no de tu cuenta.",
        correo_repetido:
          "Busca ese correo en la lista de abajo y asígnale el rol desde ahí.",
      };

      if (mensaje.includes("Failed to send") || mensaje.includes("not found")) {
        setError(
          "La función crear-staff no está desplegada. Ejecuta: npx supabase functions deploy crear-staff",
        );
      } else {
        setError(ayudas[motivo] ? `${mensaje} ${ayudas[motivo]}` : mensaje);
      }
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }

    setCredencial({ email: data.email, clave: data.clave_temporal });
    setNuevo({ email: "", rol: "gestor", sede_id: "" });
    setCreando(false);
    cargar();
  }

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

      {/* Credencial recién creada. Se muestra una sola vez. */}
      {credencial && (
        <div className="mb-5 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-emerald-900">
                Cuenta creada
              </p>
              <p className="mt-0.5 text-[13px] text-emerald-800">
                Entrégale estos datos. La contraseña no se vuelve a mostrar.
              </p>
            </div>
            <button
              onClick={() => setCredencial(null)}
              className="shrink-0 text-emerald-700 opacity-60 hover:opacity-100"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { l: "Correo", v: credencial.email },
              { l: "Contraseña temporal", v: credencial.clave },
            ].map((c) => (
              <button
                key={c.l}
                onClick={() => navigator.clipboard?.writeText(c.v)}
                title="Copiar"
                className="rounded-lg border border-emerald-200 bg-card px-3 py-2 text-left transition hover:bg-emerald-50"
              >
                <span className="block text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                  {c.l}
                </span>
                <span className="cifras block truncate font-mono text-[14px] font-semibold text-foreground">
                  {c.v}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Alta de personal */}
      {esAdmin && (
        <div className="mb-5 rounded-xl border border-border bg-card p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">Agregar a alguien</h2>
              <p className="text-[13px] text-muted-foreground">
                Se crea la cuenta y se te entrega una contraseña temporal.
              </p>
            </div>
            <button
              onClick={() => setCreando((c) => !c)}
              className="shrink-0 rounded-lg bg-marca-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-marca-600"
            >
              {creando ? "Cancelar" : "Nueva cuenta"}
            </button>
          </div>

          {creando && (
            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div>
                <label className="mb-1 block text-[12px] font-medium">
                  Correo
                </label>
                <input
                  type="email"
                  autoFocus
                  value={nuevo.email}
                  onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && crearStaff()}
                  placeholder="nombre@altoqueperu.com"
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium">Rol</label>
                <select
                  value={nuevo.rol}
                  onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-marca-500"
                >
                  {ROLES.map((r) => (
                    <option key={r.clave} value={r.clave}>
                      {r.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium">
                  Sede
                </label>
                <select
                  value={nuevo.sede_id}
                  onChange={(e) =>
                    setNuevo({ ...nuevo, sede_id: e.target.value })
                  }
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-marca-500"
                >
                  <option value="">Sin sede</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={crearStaff}
                  disabled={guardando === "nuevo" || !nuevo.email.trim()}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40 sm:w-auto"
                >
                  {guardando === "nuevo" ? "Creando..." : "Crear"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
        <EsqueletoFilas filas={6} />
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
                    {/* Se muestran todos los roles, y se desactivan los que
                        este usuario no puede asignar. Si se filtraran, el
                        valor real no tendria opcion que lo represente y el
                        navegador mostraria el primero de la lista, haciendo
                        pasar a un supervisor por gestor. */}
                    {ROLES.map((r) => (
                      <option
                        key={r.clave}
                        value={r.clave}
                        disabled={!esAdmin && r.clave !== "gestor"}
                      >
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
