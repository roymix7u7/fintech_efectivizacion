"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firmarCampo } from "@/lib/storage";
import {
  cambiarEstado,
  registrarAuditoria,
  notificar,
  explicarError,
} from "@/lib/acciones";
import {
  tomarSiguiente,
  soltarCaso,
  estadoCola,
  contadoresDe,
  minutosRestantes,
} from "@/lib/cola";
import { useRetraso, idsDeClientes } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Documento, Check, Cruz, Manos } from "@/components/shell";
import Visor from "@/components/visor";
import Paginador from "@/components/paginador";
import {
  EsqueletoCola,
  BarraCarga,
  BotonAccion,
  Esqueleto,
} from "@/components/carga";
import { Estado, Dato, Vacio, Aviso } from "@/components/marca";

const BUCKET = "comprobantes";
const POR_PAGINA = 25;
const MIN_MOTIVO = 10;

const FILTROS = [
  { clave: "pendiente", etiqueta: "Por revisar" },
  { clave: "aprobado", etiqueta: "Aprobadas" },
  { clave: "rechazado", etiqueta: "Rechazadas" },
];

const CAMPOS = `id, codigo, banco, estado, nota_cliente, motivo_rechazo,
   comprobante_url, created_at, fecha_revision, cliente_id,
   asignado_a, asignado_en,
   tarjetas (banco, ultimos_4),
   perfiles_cliente (nombres, apellidos, telefono, dni, user_id)`;

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

/** Cuánto lleva esperando. Una cola se gestiona por antigüedad. */
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
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  const [contadores, setContadores] = useState({});
  const [cola, setCola] = useState(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [soloMias, setSoloMias] = useState(true);
  const router = useRouter();

  const termino = useRetraso(busqueda, 350);
  const esCola = filtro === "pendiente";

  // Evita que una respuesta lenta pise a otra mas reciente cuando el
  // usuario cambia de pestana o sigue escribiendo.
  const peticion = useRef(0);

  const cargar = useCallback(async (estado, opciones = {}) => {
    const {
      idPreferido = null,
      pag = 0,
      buscar = "",
      silencioso = false,
    } = opciones;
    const mia = ++peticion.current;

    if (silencioso) setRefrescando(true);
    else setPrimeraCarga(true);
    setError("");

    let q = supabase
      .from("solicitudes")
      .select(CAMPOS, { count: "exact" })
      .eq("estado", estado);

    const t = buscar.trim();
    if (t) {
      // La busqueda va al servidor. Filtrar en el navegador solo
      // encontraria lo que ya esta cargado, que con el historial
      // paginado es una fraccion del total.
      const ids = await idsDeClientes(supabase, t);
      const patron = `%${t}%`;
      const partes = [`codigo.ilike.${patron}`, `banco.ilike.${patron}`];
      if (ids.length > 0) partes.push(`cliente_id.in.(${ids.join(",")})`);
      q = q.or(partes.join(","));
    }

    if (estado === "pendiente") {
      // La cola es corta por definicion: solo lo que falta atender.
      q = q.order("created_at", { ascending: true }).limit(200);
    } else {
      // El historial crece para siempre, asi que se pide de a poco.
      q = q
        .order("fecha_revision", { ascending: false, nullsFirst: false })
        .range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1);
    }

    const { data, count, error: consultaError } = await q;
    if (mia !== peticion.current) return; // llego tarde, ya hay otra

    if (consultaError) {
      setError(
        explicarError(consultaError, "No se pudieron cargar las solicitudes."),
      );
      setSolicitudes([]);
      setTotal(0);
      setPrimeraCarga(false);
      setRefrescando(false);
      return;
    }

    // Las URLs se firman al leer. La columna guarda el path.
    const firmadas = await firmarCampo(
      BUCKET,
      data || [],
      "comprobante_url",
      "comprobante",
    );
    if (mia !== peticion.current) return;

    setSolicitudes(firmadas);
    setTotal(count || 0);
    setPrimeraCarga(false);
    setRefrescando(false);

    const elegida = idPreferido
      ? firmadas.find((f) => f.id === idPreferido)
      : firmadas[0];
    if (elegida) abrir(elegida);
    else setSeleccionada(null);
    // abrir solo usa setters de estado, que React garantiza estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "supervisor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargar("pendiente");
      contarPendientes();
    });
  }, [router, cargar]);

  // Al cambiar la busqueda o la pagina, se vuelve a pedir al servidor.
  useEffect(() => {
    if (!session) return;
    cargar(filtro, { pag: pagina, buscar: termino, silencioso: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termino, pagina]);

  // Al escribir algo nuevo se vuelve a la primera pagina: quedarse en
  // la cinco de un resultado distinto no tiene sentido.
  useEffect(() => {
    setPagina(0);
  }, [termino, filtro]);

  function cambiarFiltro(clave) {
    setFiltro(clave);
    setPagina(0);
    setSeleccionada(null);
    setModoRechazo(false);
    setMotivo("");
    cargar(clave, { buscar: termino });
  }

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
    await cargar("pendiente", { idPreferido: id, silencioso: true });
    await contarPendientes();
  }

  async function soltar(sol) {
    const { ok, error: e } = await soltarCaso("solicitud", sol.id);
    if (!ok) return setError("No se pudo soltar el caso: " + e);
    await cargar(filtro, { silencioso: true });
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
      cargar(filtro, { silencioso: true });
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
    cargar(filtro, { silencioso: true });
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
      cargar(filtro, { silencioso: true });
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
    cargar(filtro, { silencioso: true });
    contarPendientes();
  }

  if (!session) return null;

  // En la cola, cada quien ve por defecto solo lo que tiene tomado.
  // Ese es el punto de la asignacion: que quince personas no revisen
  // el mismo caso.
  const visibles =
    esCola && soloMias
      ? solicitudes.filter(
          (s) =>
            s.asignado_a === session.user.id &&
            minutosRestantes(s.asignado_en) > 0,
        )
      : solicitudes;

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
        primeraCarga
          ? "Cargando..."
          : esCola
            ? `${solicitudes.length} ${solicitudes.length === 1 ? "comprobante espera" : "comprobantes esperan"} revisión`
            : `${total} en el historial`
      }
      acciones={
        <>
          <div className="hidden items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 sm:flex">
            {FILTROS.map((f) => (
              <button
                key={f.clave}
                onClick={() => cambiarFiltro(f.clave)}
                className={cn(
                  "pulsable rounded-md px-3 py-1.5 text-[0.8667rem] font-medium",
                  filtro === f.clave
                    ? "bg-card text-foreground shadow-panel"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
          {esCola && (
            <BotonAccion
              onClick={atenderSiguiente}
              cargando={pidiendo}
              disabled={Boolean(cola && cola.libres === 0)}
              icono={<Manos className="h-4 w-4" />}
            >
              {pidiendo ? "Tomando..." : "Atender siguiente"}
              {!pidiendo && cola && cola.libres > 0 && (
                <span className="cifras rounded-full bg-white/20 px-1.5 text-[0.7333rem]">
                  {cola.libres}
                </span>
              )}
            </BotonAccion>
          )}
        </>
      }
    >
      <BarraCarga activa={refrescando} />

      {error && (
        <div className="mb-5 animate-aparecer">
          <Aviso titulo="No se pudo completar" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        </div>
      )}

      {/* Filtros en movil */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 sm:hidden">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            onClick={() => cambiarFiltro(f.clave)}
            className={cn(
              "pulsable flex-1 rounded-md px-2 py-1.5 text-[0.8667rem] font-medium",
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
        {/* ══════════ Cola o historial ══════════ */}
        <section className="flex min-w-0 flex-col">
          {esCola && cola && (
            <div className="mb-3 rounded-lg border border-border bg-card p-3 shadow-panel">
              <div className="flex items-center gap-4">
                {[
                  { n: cola.mios, l: "tuyas" },
                  { n: cola.libres, l: "libres" },
                  { n: cola.tomados, l: "en curso" },
                ].map((x) => (
                  <span key={x.l} className="t-micro">
                    <span className="cifras font-semibold text-foreground">
                      {x.n}
                    </span>{" "}
                    {x.l}
                  </span>
                ))}
              </div>
              <label className="t-micro mt-2 flex cursor-pointer items-center gap-2">
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
              className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-9 text-[0.9333rem] outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
            />
            {busqueda !== termino && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <Esqueleto className="h-3 w-3 rounded-full" />
              </span>
            )}
          </div>

          {primeraCarga ? (
            <EsqueletoCola filas={5} />
          ) : visibles.length === 0 ? (
            <Vacio
              icono={<Documento className="h-5 w-5" />}
              titulo={termino ? "Sin coincidencias" : "Cola vacía"}
              detalle={
                termino
                  ? "Ninguna solicitud coincide con lo que buscas."
                  : esCola && soloMias
                    ? cola && cola.libres > 0
                      ? `Hay ${cola.libres} caso${cola.libres === 1 ? "" : "s"} libre${cola.libres === 1 ? "" : "s"}. Pulsa Atender siguiente para tomar uno.`
                      : "No tienes casos asignados y la cola está vacía."
                    : esCola
                      ? "No queda ningún comprobante por revisar. Buen trabajo."
                      : "Todavía no hay solicitudes con este estado."
              }
            />
          ) : (
            <>
              <div
                className={cn(
                  "scroll-fino -mx-1 space-y-2 overflow-y-auto px-1 transition-opacity",
                  esCola
                    ? "max-h-[calc(100vh-320px)]"
                    : "max-h-[calc(100vh-300px)]",
                  refrescando && "opacity-60",
                )}
              >
                {visibles.map((sol, i) => {
                  const activa = seleccionada?.id === sol.id;
                  const e = espera(sol.created_at);
                  return (
                    <button
                      key={sol.id}
                      onClick={() => abrir(sol)}
                      style={{ "--retraso": `${Math.min(i, 12) * 28}ms` }}
                      className={cn(
                        "entra pulsable w-full rounded-xl border bg-card p-3.5 text-left",
                        activa
                          ? "border-marca-600 shadow-alzado ring-1 ring-marca-600"
                          : "border-border hover:border-marca-200 hover:shadow-panel",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="cifras font-mono text-[0.8rem] font-semibold text-marca-700">
                          {sol.codigo}
                        </span>
                        <span
                          className={cn(
                            "ml-auto shrink-0 text-[0.7333rem]",
                            esCola && e.urgente
                              ? "font-semibold text-oro-700"
                              : "text-muted-foreground",
                          )}
                        >
                          {esCola
                            ? e.texto
                            : fechaCorta(sol.fecha_revision || sol.created_at)}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-[0.9333rem] font-semibold">
                        {sol.perfiles_cliente
                          ? `${sol.perfiles_cliente.nombres} ${sol.perfiles_cliente.apellidos}`
                          : "Cliente sin perfil"}
                      </p>
                      <div className="t-micro mt-1 flex items-center gap-2">
                        <span className="font-medium text-foreground/70">
                          {sol.tarjetas?.banco || sol.banco}
                        </span>
                        <span className="cifras font-mono">
                          ···· {sol.tarjetas?.ultimos_4 || "····"}
                        </span>
                        {!sol.comprobante && (
                          <span className="ml-auto text-red-600">
                            sin imagen
                          </span>
                        )}
                        {esCola &&
                          !soloMias &&
                          sol.asignado_a &&
                          minutosRestantes(sol.asignado_en) > 0 && (
                            <span
                              className={cn(
                                "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[0.6667rem] font-semibold uppercase",
                                sol.asignado_a === session.user.id
                                  ? "bg-marca-50 text-marca-700"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {sol.asignado_a === session.user.id
                                ? "tuya"
                                : "en curso"}
                            </span>
                          )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {!esCola && (
                <Paginador
                  pagina={pagina}
                  porPagina={POR_PAGINA}
                  total={total}
                  cargando={refrescando}
                  onCambio={setPagina}
                />
              )}
            </>
          )}
        </section>

        {/* ══════════ Detalle ══════════ */}
        <section className="min-w-0">
          {primeraCarga ? (
            <div className="space-y-4">
              <Esqueleto className="h-20 w-full rounded-xl" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Esqueleto className="h-[460px] rounded-xl" />
                <div className="space-y-4">
                  <Esqueleto className="h-40 rounded-xl" />
                  <Esqueleto className="h-32 rounded-xl" />
                </div>
              </div>
            </div>
          ) : !seleccionada ? (
            <Vacio
              icono={<Documento className="h-5 w-5" />}
              titulo="Elige una solicitud"
              detalle="Selecciona un elemento de la lista para ver el comprobante."
            />
          ) : (
            <div key={seleccionada.id} className="animate-aparecer space-y-4">
              {/* Encabezado */}
              <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-panel">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="cifras font-mono text-[0.9333rem] font-bold text-marca-700">
                      {seleccionada.codigo}
                    </h2>
                    <Estado valor={seleccionada.estado} />
                  </div>
                  <p className="t-micro mt-1">
                    Enviada el {fechaLarga(seleccionada.created_at)}
                  </p>
                </div>

                {seleccionada.estado === "pendiente" &&
                  seleccionada.asignado_a === session.user.id &&
                  minutosRestantes(seleccionada.asignado_en) > 0 && (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-md bg-oro-50 px-2 py-1 text-[0.7333rem] font-semibold text-oro-700">
                        Reservada {minutosRestantes(seleccionada.asignado_en)}{" "}
                        min
                      </span>
                      <button
                        onClick={() => soltar(seleccionada)}
                        className="pulsable rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-medium text-muted-foreground hover:bg-muted"
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
                      <p className="t-etiqueta text-marca-600">
                        Nota del cliente
                      </p>
                      <p className="mt-1 text-[0.9333rem]">
                        {seleccionada.nota_cliente}
                      </p>
                    </div>
                  )}
                </div>

                {/* Datos y acciones */}
                <div className="min-w-0 space-y-4">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                    <h3 className="t-seccion mb-3">Titular</h3>
                    <p className="text-[1rem] font-semibold">{nombre}</p>
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
                    <h3 className="t-seccion mb-3">Cuentas para depositar</h3>
                    {cargandoCuentas ? (
                      <div className="space-y-2">
                        <Esqueleto className="h-12 w-full" />
                        <Esqueleto className="h-12 w-full" />
                      </div>
                    ) : cuentas.length === 0 ? (
                      <p className="t-cuerpo rounded-lg bg-oro-50 px-3 py-2.5 text-oro-700">
                        Este cliente no registró ninguna cuenta bancaria.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {cuentas.map((c, i) => (
                          <li
                            key={c.id}
                            style={{ "--retraso": `${i * 50}ms` }}
                            className="entra flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[0.8667rem] font-semibold">
                                {c.banco}
                              </p>
                              <p className="t-etiqueta mt-0.5">
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
                              className="pulsable cifras shrink-0 rounded-md px-2 py-1 font-mono text-[0.8667rem] font-semibold text-marca-700 hover:bg-marca-50"
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
                          <BotonAccion
                            onClick={() => aprobar(seleccionada)}
                            cargando={accion === "aprobando"}
                            disabled={accion !== null}
                            tono="exito"
                            icono={<Check className="h-4 w-4" />}
                            className="w-full py-3"
                          >
                            {accion === "aprobando"
                              ? "Aprobando..."
                              : "Aprobar solicitud"}
                          </BotonAccion>
                          <BotonAccion
                            onClick={() => setModoRechazo(true)}
                            disabled={accion !== null}
                            tono="neutro"
                            icono={<Cruz className="h-4 w-4" />}
                            className="w-full hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                          >
                            Rechazar
                          </BotonAccion>
                        </div>
                      ) : (
                        <div className="animate-aparecer space-y-3">
                          <div>
                            <label className="t-seccion">
                              Motivo del rechazo
                            </label>
                            <p className="t-micro mt-0.5">
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
                            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-[0.9333rem] outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                          />
                          <span
                            className={cn(
                              "block text-[0.8rem]",
                              motivo.trim().length >= MIN_MOTIVO
                                ? "text-emerald-600"
                                : "text-muted-foreground",
                            )}
                          >
                            {motivo.trim().length} / {MIN_MOTIVO} mínimo
                          </span>
                          <div className="flex gap-2">
                            <BotonAccion
                              onClick={() => {
                                setModoRechazo(false);
                                setMotivo("");
                              }}
                              disabled={accion !== null}
                              tono="neutro"
                              className="flex-1"
                            >
                              Cancelar
                            </BotonAccion>
                            <BotonAccion
                              onClick={() => rechazar(seleccionada)}
                              cargando={accion === "rechazando"}
                              disabled={
                                accion !== null ||
                                motivo.trim().length < MIN_MOTIVO
                              }
                              tono="peligro"
                              className="flex-1"
                            >
                              {accion === "rechazando"
                                ? "Rechazando..."
                                : "Confirmar rechazo"}
                            </BotonAccion>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                      <h3 className="t-seccion mb-3">Resolución</h3>
                      <Dato etiqueta="Resuelta el">
                        {seleccionada.fecha_revision
                          ? fechaLarga(seleccionada.fecha_revision)
                          : null}
                      </Dato>
                      {seleccionada.motivo_rechazo && (
                        <div className="mt-3 rounded-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2.5">
                          <p className="t-etiqueta text-red-600">
                            Motivo comunicado al cliente
                          </p>
                          <p className="mt-1 text-[0.9333rem] text-red-900">
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
