"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firmarCampo } from "@/lib/storage";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import {
  tomarSiguiente,
  soltarCaso,
  estadoCola,
  contadoresDe,
  minutosRestantes,
  RESERVA_MINUTOS,
} from "@/lib/cola";
import { resolverCaso, tomarCaso } from "@/lib/casos";
import { useRetraso, idsDeClientes } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Documento, Check, Cruz, Manos } from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import Pista from "@/components/pista";
import Revisor from "@/components/revisor";
import { colorDe } from "@/lib/colores";
import BotonRefrescar from "@/components/refrescar";
import Paginador from "@/components/paginador";
import {
  EsqueletoCola,
  BarraCarga,
  BotonAccion,
  Esqueleto,
} from "@/components/carga";
import { Estado, Dato, Vacio, Aviso } from "@/components/marca";

const BUCKET = "comprobantes";
/** Iniciales del correo de quien atiende, para la marca de la fila. */
function inicial(email) {
  return (email || "?").trim().charAt(0).toUpperCase();
}

const POR_PAGINA = 25;
const MIN_MOTIVO = 10;

const FILTROS = [
  { clave: "pendiente", etiqueta: "Por revisar" },
  { clave: "aprobado", etiqueta: "Aprobadas" },
  // Sin esta pestaña, una solicitud desaparecia de "Aprobadas" en cuanto
  // Pagos la pagaba, y el revisor no tenia donde encontrarla.
  { clave: "pagado", etiqueta: "Pagadas" },
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
  const [session, setSession] = useState(sesionEnCache);
  const [solicitudes, setSolicitudes] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [seleccionada, setSeleccionada] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [modoRechazo, setModoRechazo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  // Mensaje de "lo tiene otro": se muestra en ventana, no en una linea.
  const [conflicto, setConflicto] = useState(null);
  // id -> correo de cada persona del equipo. Sirve para decir quién
  // tiene cada caso sin pedir el dato fila por fila.
  const [equipo, setEquipo] = useState({});
  // Quien tiene el caso abierto, cuando no es de quien mira.
  const [ajeno, setAjeno] = useState(null);
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

    // La lista no firma ninguna imagen. Antes se firmaban las 25 de la
    // página para mostrar una sola, y eso retrasaba la carga entera.
    // Cada comprobante se firma al abrirlo.
    const filas = data || [];
    setSolicitudes(filas);
    setTotal(count || 0);
    setPrimeraCarga(false);
    setRefrescando(false);

    // Solo se abre sola la solicitud que el usuario acaba de tomar con
    // "Atender siguiente". En cualquier otro caso la lista queda
    // esperando a que él elija.
    if (idPreferido) {
      const elegida = filas.find((f) => f.id === idPreferido);
      if (elegida) abrir(elegida);
    } else {
      setSeleccionada((actual) =>
        actual && filas.some((f) => f.id === actual.id) ? actual : null,
      );
    }
    // abrir solo usa setters de estado, que React garantiza estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "supervisor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      // Un supervisor o un admin no reciben casos: si abrieran en
      // "Míos" verían la cola vacía y parecería que no se repartió nada.
      if (s.rol !== "gestor") setSoloMias(false);
      supabase
        .from("users")
        .select("id, email, rol")
        .neq("rol", "cliente")
        .then(({ data }) =>
          setEquipo(
            Object.fromEntries(
              (data || []).map((u) => [u.id, { email: u.email, rol: u.rol }]),
            ),
          ),
        );
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
  /**
   * Mientras la cola esta en pantalla, se actualiza sola: si otro toma
   * un caso o lo resuelve, se ve en el momento y no despues de pulsar
   * actualizar. Al salir de la pantalla la escucha se cierra.
   */
  useEffect(() => {
    if (!session) return;
    const canal = supabase
      .channel(`cola-solicitudes-${Date.now().toString(36)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solicitudes" },
        () => {
          cargar(filtro, { silencioso: true });
          contarPendientes();
        },
      )
      .subscribe();
    return () => supabase.removeChannel(canal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, filtro]);

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

  /**
   * Carga el detalle de una solicitud al pulsarla.
   *
   * Los datos de texto ya vienen con la lista, así que se muestran de
   * inmediato y solo se espera por la imagen y las cuentas. Así la
   * pantalla no aparece vacía mientras llega lo pesado.
   */
  async function abrir(sol) {
    setSeleccionada(sol);
    setMotivo("");
    setModoRechazo(false);
    setAjeno(null);
    setCargandoDetalle(true);

    // Abrir un caso libre lo toma. Antes se podia estar diez minutos
    // con una solicitud en pantalla y para el resto seguia libre.
    if (esCola && sol.estado === "pendiente") {
      const r = await tomarCaso("solicitud", sol.id);
      if (!r.ok && r.motivo === "TOMADO") setAjeno(r);
      cargar(filtro, { silencioso: true });
      contarPendientes();
    }

    const [firmadas] = await Promise.all([
      firmarCampo(BUCKET, [sol], "comprobante_url", "comprobante"),
      cargarCuentas(sol.cliente_id),
    ]);

    // Si mientras tanto se pulsó otra, esta respuesta ya no vale.
    setSeleccionada((actual) =>
      actual && actual.id === sol.id ? { ...actual, ...firmadas[0] } : actual,
    );
    setCargandoDetalle(false);
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

  /**
   * Aprobar y rechazar pasan por resolver_caso: una sola puerta que
   * bloquea la fila, comprueba que siga pendiente y que la tenga quien
   * la resuelve, cambia el estado, avisa al cliente y deja auditoria.
   * Antes eso eran cuatro llamadas sueltas desde el navegador.
   */
  async function resolver(sol, aprobar, texto) {
    setAccion(aprobar ? "aprobando" : "rechazando");
    setError("");

    const r = await resolverCaso({
      tipo: "solicitud",
      id: sol.id,
      aprobar,
      motivo: texto,
    });
    setAccion(null);

    if (!r.ok) {
      if (r.motivo === "TOMADO" || r.motivo === "RESUELTO") {
        // Se cierra el caso abierto: ya no es suyo y dejarlo en pantalla
        // invita a volver a intentarlo.
        setConflicto(r);
        setSeleccionada(null);
        setModoRechazo(false);
        setMotivo("");
      } else {
        setError(r.mensaje);
      }
      cargar(filtro, { silencioso: true });
      contarPendientes();
      return;
    }

    cargar(filtro, { silencioso: true });
    contarPendientes();
  }

  async function aprobar(sol) {
    await resolver(sol, true, null);
  }

  async function rechazar(sol) {
    const texto = motivo.trim();
    if (texto.length < MIN_MOTIVO) {
      setError(
        `Explica el motivo con al menos ${MIN_MOTIVO} caracteres: el cliente lo va a leer en su app.`,
      );
      return;
    }
    await resolver(sol, false, texto);
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
          {esCola && (
            <div className="mb-3 flex items-center gap-2">
              <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/60 p-1">
                {[
                  { v: true, t: "Míos", n: cola?.mios },
                  { v: false, t: "Toda la cola", n: cola?.pendientes },
                ].map((x) => (
                  <button
                    key={x.t}
                    onClick={() => setSoloMias(x.v)}
                    className={cn(
                      "pulsable flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.8667rem] font-medium",
                      soloMias === x.v
                        ? "bg-card text-foreground shadow-panel"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {x.t}
                    {x.n > 0 && (
                      <span className="cifras rounded-full bg-muted px-1.5 text-[0.7333rem] font-semibold">
                        {x.n}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <span className="ml-auto">
                <BotonRefrescar
                  girando={refrescando}
                  onClick={() => {
                    cargar(filtro, { silencioso: true });
                    contarPendientes();
                  }}
                  texto="Volver a pedir la cola: casos nuevos, tomados por otros o con la reserva vencida"
                />
              </span>

              {cola?.libres > 0 && (
                <Pista
                  texto={`${cola.libres} sin dueño ahora mismo: nadie las tomó o se les venció la reserva de ${RESERVA_MINUTOS} minutos.`}
                >
                  <span className="cifras rounded-full bg-oro-50 px-2 py-1 text-[0.7333rem] font-semibold text-oro-700">
                    {cola.libres} libres
                  </span>
                </Pista>
              )}
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
                      ? `${cola.libres} libre${cola.libres === 1 ? "" : "s"} en la cola: pulsa Atender siguiente.`
                      : "Nada asignado a ti."
                    : esCola
                      ? "Sin comprobantes por revisar."
                      : "Sin solicitudes en este estado."
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
                        // Franja del color de quien lo atiende: se
                        // reconoce de un vistazo sin leer cada fila.
                        esCola &&
                          sol.asignado_a &&
                          minutosRestantes(sol.asignado_en) > 0 &&
                          (sol.asignado_a === session.user.id
                            ? "border-l-4 border-l-marca-600"
                            : `border-l-4 ${colorDe(sol.asignado_a).borde}`),
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
                        {!sol.comprobante_url && (
                          <Pista texto="El cliente envió esta solicitud sin comprobante." fin className="ml-auto">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                          </Pista>
                        )}
                        {esCola &&
                          sol.asignado_a &&
                          minutosRestantes(sol.asignado_en) > 0 && (
                            <span className="ml-auto">
                              <Revisor
                                id={sol.asignado_a}
                                persona={equipo[sol.asignado_a]}
                                minutos={minutosRestantes(sol.asignado_en)}
                                propio={sol.asignado_a === session.user.id}
                              />
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
              titulo="Elige una solicitud de la lista"
              detalle="Al pulsar una se carga su comprobante y los datos del cliente."
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
                  <Pista
                    texto={`Enviada el ${fechaLarga(seleccionada.created_at)}`}
                  >
                    <span className="t-micro mt-1">
                      {espera(seleccionada.created_at).texto}
                    </span>
                  </Pista>
                </div>

                {seleccionada.estado === "pendiente" &&
                  seleccionada.asignado_a === session.user.id &&
                  minutosRestantes(seleccionada.asignado_en) > 0 && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Pista
                        fin
                        texto="Es tuya mientras dure la reserva. Al agotarse vuelve a la cola y cualquiera puede tomarla."
                      >
                        <span className="cifras rounded-md bg-oro-50 px-2 py-1 text-[0.7333rem] font-semibold text-oro-700">
                          {minutosRestantes(seleccionada.asignado_en)} min
                        </span>
                      </Pista>
                      <Pista fin texto="Devolverla a la cola para que la tome otra persona.">
                        <button
                          onClick={() => soltar(seleccionada)}
                          className="pulsable rounded-lg border border-border px-2.5 py-1.5 text-[0.8rem] font-medium text-muted-foreground hover:bg-muted"
                        >
                          Soltar
                        </button>
                      </Pista>
                    </div>
                  )}
              </div>

              {ajeno && (
                <div className="flex items-center gap-3 rounded-xl border border-oro-300/60 bg-oro-50 px-4 py-3">
                  <span className="text-lg">👀</span>
                  <p className="text-[0.8667rem] text-oro-700">
                    <strong>{ajeno.quien}</strong> está revisando este caso.
                    Puedes mirarlo, pero resolverlo es suyo hasta que pasen{" "}
                    {ajeno.libre_en} min.
                  </p>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {/* Comprobante */}
                <div className="min-w-0">
                  {cargandoDetalle ? (
                    <Esqueleto className="h-[460px] w-full rounded-lg" />
                  ) : (
                    <Visor
                      url={seleccionada.comprobante}
                      error={seleccionada.comprobante_error}
                      path={seleccionada.comprobante_path}
                      titulo="Comprobante de la operación"
                      alto="h-[460px]"
                    />
                  )}
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
                    <div className="mb-3 flex items-center gap-1.5">
                      <h3 className="t-seccion">Cuenta de destino</h3>
                      <Pista texto="El pago se deposita en una cuenta del mismo banco de la tarjeta. Las de otros bancos salen atenuadas." />
                    </div>
                    {cargandoCuentas ? (
                      <div className="space-y-2">
                        <Esqueleto className="h-12 w-full" />
                        <Esqueleto className="h-12 w-full" />
                      </div>
                    ) : cuentas.length === 0 ? (
                      <p className="t-cuerpo rounded-lg bg-red-50 px-3 py-2.5 text-red-700">
                        Sin cuenta registrada: no hay dónde depositarle.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {cuentas.map((c, i) => {
                          const mismoBanco =
                            c.banco ===
                            (seleccionada.tarjetas?.banco || seleccionada.banco);
                          return (
                            <li
                              key={c.id}
                              style={{ "--retraso": `${i * 50}ms` }}
                              className={cn(
                                "entra flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
                                mismoBanco
                                  ? "border-emerald-200 bg-emerald-50/60"
                                  : "border-border bg-muted/30 opacity-60",
                              )}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[0.8667rem] font-semibold">
                                  {c.banco}
                                </p>
                                <p className="t-etiqueta mt-0.5">
                                  {c.tipo === "interbancaria" ? "CCI" : "Ahorros"}
                                </p>
                              </div>
                              <Pista fin texto="Copiar el número">
                                <button
                                  onClick={() =>
                                    navigator.clipboard?.writeText(c.numero_cuenta)
                                  }
                                  className="pulsable cifras shrink-0 rounded-md px-2 py-1 font-mono text-[0.8667rem] font-semibold text-marca-700 hover:bg-marca-50"
                                >
                                  {c.numero_cuenta}
                                </button>
                              </Pista>
                            </li>
                          );
                        })}
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
                            disabled={accion !== null || Boolean(ajeno)}
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
                            disabled={accion !== null || Boolean(ajeno)}
                            tono="neutro"
                            icono={<Cruz className="h-4 w-4" />}
                            className="w-full hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                          >
                            Rechazar
                          </BotonAccion>
                        </div>
                      ) : (
                        <div className="animate-aparecer space-y-3">
                          <div className="flex items-center gap-1.5">
                            <label htmlFor="motivo" className="t-seccion">
                              Motivo del rechazo
                            </label>
                            <Pista texto="El cliente lee este texto en su app. Dile exactamente qué corregir para que pueda volver a enviarlo." />
                          </div>
                          <textarea
                            id="motivo"
                            autoFocus
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            rows={4}
                            placeholder="Ej: El voucher está borroso y no se distingue el número de operación."
                            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-[0.9333rem] outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                          />
                          <span
                            className={cn(
                              "cifras block text-right text-[0.8rem]",
                              motivo.trim().length >= MIN_MOTIVO
                                ? "text-emerald-600"
                                : "text-muted-foreground",
                            )}
                          >
                            {motivo.trim().length}/{MIN_MOTIVO}
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
      <Conflicto
        mensaje={conflicto?.mensaje}
        titulo={conflicto?.titulo}
        onCerrar={() => setConflicto(null)}
        onSiguiente={() => {
          setConflicto(null);
          atenderSiguiente();
        }}
      />
    </Shell>
  );
}
