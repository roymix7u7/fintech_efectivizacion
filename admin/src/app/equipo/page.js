"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { actualizar, registrarAuditoria, explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Personas, Mas, Candado } from "@/components/shell";
import { Vacio, Aviso, Estado } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, CargaPantalla } from "@/components/carga";
import { Segmentos, Buscador, Barra, Leyenda, Campo, Dialogo, Tostada, Copiar, Avatar, useConfirmar, IconoCheck } from "@/components/piezas";
import Pista from "@/components/pista";
import { BANCOS_TARJETA } from "@/lib/bancos";

const ROLES = [
  {
    clave: "gestor",
    etiqueta: "Gestor",
    detalle: "Atiende la cola que se le asigna. No ve el trabajo de los demás ni los totales de la empresa.",
  },
  {
    clave: "pagos",
    etiqueta: "Pagos",
    detalle: "Solo entra a Pagos. Marca y confirma envíos de los bancos que se le asignan; ve los de sus compañeros sin poder tocarlos.",
  },
  {
    clave: "supervisor",
    etiqueta: "Supervisor",
    detalle: "Ve todas las colas, verifica tarjetas, bloquea clientes, y crea o bloquea gestores de su sede.",
  },
  {
    clave: "admin",
    etiqueta: "Administrador",
    detalle: "Además configura comisiones, sedes, noticias, guías y textos legales, nombra supervisores y ve la auditoría.",
  },
];
const rolDe = (clave) => ROLES.find((r) => r.clave === clave);

const CORREO = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const NUEVO = { email: "", rol: "gestor", sede_id: "" };

export default function EquipoPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [equipo, setEquipo] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [rendimiento, setRendimiento] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [contadores, setContadores] = useState({});
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState(NUEVO);
  const [tocado, setTocado] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState("");
  const [credencial, setCredencial] = useState(null);
  // Bancos de cada encargado de pagos: { user_id: ["BCP", ...] }
  const [bancosPago, setBancosPago] = useState({});
  const [confirmar, ventanaConfirmar] = useConfirmar();
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

    const [{ data: asignados }, { data: sedesData }, { data: rend }, { colas }] = await Promise.all([
      supabase.from("pagos_bancos").select("user_id, banco"),
      supabase.from("sedes").select("id, nombre, activa").order("nombre"),
      supabase.rpc("rendimiento_equipo", { p_dias: 7, p_sede: null }),
      estadoCola(),
    ]);
    const mapa = {};
    for (const a of asignados || []) (mapa[a.user_id] ||= []).push(a.banco);
    setBancosPago(mapa);
    setSedes(sedesData || []);
    setRendimiento(rend || []);
    setContadores(contadoresDe(colas));
    setLoading(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
      cargar();
    });
  }, [router, cargar]);

  const esAdmin = session?.rol === "admin";
  const miSede = equipo.find((p) => p.id === session?.user.id)?.sede_id || "";

  const correoNuevo = nuevo.email.trim().toLowerCase();
  const fallaCorreo = !correoNuevo
    ? "Escribe el correo de la persona."
    : !CORREO.test(correoNuevo)
      ? "Ese correo no tiene un formato válido."
      : equipo.some((p) => (p.email || "").toLowerCase() === correoNuevo)
        ? "Ese correo ya está en el equipo: cámbiale el rol desde la lista."
        : null;

  function abrirAlta() {
    // Un supervisor crea siempre para su propia sede.
    setNuevo({ ...NUEVO, sede_id: esAdmin ? "" : miSede });
    setTocado(false);
    setErrorNuevo("");
    setCreando(true);
  }

  /**
   * Crea la cuenta llamando a la función crear-staff.
   *
   * No se puede hacer directamente desde aquí porque crear usuarios
   * exige la clave service_role, que nunca debe llegar al navegador.
   * La función vive en Supabase y comprueba por su cuenta que quien
   * llama tenga permiso.
   */
  async function crearStaff() {
    setTocado(true);
    if (fallaCorreo) return;

    setGuardando("nuevo");
    setErrorNuevo("");
    setCredencial(null);

    const { data, error: e } = await supabase.functions.invoke("crear-staff", {
      body: { email: correoNuevo, rol: nuevo.rol, sede_id: nuevo.sede_id || null },
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

      const ayudas = {
        sesion_invalida: "Tu sesión caducó. Cierra sesión y vuelve a entrar.",
        sin_fila: "Tu cuenta de acceso no tiene fila en la tabla de usuarios.",
        rol_insuficiente: "Entra con la cuenta de administrador, o pide que te asignen ese rol.",
        sin_variables: "La función quedó sin sus variables de entorno. Vuelve a desplegarla.",
        fallo_consulta: "La función no pudo leer la tabla de usuarios: es un problema de permisos en la base.",
        correo_repetido: "Busca ese correo en la lista y asígnale el rol desde ahí.",
      };

      if (mensaje.includes("Failed to send") || mensaje.includes("not found")) {
        setErrorNuevo("La función crear-staff no está desplegada. Ejecuta: npx supabase functions deploy crear-staff");
      } else {
        setErrorNuevo(ayudas[motivo] ? `${mensaje} ${ayudas[motivo]}` : mensaje);
      }
      return;
    }
    if (data?.error) return setErrorNuevo(data.error);

    setCredencial({ email: data.email, clave: data.clave_temporal, rol: nuevo.rol });
    setCreando(false);
    cargar();
  }

  async function cambiarRol(persona, rol) {
    if (persona.id === session.user.id) return setError("No puedes cambiarte el rol a ti mismo.");
    const si = await confirmar({
      titulo: `¿Cambiar el rol de ${persona.email}?`,
      texto: `Pasará de ${rolDe(persona.rol)?.etiqueta || "sin rol"} a ${rolDe(rol)?.etiqueta}. ${rolDe(rol)?.detalle}`,
      boton: "Cambiar rol",
      tono: rol === "admin" ? "atencion" : "info",
    });
    if (!si) return;

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
    setOk(`${persona.email} ahora es ${rolDe(rol)?.etiqueta.toLowerCase()}.`);
    cargar();
  }

  /**
   * Asigna o quita un banco a un encargado de pagos. Un banco puede tener
   * varios encargados y una persona varios bancos: para cubrir una
   * ausencia basta con sumarle el banco del compañero.
   */
  async function alternarBancoPago(persona, banco) {
    const tiene = (bancosPago[persona.id] || []).includes(banco);
    setGuardando(persona.id);
    setError("");

    const { error: e } = tiene
      ? await supabase.from("pagos_bancos").delete().eq("user_id", persona.id).eq("banco", banco)
      : await supabase.from("pagos_bancos").insert({ user_id: persona.id, banco });

    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo cambiar el banco."));

    setBancosPago((m) => ({
      ...m,
      [persona.id]: tiene ? (m[persona.id] || []).filter((b) => b !== banco) : [...(m[persona.id] || []), banco],
    }));

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: tiene ? "QUITAR_BANCO_PAGOS" : "ASIGNAR_BANCO_PAGOS",
      entidad: "pagos_bancos",
      entidad_id: persona.id,
      datos_despues: { banco },
    });
  }

  async function cambiarSede(persona, sedeId) {
    setGuardando(persona.id);
    setError("");
    const r = await actualizar("users", { id: persona.id }, { sede_id: sedeId || null });
    setGuardando(null);
    if (!r.ok) return setError("No se pudo cambiar la sede: " + r.error);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "CAMBIAR_SEDE",
      entidad: "users",
      entidad_id: persona.id,
      datos_despues: { sede_id: sedeId },
    });
    setOk(`Sede de ${persona.email} actualizada.`);
    cargar();
  }

  async function alternarBloqueo(persona) {
    if (persona.id === session.user.id) return setError("No puedes bloquearte a ti mismo.");
    const nuevoEstado = persona.estado === "bloqueado" ? "activo" : "bloqueado";
    const si = await confirmar(
      nuevoEstado === "bloqueado"
        ? {
            titulo: `¿Bloquear a ${persona.email}?`,
            texto: "Dejará de poder entrar al panel de inmediato. Se puede revertir.",
            boton: "Bloquear",
            tono: "peligro",
          }
        : {
            titulo: `¿Desbloquear a ${persona.email}?`,
            texto: "Podrá volver a entrar al panel con su contraseña.",
            boton: "Desbloquear",
            tono: "exito",
          },
    );
    if (!si) return;

    setGuardando(persona.id);
    setError("");
    const r = await actualizar("users", { id: persona.id }, { estado: nuevoEstado });
    setGuardando(null);
    if (!r.ok) return setError("No se pudo cambiar el estado: " + r.error);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: nuevoEstado === "bloqueado" ? "BLOQUEAR_STAFF" : "DESBLOQUEAR_STAFF",
      entidad: "users",
      entidad_id: persona.id,
    });
    setOk(`${persona.email} quedó ${nuevoEstado}.`);
    cargar();
  }

  const visibles = useMemo(() => {
    let base = equipo;
    if (filtroRol !== "todos") base = base.filter((p) => p.rol === filtroRol);
    if (filtroSede) base = filtroSede === "sin" ? base.filter((p) => !p.sede_id) : base.filter((p) => p.sede_id === filtroSede);
    const t = busqueda.trim().toLowerCase();
    if (!t) return base;
    return base.filter((p) => [p.email, p.rol, p.sede].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [equipo, busqueda, filtroSede, filtroRol]);

  if (!session) return <CargaPantalla />;

  const metricasDe = (id) => rendimiento.find((r) => r.usuario_id === id);
  const cuentaRol = (r) => equipo.filter((p) => p.rol === r).length;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Equipo"
      descripcion={`${equipo.length} persona${equipo.length === 1 ? "" : "s"} con acceso al panel`}
      ayuda={
        esAdmin
          ? "Como administrador cambias roles, sedes y bancos de Pagos desde esta lista."
          : "Cambiar roles y mover gente entre sedes es del administrador. Tú creas gestores para tu sede y puedes bloquearlos."
      }
      acciones={
        <BotonAccion onClick={abrirAlta} icono={<Mas className="h-4 w-4" />}>
          <span className="hidden sm:inline">Nueva cuenta</span>
        </BotonAccion>
      }
    >
      {error && (
        <Aviso className="mb-4" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={filtroRol}
          onCambio={setFiltroRol}
          opciones={[
            { clave: "todos", etiqueta: "Todos", cuenta: equipo.length },
            ...ROLES.map((r) => ({ clave: r.clave, etiqueta: r.etiqueta, cuenta: cuentaRol(r.clave), pista: r.detalle })),
          ]}
        />
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Correo o sede" className="w-full sm:w-64" />
        {esAdmin && (
          <select
            id="filtroSede"
            aria-label="Filtrar por sede"
            value={filtroSede}
            onChange={(e) => setFiltroSede(e.target.value)}
            className="campo h-10 w-auto"
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
      </Barra>

      {loading ? (
        <EsqueletoFilas filas={6} />
      ) : visibles.length === 0 ? (
        <Vacio
          icono={<Personas />}
          titulo={busqueda || filtroSede || filtroRol !== "todos" ? "Sin coincidencias" : "Equipo vacío"}
          detalle={
            busqueda || filtroSede || filtroRol !== "todos"
              ? "Nadie coincide con el filtro."
              : "Todavía no hay nadie con acceso al panel además de ti."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-4 py-2.5 t-etiqueta">Persona</th>
                  <th className="px-4 py-2.5 t-etiqueta">Rol</th>
                  <th className="px-4 py-2.5 t-etiqueta">Sede</th>
                  <th className="px-4 py-2.5 t-etiqueta">
                    <span className="inline-flex items-center gap-1">
                      Últimos 7 días
                      <Pista texto="Casos resueltos (solicitudes, identidades y tarjetas). Pasa el cursor sobre el número para ver el detalle." />
                    </span>
                  </th>
                  <th className="px-4 py-2.5 t-etiqueta">Estado</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map((p) => {
                  const m = metricasDe(p.id);
                  const yo = p.id === session.user.id;
                  const bloqueado = p.estado === "bloqueado";
                  const puedeBloquear = !yo && (esAdmin || (p.rol === "gestor" && p.sede_id === miSede));
                  const bancos = bancosPago[p.id] || [];
                  return (
                    <tr key={p.id} className={cn("align-top transition", bloqueado ? "bg-muted/40" : "hover:bg-muted/30")}>
                      <td className="px-4 py-3">
                        <div className={cn("flex items-center gap-3", bloqueado && "opacity-60")}>
                          <Avatar texto={p.email} tono={yo ? "oro" : "marca"} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-semibold">
                              {p.email}
                              {yo && <span className="rounded bg-oro-100 px-1.5 py-0.5 text-xs font-bold text-oro-700">Tú</span>}
                            </p>
                            {p.rol === "pagos" && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                {BANCOS_TARJETA.map((b) => {
                                  const activo = bancos.includes(b);
                                  if (!esAdmin && !activo) return null;
                                  return (
                                    <button
                                      key={b}
                                      onClick={() => esAdmin && alternarBancoPago(p, b)}
                                      disabled={!esAdmin || guardando === p.id}
                                      aria-pressed={activo}
                                      title={esAdmin ? (activo ? `Quitar ${b}` : `Asignar ${b}`) : undefined}
                                      className={cn(
                                        "rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset transition",
                                        activo ? "bg-marca-700 text-white ring-marca-700" : "bg-card text-muted-foreground ring-border hover:text-foreground",
                                        esAdmin ? "pulsable" : "cursor-default",
                                        "disabled:opacity-60",
                                      )}
                                    >
                                      {b}
                                    </button>
                                  );
                                })}
                                {!bancos.length && <span className="text-xs font-semibold text-oro-700">Sin bancos: no podrá pagar nada</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {esAdmin ? (
                          <select
                            aria-label={`Rol de ${p.email}`}
                            value={p.rol}
                            onChange={(e) => cambiarRol(p, e.target.value)}
                            disabled={guardando === p.id || yo}
                            title={yo ? "No puedes cambiarte el rol a ti mismo" : undefined}
                            className="campo h-9 w-40 py-1 text-sm"
                          >
                            {p.rol === "cliente" && <option value="cliente">Sin rol asignado</option>}
                            {ROLES.map((r) => (
                              <option key={r.clave} value={r.clave}>
                                {r.etiqueta}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Pista texto={rolDe(p.rol)?.detalle || "Cambiar roles es del administrador"}>
                            <span className="cursor-help rounded-full bg-muted px-2.5 py-1 text-chico font-bold text-muted-foreground">
                              {rolDe(p.rol)?.etiqueta || "Sin rol asignado"}
                            </span>
                          </Pista>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {esAdmin ? (
                          <select
                            aria-label={`Sede de ${p.email}`}
                            value={p.sede_id || ""}
                            onChange={(e) => cambiarSede(p, e.target.value)}
                            disabled={guardando === p.id || p.rol === "admin"}
                            title={p.rol === "admin" ? "El administrador no pertenece a una sede" : undefined}
                            className="campo h-9 w-44 py-1 text-sm"
                          >
                            <option value="">Sin sede</option>
                            {sedes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nombre}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted-foreground">{p.sede || "Sin sede"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {m && Number(m.resueltas) > 0 ? (
                          <Pista
                            texto={`${m.aprobadas} aprobados · ${m.rechazadas} rechazados u observados${m.minutos_promedio ? ` · ${Math.round(m.minutos_promedio)} min por caso en promedio` : ""}`}
                          >
                            <span className="cifras cursor-help font-bold">{m.resueltas} resueltos</span>
                          </Pista>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Estado valor={bloqueado ? "bloqueado" : "activo"} etiqueta={bloqueado ? "Bloqueado" : "Activo"} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Pista
                          texto={
                            yo
                              ? "No puedes bloquearte a ti mismo"
                              : !puedeBloquear
                                ? "Solo puedes bloquear gestores de tu sede"
                                : bloqueado
                                  ? "Devolverle el acceso al panel"
                                  : "Quitarle el acceso al panel de inmediato"
                          }
                          fin
                        >
                          <BotonAccion
                            tono={bloqueado ? "neutro" : "peligroSuave"}
                            tamano="chico"
                            onClick={() => alternarBloqueo(p)}
                            disabled={guardando === p.id || !puedeBloquear}
                            icono={<Candado className="h-3.5 w-3.5" />}
                          >
                            {bloqueado ? "Desbloquear" : "Bloquear"}
                          </BotonAccion>
                        </Pista>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2.5">
            <Leyenda
              titulo="Roles"
              items={ROLES.map((r) => ({
                texto: r.etiqueta,
                color: { gestor: "bg-marca-300", pagos: "bg-oro-500", supervisor: "bg-marca-500", admin: "bg-marca-900" }[r.clave],
                pista: r.detalle,
              }))}
            />
          </div>
        </div>
      )}

      {/* Alta de personal */}
      <Dialogo
        abierto={creando}
        onCerrar={() => setCreando(false)}
        bloqueado={guardando === "nuevo"}
        titulo="Nueva cuenta del equipo"
        descripcion={
          esAdmin
            ? "Se crea la cuenta y se te entrega una contraseña temporal para dársela."
            : "Creas gestores para tu sede. Se te entrega una contraseña temporal para dársela."
        }
        icono={<Mas className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setCreando(false)} disabled={guardando === "nuevo"}>
              Cancelar
            </BotonAccion>
            <BotonAccion onClick={crearStaff} cargando={guardando === "nuevo"} disabled={tocado && Boolean(fallaCorreo)}>
              Crear cuenta
            </BotonAccion>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            crearStaff();
          }}
        >
          {errorNuevo && <Aviso>{errorNuevo}</Aviso>}
          <Campo etiqueta="Correo" htmlFor="correoNuevo" requerido error={tocado ? fallaCorreo : null}>
            <input
              id="correoNuevo"
              type="email"
              autoFocus
              autoComplete="off"
              value={nuevo.email}
              onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
              onBlur={() => nuevo.email && setTocado(true)}
              aria-invalid={tocado && Boolean(fallaCorreo)}
              placeholder="nombre@altoqueperu.com"
              className="campo"
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Rol" htmlFor="rolNuevo" ayuda={!esAdmin ? "Un supervisor solo crea gestores." : undefined}>
              <select
                id="rolNuevo"
                value={nuevo.rol}
                onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
                disabled={!esAdmin}
                className="campo"
              >
                {ROLES.filter((r) => esAdmin || r.clave === "gestor").map((r) => (
                  <option key={r.clave} value={r.clave}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Sede" htmlFor="sedeNueva" ayuda={!esAdmin ? "Un supervisor solo crea para su sede." : undefined}>
              <select
                id="sedeNueva"
                value={nuevo.sede_id}
                onChange={(e) => setNuevo({ ...nuevo, sede_id: e.target.value })}
                disabled={!esAdmin || nuevo.rol === "admin"}
                className="campo"
              >
                {esAdmin && <option value="">Sin sede</option>}
                {sedes
                  .filter((s) => (esAdmin ? s.activa !== false : s.id === miSede))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
              </select>
            </Campo>
          </div>
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            <strong className="text-foreground">{rolDe(nuevo.rol)?.etiqueta}:</strong> {rolDe(nuevo.rol)?.detalle}
          </p>
          {nuevo.rol === "pagos" && (
            <p className="text-chico text-muted-foreground">Después de crearla, asígnale sus bancos en la lista: sin bancos no podrá pagar nada.</p>
          )}
          <button type="submit" className="hidden" />
        </form>
      </Dialogo>

      {/* Credencial recién creada. Se muestra una sola vez. */}
      <Dialogo
        abierto={Boolean(credencial)}
        onCerrar={() => setCredencial(null)}
        titulo="Cuenta creada"
        descripcion="Entrégale estos datos por un canal seguro. La contraseña no se vuelve a mostrar."
        tono="exito"
        icono={<IconoCheck />}
        pie={<BotonAccion onClick={() => setCredencial(null)}>Ya los copié</BotonAccion>}
      >
        <div className="space-y-2">
          {[
            { l: "Correo", v: credencial?.email },
            { l: "Contraseña temporal", v: credencial?.clave },
          ].map((c) => (
            <div key={c.l} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted-foreground">{c.l}</p>
                <p className="cifras truncate font-mono text-md font-bold text-foreground">{c.v}</p>
              </div>
              <Copiar texto={c.v} />
            </div>
          ))}
        </div>
      </Dialogo>

      {ventanaConfirmar}
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}
