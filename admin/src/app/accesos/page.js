"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { cn } from "@/lib/utils";
import { claveDe } from "@/lib/permisos";
import { PARTES } from "@/lib/catalogoPermisos";
import Shell, { Candado, FlechaAtras, Edificio } from "@/components/shell";
import { Vacio, Aviso } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, CargaPantalla } from "@/components/carga";
import { Segmentos, Buscador, Tostada, Avatar, useConfirmar } from "@/components/piezas";
import Pista from "@/components/pista";
import {
  EditorAccesos,
  CampoIps,
  aListaIps,
  faltaMigracion,
  AVISO_MIGRACION,
  ROL_TEXTO,
  contarRecortes,
  gruposDePantallas,
  nombreDe,
} from "@/components/accesosPersona";

const ROLES = ["admin", "supervisor", "gestor", "pagos"];

/**
 * Accesos del personal: pantalla del super administrador (quien
 * mantiene el sistema). Aquí se recorta, persona por persona, qué
 * pantallas y qué partes de cada una ve, y desde qué red entra.
 *
 * Quién es super administrador lo decide la tabla superadmins, que solo
 * se cambia desde la consola SQL (migración 078).
 */
export default function AccesosPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [vista, setVista] = useState("personas");
  const [personal, setPersonal] = useState([]);
  const [accesos, setAccesos] = useState({});
  const [sedes, setSedes] = useState([]);
  const [protegidas, setProtegidas] = useState(new Set());
  const [diagnostico, setDiagnostico] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [contadores, setContadores] = useState({});
  const [sucio, setSucio] = useState(false);
  const [confirmar, ventanaConfirmar] = useConfirmar();
  const router = useRouter();

  const cargar = useCallback(async () => {
    setError("");
    const [eq, ac, se, api, dg, cola] = await Promise.all([
      supabase.rpc("listar_equipo"),
      supabase.rpc("accesos_personal"),
      supabase.from("sedes").select("*").order("nombre"),
      supabase.from("permisos_api").select("clave"),
      supabase.rpc("ip_diagnostico"),
      estadoCola(),
    ]);
    if (ac.error) setError(faltaMigracion(ac.error) ? AVISO_MIGRACION : explicarError(ac.error, "No se pudieron leer los accesos."));
    if (eq.error) setError(explicarError(eq.error, "No se pudo cargar el personal."));
    setPersonal((eq.data || []).filter((p) => p.rol !== "cliente"));
    setAccesos(Object.fromEntries((ac.data || []).map((a) => [a.user_id, a])));
    setSedes(se.data || []);
    setProtegidas(new Set((api.data || []).map((x) => x.clave)));
    setDiagnostico(dg.data || null);
    setContadores(contadoresDe(cola.colas));
    setCargando(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin" || !s.superadmin) return router.push("/dashboard");
      setSession(s);
      cargar();
    });
  }, [router, cargar]);

  const conAcceso = useMemo(
    () => personal.map((p) => ({ ...p, permisos: accesos[p.id]?.permisos || {}, ip_sede: accesos[p.id]?.ip_sede, ips: accesos[p.id]?.ips || [] })),
    [personal, accesos],
  );

  const visibles = useMemo(() => {
    let base = conAcceso;
    if (filtroRol !== "todos") base = base.filter((p) => p.rol === filtroRol);
    const t = busqueda.trim().toLowerCase();
    if (t) base = base.filter((p) => [p.email, p.sede, ROL_TEXTO[p.rol]].filter(Boolean).join(" ").toLowerCase().includes(t));
    // Primero los activos; luego por correo.
    return [...base].sort((a, b) => (a.estado === "bloqueado") - (b.estado === "bloqueado") || String(a.email).localeCompare(String(b.email)));
  }, [conAcceso, busqueda, filtroRol]);

  const persona = conAcceso.find((p) => p.id === elegido) || null;

  async function elegir(id) {
    if (id === elegido) return;
    if (sucio) {
      const si = await confirmar({
        titulo: "¿Descartar los cambios?",
        texto: `Los accesos de ${nombreDe(persona)} tienen cambios sin guardar.`,
        boton: "Descartar",
        tono: "atencion",
      });
      if (!si) return;
    }
    setSucio(false);
    setElegido(id);
  }

  if (!session) return <CargaPantalla />;

  const conRecortes = conAcceso.filter((p) => contarRecortes(p.permisos) > 0).length;
  const conIp = conAcceso.filter((p) => estadoIp(p, sedes).restringe).length;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Accesos del personal"
      descripcion={`${conRecortes} con permisos recortados · ${conIp} con red restringida`}
      ayuda="Solo el super administrador ve esta pantalla. El rol de cada persona es su perfil base; aquí se le quita lo que no necesita y se fija desde qué red puede entrar."
    >
      {error && (
        <Aviso className="mb-4" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Segmentos
        className="mb-4"
        valor={vista}
        onCambio={setVista}
        opciones={[
          { clave: "personas", etiqueta: "Personas", cuenta: personal.length },
          { clave: "sedes", etiqueta: "IP de las sedes", cuenta: sedes.length },
          { clave: "perfiles", etiqueta: "Perfiles base", pista: "Qué trae cada rol antes de recortar" },
        ]}
      />

      {cargando ? (
        <EsqueletoFilas filas={6} />
      ) : vista === "personas" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* ── Lista ── */}
          <div className={cn("min-w-0", persona && "hidden lg:block")}>
            <div className="mb-3 space-y-2">
              <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Correo, rol o sede" className="w-full" />
              <Segmentos
                tamano="chico"
                valor={filtroRol}
                onCambio={setFiltroRol}
                opciones={[{ clave: "todos", etiqueta: "Todos" }, ...ROLES.map((r) => ({ clave: r, etiqueta: ROL_TEXTO[r] }))]}
              />
            </div>
            {visibles.length === 0 ? (
              <Vacio icono={<Candado />} titulo="Sin coincidencias" detalle="Nadie del equipo coincide con el filtro." />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-panel">
                {visibles.map((p) => {
                  const r = contarRecortes(p.permisos);
                  const ip = estadoIp(p, sedes);
                  const activo = p.id === elegido;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => elegir(p.id)}
                        aria-current={activo || undefined}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
                          activo ? "bg-marca-50" : "hover:bg-muted/50",
                          p.estado === "bloqueado" && "opacity-60",
                        )}
                      >
                        <Avatar texto={p.email} tono={p.id === session.user.id ? "oro" : "marca"} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{nombreDe(p)}</span>
                          <span className="block truncate text-chico text-muted-foreground">
                            {ROL_TEXTO[p.rol] || p.rol}
                            {p.sede ? ` · ${p.sede}` : ""}
                            {p.estado === "bloqueado" ? " · Bloqueado" : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {accesos[p.id]?.superadmin && <Chip tono="marca">Super admin</Chip>}
                          {r > 0 && <Chip tono="oro">{r === 1 ? "1 recorte" : `${r} recortes`}</Chip>}
                          <Chip tono={ip.restringe ? "verde" : "gris"}>{ip.corto}</Chip>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── Editor ── */}
          <div className="min-w-0">
            {persona ? (
              <section className="rounded-xl border border-border bg-card px-4 pt-4 shadow-panel sm:px-5">
                <div className="mb-5 flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => elegir(null)}
                    className="-ml-1 mt-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                    aria-label="Volver a la lista"
                  >
                    <FlechaAtras className="h-5 w-5" />
                  </button>
                  <Avatar texto={persona.email} tono={persona.id === session.user.id ? "oro" : "marca"} />
                  <div className="min-w-0">
                    <p className="truncate font-heading text-md font-semibold">{persona.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Perfil {ROL_TEXTO[persona.rol] || persona.rol}
                      {persona.sede ? ` · ${persona.sede}` : " · Sin sede"}
                      {persona.estado === "bloqueado" ? " · Bloqueado" : ""}
                    </p>
                  </div>
                </div>
                <EditorAccesos
                  persona={persona}
                  acceso={accesos[persona.id]}
                  sedes={sedes}
                  miId={session.user.id}
                  miIp={session.ip}
                  protegidas={protegidas}
                  otros={conAcceso}
                  onCambios={setSucio}
                  onGuardado={(texto) => {
                    setSucio(false);
                    setOk(texto);
                    cargar();
                  }}
                />
              </section>
            ) : (
              <div className="hidden h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed border-border p-6 text-center lg:flex">
                <div>
                  <Candado className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="font-semibold">Elige a una persona</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">Verás las pantallas de su rol, lo que se le puede quitar y desde qué red entra.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : vista === "sedes" ? (
        <IpSedes sedes={sedes} personal={conAcceso} diagnostico={diagnostico} miIp={session.ip} onGuardado={(t) => (setOk(t), cargar())} />
      ) : (
        <PerfilesBase protegidas={protegidas} />
      )}

      {ventanaConfirmar}
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

/** Cómo está la red de una persona, en corto para la lista. */
function estadoIp(p, sedes) {
  const propias = (p.ips || []).length;
  const sede = sedes.find((s) => s.id === p.sede_id);
  const deSede = p.ip_sede && (sede?.ips || []).length > 0;
  if (!propias && !deSede) return { restringe: false, corto: p.ip_sede ? "Sede sin IP" : "Red libre" };
  if (deSede && propias) return { restringe: true, corto: `Sede + ${propias} IP` };
  if (deSede) return { restringe: true, corto: "IP de sede" };
  return { restringe: true, corto: propias === 1 ? "1 IP" : `${propias} IP` };
}

function Chip({ tono, children }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
        tono === "oro" && "bg-oro-100 text-oro-700",
        tono === "verde" && "bg-emerald-50 text-emerald-700",
        tono === "marca" && "bg-marca-700 text-white",
        tono === "gris" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/* ───────── IP de las sedes ───────── */

function IpSedes({ sedes, personal, diagnostico, miIp, onGuardado }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
        <p className="t-etiqueta mb-1">Tu conexión</p>
        <p className="text-sm">
          La base de datos te ve desde{" "}
          <span className="cifras font-mono font-semibold">{diagnostico?.ip || miIp || "una IP que no se pudo detectar"}</span>.
          {!diagnostico?.ip && !miIp && " Mientras no se detecte, no conviene restringir a nadie."}
        </p>
        <p className="mt-1 text-chico text-muted-foreground">
          Compárala con la que te da una búsqueda de «cuál es mi IP» estando en el local. Si coinciden, ya puedes atar personas a esa red.
        </p>
      </div>

      {sedes.length === 0 ? (
        <Vacio icono={<Edificio />} titulo="Sin sedes" detalle="Crea las sedes en Organización › Sedes." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sedes.map((s) => (
            <IpSede key={s.id} sede={s} atados={personal.filter((p) => p.ip_sede && p.sede_id === s.id)} miIp={miIp} onGuardado={onGuardado} />
          ))}
        </div>
      )}
    </div>
  );
}

function IpSede({ sede, atados, miIp, onGuardado }) {
  const inicial = (sede.ips || []).join("\n");
  const [valor, setValor] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setValor(inicial), [inicial]);
  const cambiado = aListaIps(valor).join(",") !== aListaIps(inicial).join(",");

  async function guardar() {
    setGuardando(true);
    setError("");
    const { error: e } = await supabase.rpc("guardar_ips_sede", { p_sede: sede.id, p_ips: aListaIps(valor) });
    setGuardando(false);
    if (e) return setError(faltaMigracion(e) ? AVISO_MIGRACION : e.code === "P0001" || e.code === "42501" ? e.message : explicarError(e, "No se pudieron guardar las IP."));
    onGuardado(`IP de ${sede.nombre} guardadas.`);
  }

  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-panel", sede.activa === false ? "border-dashed border-border opacity-80" : "border-border")}>
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
          <Edificio className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading font-semibold">{sede.nombre}</p>
          <p className="text-chico text-muted-foreground">
            {atados.length === 0
              ? "Nadie atado a esta red todavía."
              : `${atados.length} ${atados.length === 1 ? "persona atada" : "personas atadas"}: ${atados.map(nombreDe).join(", ")}`}
          </p>
        </div>
      </div>
      {error && (
        <Aviso className="mb-3" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}
      <label htmlFor={`ips-${sede.id}`} className="sr-only">
        IP permitidas de {sede.nombre}
      </label>
      <CampoIps id={`ips-${sede.id}`} valor={valor} onCambio={setValor} miIp={miIp} />
      <div className="mt-3 flex justify-end gap-2">
        {cambiado && (
          <BotonAccion tono="neutro" tamano="chico" onClick={() => setValor(inicial)} disabled={guardando}>
            Descartar
          </BotonAccion>
        )}
        <BotonAccion tamano="chico" onClick={guardar} cargando={guardando} disabled={!cambiado}>
          Guardar IP
        </BotonAccion>
      </div>
    </section>
  );
}

/* ───────── Perfiles base ───────── */

function PerfilesBase({ protegidas }) {
  // Todas las pantallas (de cualquier rol), con sus partes.
  const filas = [];
  const vistas = new Set();
  for (const rol of ROLES) {
    for (const g of gruposDePantallas(rol)) {
      for (const s of g.items) {
        const k = claveDe(s.ruta);
        if (vistas.has(k)) continue;
        vistas.add(k);
        filas.push({ k, titulo: s.titulo, grupo: g.grupo, roles: s.roles, partes: PARTES[k] || [] });
      }
    }
  }
  const Marca = ({ si }) =>
    si ? <span className="font-bold text-emerald-600" aria-label="Sí">✓</span> : <span className="text-muted-foreground/60" aria-label="No">—</span>;

  return (
    <div>
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
        Lo que trae cada rol antes de recortar. Se cambia en el código: las pantallas en <code className="font-mono text-chico">components/shell.jsx</code> (MENU) y
        sus partes en <code className="font-mono text-chico">lib/catalogoPermisos.js</code>.
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-2.5 t-etiqueta">Pantalla o parte</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-3 py-2.5 text-center t-etiqueta">
                    {ROL_TEXTO[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f) => (
                <FilaPerfil key={f.k} f={f} protegidas={protegidas} Marca={Marca} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilaPerfil({ f, protegidas, Marca }) {
  return (
    <>
      <tr className="bg-card">
        <td className="px-4 py-2">
          <span className="font-semibold">{f.titulo}</span>
          {f.grupo && <span className="ml-2 text-chico text-muted-foreground">{f.grupo}</span>}
          {protegidas.has(f.k) && (
            <Pista texto="La base de datos también lo frena">
              <span className="ml-1.5 text-chico font-semibold text-marca-600">base</span>
            </Pista>
          )}
        </td>
        {ROLES.map((r) => (
          <td key={r} className="px-3 py-2 text-center">
            <Marca si={f.roles.includes(r)} />
          </td>
        ))}
      </tr>
      {f.partes.map((x) => (
        <tr key={x.clave} className="bg-muted/20">
          <td className="py-1.5 pl-8 pr-4 text-chico">
            {x.titulo}
            <span className="ml-1.5 text-muted-foreground">· {x.tipo === "vista" ? "vista" : "acción"}</span>
            {protegidas.has(`${f.k}.${x.clave}`) && <span className="ml-1.5 font-semibold text-marca-600">base</span>}
          </td>
          {ROLES.map((r) => (
            <td key={r} className="px-3 py-1.5 text-center text-chico">
              <Marca si={f.roles.includes(r) && x.roles.includes(r)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
