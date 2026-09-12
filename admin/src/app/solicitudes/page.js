"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firmarCampo } from "@/lib/storage";
import { cambiarEstado, registrarAuditoria, notificar } from "@/lib/acciones";
import {
  tomarSiguiente,
  soltarCaso,
  estadoCola,
  contadoresDe,
  minutosRestantes,
} from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Documento, Check, Cruz, Manos } from "@/components/shell";
import Visor from "@/components/visor";
import { Estado, Dato, Vacio, Aviso } from "@/components/marca";

const BUCKET = "comprobantes";
const FILTROS = [
  { clave: "pendiente", etiqueta: "Por revisar" },
  { clave: "aprobado", etiqueta: "Aprobadas" },
  { clave: "rechazado", etiqueta: "Rechazadas" },
];
const MIN_MOTIVO = 10;

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
}

function fechaLarga(iso) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Cuanto lleva esperando. Una cola se gestiona por antigüedad. */
function espera(iso) {
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (horas < 1) return { texto: "Recién llegada", urgente: false };
  if (horas < 24) return { texto: `Hace ${horas} h`, urgente: horas >= 12 };
  const dias = Math.floor(horas / 24);
  return { texto: `Hace ${dias} ${dias === 1 ? "día" : "días"}`, urgente: true };
}

export default function SolicitudesPage() {
  const [session, setSession] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [seleccionada, setSeleccionada] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [modoRechazo, setModoRechazo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  const [contadores, setContadores] = useState({});
  const [cola, setCola] = useState(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [soloMias, setSoloMias] = useState(true);
  const router = useRouter();

  const cargar = useCallback(async (estado, idPreferido = null) => {
    setLoading(true);
    setError("");
    setFiltro(estado);
    setSeleccionada(null);
    setModoRechazo(false);
    setMotivo("");

    const { data, error: consultaError } = await supabase
      .from("solicitudes")
      .select(
        `id, codigo, banco, estado, nota_cliente, motivo_rechazo,
         comprobante_url, created_at, fecha_revision, cliente_id,
         asignado_a, asignado_en,
         tarjetas (banco, ultimos_4),
         perfiles_cliente (nombres, apellidos, telefono, dni, user_id)`,
      )
      .eq("estado", estado)
      .order("created_at", { ascending: true });

    if (consultaError) {
      setError("No se pudieron cargar las solicitudes: " + consultaError.message);
      setSolicitudes([]);
      setLoading(false);
      return;
    }

    // Las URLs se firman al leer. La columna guarda el path del objeto.
    const firmadas = await firmarCampo(
      BUCKET,
      data || [],
      "comprobante_url",
      "comprobante",
    );
    setSolicitudes(firmadas);
    setLoading(false);

    // Se abre el caso recien tomado si lo hay; si no, el primero de
    // la lista. Revisar es un trabajo en serie y no tiene sentido
    // pedir un clic extra para empezar.
    const elegida = idPreferido
      ? firmadas.find((f) => f.id === idPreferido)
      : firmadas[0];
    if (elegida) abrir(elegida);
    // abrir solo usa setters de estado, que React garantiza estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "admin"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
      cargar("pendiente");
      contarPendientes();
    });
  }, [router, cargar]);

  async function contarPendientes() {
    const { colas } = await estadoCola();
    setContadores(contadoresDe(colas));
    setCola(colas.solicitud || null);
  }

  /**
   * Pide el siguiente caso libre. El reparto lo hace Postgres, asi que
   * dos revisores nunca reciben el mismo aunque pulsen a la vez.
   */
  async function atenderSiguiente() {
    setPidiendo(true);
    setError("");
    const { id, vacia, error: e } = await tomarSiguiente("solicitud");
    setPidiendo(false);
    if (e) return setError("No se pudo tomar el siguiente caso: " + e);
    if (vacia) {
      setError("No queda ningún caso libre en la cola por ahora.");
      await contarPendientes();
      return;
    }
    await cargar("pendiente", id);
    await contarPendientes();
  }

  /** Devuelve el caso a la bolsa para que lo tome otra persona. */
  async function soltar(sol) {
    const { ok, error: e } = await soltarCaso("solicitud", sol.id);
    if (!ok) return setError("No se pudo soltar el caso: " + e);
    await cargar(filtro);
    await contarPendientes();
  }

  function abrir(sol) {
    setSeleccionada(sol);
    setMotivo("");
    setModoRechazo(false);
    cargarCuentas(sol.cliente_id);
  }

  /**
   * Cuentas del cliente. Sin esto el operador no sabe a que cuenta
   * depositar: el cliente las registra en la app pero la solicitud no
   * apunta a ninguna.
   */
  async function cargarCuentas(clienteId) {
    setCuentas([]);
    if (!clienteId) return;
    setCargandoCuentas(true);
    const { data } = await supabase
      .from("cuentas_bancarias")
      .select("id, banco, numero_cuenta, tipo")
      .eq("cliente_id", clienteId)
      .eq("activa", true)
      .order("banco");
    setCuentas(data || []);
    setCargandoCuentas(false);
  }

  async function aprobar(sol) {
    setAccion("aprobando");
    setError("");

    // Solo escribe si la fila sigue pendiente, para que dos revisores
    // no resuelvan la misma solicitud a la vez.
    const r = await cambiarEstado({
      tabla: "solicitudes",
      id: sol.id,
      estadoActual: "pendiente",
      estadoNuevo: "aprobado",
      campos: {
        revisado_por: session.user.id,
        fecha_revision: new Date().toISOString(),
      },
    });
    if (!r.ok) {
      setAccion(null);
      setError(r.error);
      cargar(filtro);
      return;
    }

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "APROBAR_SOLICITUD",
      entidad: "solicitudes",
      entidad_id: sol.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "aprobado", codigo: sol.codigo },
    });
    await notificar({
      userId: sol.perfiles_cliente?.user_id,
      tipo: "solicitud_aprobada",
      titulo: "Solicitud aprobada",
      cuerpo: `Revisamos el comprobante de tu solicitud ${sol.codigo} y quedó aprobada.`,
    });

    setAccion(null);
    cargar(filtro);
    contarPendientes();
  }

  async function rechazar(sol) {
    const texto = motivo.trim();
    if (texto.length < MIN_MOTIVO) {
      setError(
        `Explica el motivo con al menos ${MIN_MOTIVO} caracteres: el cliente lo va a leer en su app.`,
      );
      return;
    }
    setAccion("rechazando");
    setError("");

    const r = await cambiarEstado({
      tabla: "solicitudes",
      id: sol.id,
      estadoActual: "pendiente",
      estadoNuevo: "rechazado",
      campos: {
        motivo_rechazo: texto,
        revisado_por: session.user.id,
        fecha_revision: new Date().toISOString(),
      },
    });
    if (!r.ok) {
      setAccion(null);
      setError(r.error);
      cargar(filtro);
      return;
    }

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "RECHAZAR_SOLICITUD",
      entidad: "solicitudes",
      entidad_id: sol.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "rechazado", motivo: texto },
    });
    await notificar({
      userId: sol.perfiles_cliente?.user_id,
      tipo: "solicitud_rechazada",
      titulo: "Solicitud rechazada",
      cuerpo: `Tu solicitud ${sol.codigo} fue rechazada. Motivo: ${texto}`,
    });

    setAccion(null);
    cargar(filtro);
    contarPendientes();
  }

  const visibles = useMemo(() => {
    // En la cola de pendientes, por defecto cada quien ve solo lo que
    // tiene tomado. Ese es el punto de la asignación: que quince
    // personas no revisen el mismo caso.
    let base = solicitudes;
    if (filtro === "pendiente" && soloMias) {
      base = solicitudes.filter(
        (s) =>
          s.asignado_a === session?.user.id && minutosRestantes(s.asignado_en) > 0,
      );
    }
    const t = busqueda.trim().toLowerCase();
    if (!t) return base;
    return base.filter((s) =>
      [
        s.codigo,
        s.banco,
        s.perfiles_cliente?.nombres,
        s.perfiles_cliente?.apellidos,
        s.perfiles_cliente?.dni,
        s.tarjetas?.ultimos_4,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [solicitudes, busqueda, filtro, soloMias, session]);

  if (!session) return null;

  const cliente = seleccionada?.perfiles_cliente;
  const nombre = cliente
    ? `${cliente.nombres} ${cliente.apellidos}`
    : "Cliente sin perfil";

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Solicitudes"
      descripcion={
        loading
          ? "Cargando la cola..."
          : filtro === "pendiente"
            ? `${solicitudes.length} ${solicitudes.length === 1 ? "comprobante espera" : "comprobantes esperan"} revisión`
            : `${solicitudes.length} en el historial`
      }
      acciones={
        <>
          <div className="hidden items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 sm:flex">
            {FILTROS.map((f) => (
              <button
                key={f.clave}
                onClick={() => cargar(f.clave)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] font-medium transition",
                  filtro === f.clave
                    ? "bg-card text-foreground shadow-panel"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
          <button
            onClick={atenderSiguiente}
            disabled={pidiendo || (cola && cola.libres === 0)}
            className="flex items-center gap-2 rounded-lg bg-marca-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-marca-600 disabled:opacity-40"
          >
            <Manos className="h-4 w-4" />
            {pidiendo ? "Tomando..." : "Atender siguiente"}
            {cola && cola.libres > 0 && (
              <span className="cifras rounded-full bg-white/20 px-1.5 text-[11px]">
                {cola.libres}
              </span>
            )}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-5">
          <Aviso titulo="No se pudo completar" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        </div>
      )}

      {/* Filtros en móvil */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 sm:hidden">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            onClick={() => cargar(f.clave)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition",
              filtro === f.clave
                ? "bg-card text-foreground shadow-panel"
                : "text-muted-foreground",
            )}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* ══════════ Cola ══════════ */}
        <section className="flex min-w-0 flex-col">
          {filtro === "pendiente" && cola && (
            <div className="mb-3 rounded-lg border border-border bg-card p-3 shadow-panel">
              <div className="flex items-center gap-3 text-[12px]">
                <span className="text-muted-foreground">
                  <span className="cifras font-semibold text-foreground">
                    {cola.mios}
                  </span>{" "}
                  tuyas
                </span>
                <span className="text-muted-foreground">
                  <span className="cifras font-semibold text-foreground">
                    {cola.libres}
                  </span>{" "}
                  libres
                </span>
                <span className="text-muted-foreground">
                  <span className="cifras font-semibold text-foreground">
                    {cola.tomados}
                  </span>{" "}
                  en curso
                </span>
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={soloMias}
                  onChange={(e) => setSoloMias(e.target.checked)}
                  className="h-3.5 w-3.5 accent-marca-700"
                />
                Ver solo las que tengo asignadas
              </label>
            </div>
          )}

          <div className="relative mb-3">
            <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Código, nombre, DNI o banco"
              className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[92px] animate-pulse rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : visibles.length === 0 ? (
            <Vacio
              icono={<Documento className="h-5 w-5" />}
              titulo={busqueda ? "Sin coincidencias" : "Cola vacía"}
              detalle={
                busqueda
                  ? "Ninguna solicitud de esta lista coincide con lo que buscas."
                  : filtro === "pendiente" && soloMias
                    ? cola && cola.libres > 0
                      ? `Hay ${cola.libres} caso${cola.libres === 1 ? "" : "s"} libre${cola.libres === 1 ? "" : "s"} en la cola. Pulsa Atender siguiente para tomar uno.`
                      : "No tienes casos asignados y la cola está vacía."
                    : filtro === "pendiente"
                      ? "No queda ningún comprobante por revisar. Buen trabajo."
                      : "Todavía no hay solicitudes con este estado."
              }
            />
          ) : (
            <div className="scroll-fino -mx-1 max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto px-1">
              {visibles.map((sol) => {
                const activa = seleccionada?.id === sol.id;
                const e = espera(sol.created_at);
                return (
                  <button
                    key={sol.id}
                    onClick={() => abrir(sol)}
                    className={cn(
                      "w-full rounded-xl border bg-card p-3.5 text-left transition",
                      activa
                        ? "border-marca-600 shadow-alzado ring-1 ring-marca-600"
                        : "border-border hover:border-marca-200 hover:shadow-panel",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="cifras font-mono text-[12px] font-semibold text-marca-700">
                        {sol.codigo}
                      </span>
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[11px]",
                          filtro === "pendiente" && e.urgente
                            ? "font-semibold text-oro-700"
                            : "text-muted-foreground",
                        )}
                      >
                        {filtro === "pendiente"
                          ? e.texto
                          : fechaCorta(sol.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-semibold text-foreground">
                      {sol.perfiles_cliente
                        ? `${sol.perfiles_cliente.nombres} ${sol.perfiles_cliente.apellidos}`
                        : "Cliente sin perfil"}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                      <span className="font-medium text-foreground/70">
                        {sol.tarjetas?.banco || sol.banco}
                      </span>
                      <span className="cifras font-mono">
                        ···· {sol.tarjetas?.ultimos_4 || "····"}
                      </span>
                      {!sol.comprobante && (
                        <span className="ml-auto text-red-600">sin imagen</span>
                      )}
                      {filtro === "pendiente" &&
                        !soloMias &&
                        sol.asignado_a &&
                        minutosRestantes(sol.asignado_en) > 0 && (
                          <span
                            className={cn(
                              "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                              sol.asignado_a === session?.user.id
                                ? "bg-marca-50 text-marca-700"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {sol.asignado_a === session?.user.id
                              ? "tuya"
                              : "en curso"}
                          </span>
                        )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ══════════ Detalle ══════════ */}
        <section className="min-w-0">
          {!seleccionada ? (
            <Vacio
              icono={<Documento className="h-5 w-5" />}
              titulo="Elige una solicitud"
              detalle="Selecciona un elemento de la cola para ver el comprobante y resolverlo."
            />
          ) : (
            <div className="space-y-4 animate-aparecer">
              {/* Encabezado */}
              <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-panel">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="cifras font-mono text-[15px] font-bold text-marca-700">
                      {seleccionada.codigo}
                    </h2>
                    <Estado valor={seleccionada.estado} />
                  </div>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Enviada el {fechaLarga(seleccionada.created_at)}
                  </p>
                </div>

                {seleccionada.estado === "pendiente" &&
                  seleccionada.asignado_a === session?.user.id &&
                  minutosRestantes(seleccionada.asignado_en) > 0 && (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-md bg-oro-50 px-2 py-1 text-[11px] font-semibold text-oro-700">
                        Reservada {minutosRestantes(seleccionada.asignado_en)} min
                      </span>
                      <button
                        onClick={() => soltar(seleccionada)}
                        className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:bg-muted"
                      >
                        Soltar
                      </button>
                    </div>
                  )}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {/* Comprobante */}
                <div className="min-w-0">
                  <Visor
                    url={seleccionada.comprobante}
                    error={seleccionada.comprobante_error}
                    path={seleccionada.comprobante_path}
                    titulo="Comprobante de la operación"
                    alto="h-[460px]"
                  />
                  {seleccionada.nota_cliente && (
                    <div className="mt-3 rounded-lg border-l-[3px] border-marca-600 bg-marca-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-marca-600">
                        Nota del cliente
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {seleccionada.nota_cliente}
                      </p>
                    </div>
                  )}
                </div>

                {/* Datos y acciones */}
                <div className="min-w-0 space-y-4">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                    <h3 className="mb-3 text-[13px] font-semibold text-foreground">
                      Titular
                    </h3>
                    <p className="text-base font-semibold text-foreground">
                      {nombre}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      <Dato etiqueta="DNI" mono>
                        {cliente?.dni}
                      </Dato>
                      <Dato etiqueta="Teléfono" mono>
                        {cliente?.telefono}
                      </Dato>
                      <Dato etiqueta="Tarjeta usada">
                        {seleccionada.tarjetas?.banco || seleccionada.banco}
                      </Dato>
                      <Dato etiqueta="Terminación" mono>
                        ···· {seleccionada.tarjetas?.ultimos_4}
                      </Dato>
                    </dl>
                  </div>

                  {/* Cuentas para depositar */}
                  <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                    <h3 className="mb-3 text-[13px] font-semibold text-foreground">
                      Cuentas para depositar
                    </h3>
                    {cargandoCuentas ? (
                      <div className="h-12 animate-pulse rounded-lg bg-muted" />
                    ) : cuentas.length === 0 ? (
                      <p className="rounded-lg bg-oro-50 px-3 py-2.5 text-[13px] text-oro-700">
                        Este cliente no registró ninguna cuenta bancaria.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {cuentas.map((c) => (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-foreground">
                                {c.banco}
                              </p>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {c.tipo === "interbancaria"
                                  ? "Interbancaria CCI"
                                  : "Cuenta de ahorros"}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                navigator.clipboard?.writeText(c.numero_cuenta)
                              }
                              title="Copiar número"
                              className="cifras shrink-0 rounded-md px-2 py-1 font-mono text-[13px] font-semibold text-marca-700 transition hover:bg-marca-50"
                            >
                              {c.numero_cuenta}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Resolución */}
                  {seleccionada.estado === "pendiente" ? (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                      {!modoRechazo ? (
                        <div className="space-y-2">
                          <button
                            onClick={() => aprobar(seleccionada)}
                            disabled={accion !== null}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" />
                            {accion === "aprobando"
                              ? "Aprobando..."
                              : "Aprobar solicitud"}
                          </button>
                          <button
                            onClick={() => setModoRechazo(true)}
                            disabled={accion !== null}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          >
                            <Cruz className="h-4 w-4" />
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[13px] font-semibold text-foreground">
                              Motivo del rechazo
                            </label>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                              El cliente lee este texto en su app. Dile qué
                              tiene que corregir.
                            </p>
                          </div>
                          <textarea
                            autoFocus
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            rows={4}
                            placeholder="Ej: El voucher está borroso y no se distingue el número de operación."
                            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                          />
                          <div className="flex items-center justify-between text-[12px]">
                            <span
                              className={cn(
                                motivo.trim().length >= MIN_MOTIVO
                                  ? "text-emerald-600"
                                  : "text-muted-foreground",
                              )}
                            >
                              {motivo.trim().length} / {MIN_MOTIVO} mínimo
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setModoRechazo(false);
                                setMotivo("");
                              }}
                              disabled={accion !== null}
                              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => rechazar(seleccionada)}
                              disabled={
                                accion !== null ||
                                motivo.trim().length < MIN_MOTIVO
                              }
                              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
                            >
                              {accion === "rechazando"
                                ? "Rechazando..."
                                : "Confirmar rechazo"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                      <h3 className="mb-3 text-[13px] font-semibold text-foreground">
                        Resolución
                      </h3>
                      <dl className="space-y-3">
                        <Dato etiqueta="Resuelta el">
                          {seleccionada.fecha_revision
                            ? fechaLarga(seleccionada.fecha_revision)
                            : null}
                        </Dato>
                      </dl>
                      {seleccionada.motivo_rechazo && (
                        <div className="mt-3 rounded-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
                            Motivo comunicado al cliente
                          </p>
                          <p className="mt-1 text-sm text-red-900">
                            {seleccionada.motivo_rechazo}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
