"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firmarCampo } from "@/lib/storage";
import { explicarError } from "@/lib/acciones";
import {
  tomarSiguiente,
  soltarCaso,
  estadoCola,
  contadoresDe,
  minutosRestantes,
  RESERVA_MINUTOS,
} from "@/lib/cola";
import { resolverCaso, tomarCaso } from "@/lib/casos";
import { useRetraso, idsDeClientes, useIrAlDetalle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Documento, Check, Cruz, Manos, Reloj } from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import SinPendientes from "@/components/sinPendientes";
import Pista from "@/components/pista";
import Revisor from "@/components/revisor";
import { colorDe } from "@/lib/colores";
import BotonRefrescar from "@/components/refrescar";
import Paginador from "@/components/paginador";
import { EsqueletoCola, BarraCarga, BotonAccion, Esqueleto, CargaPantalla } from "@/components/carga";
import { Estado, Dato, Vacio, Aviso } from "@/components/marca";
import { Segmentos, Buscador, Barra, Panel, Leyenda, Motivo, Copiar } from "@/components/piezas";


// Motivos que se repiten. Un clic los escribe y se pueden ajustar.
const MOTIVOS_FRECUENTES = [
  "El comprobante está borroso y no se lee el número de operación.",
  "El comprobante no corresponde a la tarjeta registrada.",
  "La foto está cortada: no se ve el monto o la fecha de la operación.",
  "El comprobante ya fue usado en otra solicitud.",
];
const BUCKET = "comprobantes";

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
  const [sinPendientes, setSinPendientes] = useState(false);
  const [contadores, setContadores] = useState({});
  const [cola, setCola] = useState(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [soloMias, setSoloMias] = useState(true);
  const router = useRouter();
  const detalleRef = useIrAlDetalle(seleccionada?.id);

  const termino = useRetraso(busqueda, 350);
  const esCola = filtro === "pendiente";
  // Revisar es del gestor. El supervisor entra a ver como va el trabajo
  // y quien atiende cada caso, pero no aprueba ni rechaza. El admin
  // conserva el mando como salida de emergencia.
  const puedeResolver = ["gestor", "admin"].includes(session?.rol);
  const esGestor = session?.rol === "gestor";

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
  async function atenderSiguiente({ auto = false } = {}) {
    setPidiendo(true);
    setError("");
    const { id, vacia, error: e } = await tomarSiguiente("solicitud");
    setPidiendo(false);
    if (e) return setError("No se pudo tomar el siguiente caso: " + e);
    if (vacia) {
      // Al encadenar casos se avisa con una ventana: cierra el ciclo de
      // trabajo. Pedido a mano basta una línea.
      if (auto) setSinPendientes(true);
      else setError("No queda ningún caso libre en la cola por ahora.");
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
    // con una solicitud en pantalla y para el resto seguia libre. El
    // supervisor queda fuera: mirar la cola no debe vaciarsela al
    // gestor que la esta atendiendo.
    if (puedeResolver && esCola && sol.estado === "pendiente") {
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

    // Terminado uno, va el siguiente sin pedirlo. Es el ritmo real de
    // quien revisa cien al día.
    setSeleccionada(null);
    setAjeno(null);
    await cargar(filtro, { silencioso: true });
    await contarPendientes();
    if (esCola && esGestor) await atenderSiguiente({ auto: true });
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

  if (!session) return <CargaPantalla />;

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

  const libres = Number(cola?.libres || 0);
  const esMia =
    seleccionada?.estado === "pendiente" &&
    seleccionada?.asignado_a === session.user.id &&
    minutosRestantes(seleccionada?.asignado_en) > 0;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Solicitudes"
      descripcion={
        primeraCarga
          ? "Cargando..."
          : esCola
            ? `${cola?.pendientes ?? solicitudes.length} por revisar en la cola`
            : `${total} en el historial`
      }
      ayuda="El cliente sube el comprobante de su operación. Revisa que corresponda a su tarjeta y apruébalo; luego Pagos le transfiere a su cuenta."
      acciones={
        esCola &&
        puedeResolver && (
          <BotonAccion
            onClick={() => atenderSiguiente()}
            cargando={pidiendo}
            disabled={Boolean(cola && libres === 0)}
            icono={<Manos className="h-4 w-4" />}
            title={libres === 0 ? "No hay casos libres ahora" : "Te asigna el caso libre que más tiempo lleva esperando"}
          >
            <span className="hidden sm:inline">{pidiendo ? "Tomando..." : "Atender siguiente"}</span>
            {!pidiendo && libres > 0 && <span className="cifras rounded-full bg-white/20 px-1.5 text-xs">{libres}</span>}
          </BotonAccion>
        )
      }
    >
      <BarraCarga activa={refrescando} />

      {error && (
        <Aviso className="mb-4 animate-aparecer" titulo="No se pudo completar" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={filtro}
          onCambio={cambiarFiltro}
          opciones={FILTROS.map((f) => ({
            ...f,
            cuenta: f.clave === "pendiente" ? (cola?.pendientes ?? null) : null,
            urgente: f.clave === "pendiente",
          }))}
        />
        <Buscador
          valor={busqueda}
          onCambio={setBusqueda}
          pendiente={busqueda !== termino}
          placeholder="Código, nombre, DNI o banco"
          className="w-full sm:w-72"
        />
        <div className="ml-auto flex items-center gap-2">
          {esCola && libres > 0 && (
            <Pista texto={`Sin dueño ahora mismo: nadie las tomó o se les venció la reserva de ${RESERVA_MINUTOS} minutos.`}>
              <span className="cifras cursor-help rounded-full bg-oro-100 px-2.5 py-1 text-xs font-bold text-oro-700">{libres} libres</span>
            </Pista>
          )}
          {!puedeResolver && (
            <Pista texto="Como supervisor ves toda la cola y quién atiende cada caso. Aprobar y rechazar es del gestor que lo tiene.">
              <span className="cursor-help rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Solo lectura</span>
            </Pista>
          )}
          {esCola && (
            <BotonRefrescar
              girando={refrescando}
              onClick={() => {
                cargar(filtro, { silencioso: true });
                contarPendientes();
              }}
              texto="Actualizar la cola: casos nuevos, tomados por otros o con la reserva vencida"
            />
          )}
        </div>
      </Barra>

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* ══════════ Cola o historial ══════════ */}
        <section className="flex min-w-0 flex-col xl:sticky xl:top-[76px] xl:max-h-[calc(100dvh-150px)] xl:self-start">
          {esCola && esGestor && (
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              Tus casos
              <span className="cifras rounded-full bg-muted px-1.5 text-xs font-bold">{cola?.mios || 0}</span>
              <Pista texto="El sistema reparte la cola: ves solo lo que tienes tomado. Pulsa «Atender siguiente» para recibir otro." />
            </p>
          )}

          {primeraCarga ? (
            <EsqueletoCola filas={5} />
          ) : visibles.length === 0 ? (
            <Vacio
              icono={<Documento />}
              titulo={termino ? "Sin coincidencias" : esCola && soloMias ? "Nada asignado a ti" : "Sin solicitudes"}
              detalle={
                termino
                  ? "Ninguna solicitud coincide con lo que buscas."
                  : esCola && soloMias
                    ? libres > 0
                      ? `${libres} libre${libres === 1 ? "" : "s"} en la cola: pulsa «Atender siguiente».`
                      : "La cola está al día."
                    : esCola
                      ? "Sin comprobantes por revisar."
                      : "Sin solicitudes en este estado."
              }
              accion={
                esCola && puedeResolver && libres > 0 && !termino ? (
                  <BotonAccion onClick={() => atenderSiguiente()} cargando={pidiendo} icono={<Manos className="h-4 w-4" />}>
                    Atender siguiente
                  </BotonAccion>
                ) : null
              }
            />
          ) : (
            <>
              <div
                className={cn(
                  "scroll-fino -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-1 transition-opacity",
                  "max-h-[60vh] xl:max-h-none",
                  refrescando && "opacity-60",
                )}
              >
                {visibles.map((sol, i) => {
                  const activa = seleccionada?.id === sol.id;
                  const e = espera(sol.created_at);
                  const tomada = esCola && sol.asignado_a && minutosRestantes(sol.asignado_en) > 0;
                  return (
                    <button
                      key={sol.id}
                      onClick={() => abrir(sol)}
                      style={{ "--retraso": `${Math.min(i, 12) * 28}ms` }}
                      className={cn(
                        "entra pulsable w-full rounded-xl border bg-card px-3.5 py-3 text-left",
                        tomada &&
                          (sol.asignado_a === session.user.id
                            ? "border-l-4 border-l-marca-600"
                            : `border-l-4 ${colorDe(sol.asignado_a).borde}`),
                        activa
                          ? "border-marca-500 shadow-alzado ring-2 ring-marca-500/30"
                          : "border-border hover:border-marca-200 hover:shadow-panel",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="cifras font-mono text-chico font-bold text-marca-700">{sol.codigo}</span>
                        {!sol.comprobante_url && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700">Sin foto</span>
                        )}
                        <span
                          className={cn(
                            "ml-auto inline-flex shrink-0 items-center gap-1 text-xs",
                            esCola && e.urgente ? "font-bold text-oro-700" : "font-medium text-muted-foreground",
                          )}
                        >
                          {esCola && e.urgente && <Reloj className="h-3.5 w-3.5" />}
                          {esCola ? e.texto : fechaCorta(sol.fecha_revision || sol.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-md font-semibold">
                        {sol.perfiles_cliente
                          ? `${sol.perfiles_cliente.nombres} ${sol.perfiles_cliente.apellidos}`
                          : "Cliente sin perfil"}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-chico text-muted-foreground">
                        <span className="font-semibold text-foreground/75">{sol.tarjetas?.banco || sol.banco}</span>
                        <span className="cifras font-mono">···· {sol.tarjetas?.ultimos_4 || "····"}</span>
                        {!esCola && <Estado valor={sol.estado} className="ml-auto" />}
                        {tomada && (
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
                <Paginador pagina={pagina} porPagina={POR_PAGINA} total={total} cargando={refrescando} onCambio={setPagina} />
              )}
            </>
          )}

          {esCola && !primeraCarga && visibles.length > 0 && (
            <Leyenda
              className="mt-3"
              items={[
                {
                  texto: "Franja de color",
                  marca: <span className="h-3.5 w-1 rounded bg-marca-600" />,
                  pista: "Quién la atiende: azul oscuro eres tú; cada compañero tiene su color.",
                },
                {
                  texto: "Espera larga",
                  marca: <Reloj className="h-3.5 w-3.5 text-oro-700" />,
                  pista: "Lleva 12 horas o más esperando: conviene atenderla primero.",
                },
                {
                  texto: "Sin foto",
                  marca: <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />,
                  pista: "El cliente no adjuntó comprobante.",
                },
              ]}
            />
          )}
        </section>

        {/* ══════════ Detalle ══════════ */}
        <section ref={detalleRef} className="min-w-0 scroll-mt-20">
          {primeraCarga ? (
            <div className="space-y-4">
              <Esqueleto className="h-16 w-full rounded-xl" />
              <div className="grid gap-4 2xl:grid-cols-2">
                <Esqueleto className="h-[480px] rounded-xl" />
                <div className="space-y-4">
                  <Esqueleto className="h-40 rounded-xl" />
                  <Esqueleto className="h-32 rounded-xl" />
                </div>
              </div>
            </div>
          ) : !seleccionada ? (
            <Vacio
              className="min-h-[360px]"
              icono={<Documento />}
              titulo="Elige una solicitud de la lista"
              detalle="Al pulsarla se cargan el comprobante, los datos del titular y su cuenta de destino."
            />
          ) : (
            <div key={seleccionada.id} className="animate-aparecer space-y-4">
              {/* Encabezado */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-panel">
                <h2 className="cifras font-mono text-lg font-bold text-marca-700">{seleccionada.codigo}</h2>
                <Copiar texto={seleccionada.codigo} soloIcono etiqueta="Copiar el código" />
                <Estado valor={seleccionada.estado} />
                <Pista texto={`Enviada el ${fechaLarga(seleccionada.created_at)}`}>
                  <span className="cursor-help text-sm text-muted-foreground">{espera(seleccionada.created_at).texto}</span>
                </Pista>

                {esMia && (
                  <div className="ml-auto flex items-center gap-2">
                    <Pista fin texto="Es tuya mientras dure la reserva. Al agotarse vuelve a la cola y cualquiera puede tomarla.">
                      <span className="cifras inline-flex cursor-help items-center gap-1 rounded-full bg-oro-100 px-2.5 py-1 text-xs font-bold text-oro-700">
                        <Reloj className="h-3.5 w-3.5" />
                        {minutosRestantes(seleccionada.asignado_en)} min
                      </span>
                    </Pista>
                    <Pista fin texto="Devolverla a la cola para que la tome otra persona.">
                      <BotonAccion tono="neutro" tamano="chico" onClick={() => soltar(seleccionada)}>
                        Soltar
                      </BotonAccion>
                    </Pista>
                  </div>
                )}
              </div>

              {ajeno && (
                <Aviso tono="espera" titulo={`${ajeno.quien} está revisando este caso`}>
                  Puedes mirarlo, pero resolverlo es suyo hasta que pasen {ajeno.libre_en} min.
                </Aviso>
              )}

              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)]">
                {/* Comprobante */}
                <div className="min-w-0 space-y-3">
                  {cargandoDetalle ? (
                    <Esqueleto className="h-[520px] w-full rounded-xl" />
                  ) : (
                    <Visor
                      url={seleccionada.comprobante}
                      error={seleccionada.comprobante_error}
                      path={seleccionada.comprobante_path}
                      titulo="Comprobante de la operación"
                      alto="h-[520px]"
                    />
                  )}
                  {seleccionada.nota_cliente && (
                    <div className="rounded-xl border border-marca-200 bg-marca-50 px-4 py-3">
                      <p className="t-etiqueta text-marca-600">Nota del cliente</p>
                      <p className="mt-1 text-md">{seleccionada.nota_cliente}</p>
                    </div>
                  )}
                </div>

                {/* Datos y acciones */}
                <div className="min-w-0 space-y-4">
                  <Panel titulo="Titular">
                    <p className="text-base font-semibold">{nombre}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      <Dato etiqueta="DNI" mono accion={<Copiar texto={cliente?.dni} soloIcono etiqueta="Copiar DNI" />}>
                        {cliente?.dni}
                      </Dato>
                      <Dato etiqueta="Teléfono" mono accion={<Copiar texto={cliente?.telefono} soloIcono etiqueta="Copiar teléfono" />}>
                        {cliente?.telefono}
                      </Dato>
                      <Dato etiqueta="Tarjeta usada">{seleccionada.tarjetas?.banco || seleccionada.banco}</Dato>
                      <Dato etiqueta="Terminación" mono>
                        ···· {seleccionada.tarjetas?.ultimos_4}
                      </Dato>
                    </dl>
                  </Panel>

                  <Panel
                    titulo="Cuenta de destino"
                    ayuda="El pago se deposita en una cuenta del mismo banco de la tarjeta. Las de otros bancos salen atenuadas."
                  >
                    {cargandoCuentas ? (
                      <div className="space-y-2">
                        <Esqueleto className="h-12 w-full" />
                        <Esqueleto className="h-12 w-full" />
                      </div>
                    ) : cuentas.length === 0 ? (
                      <Aviso>Sin cuenta registrada: no hay dónde depositarle.</Aviso>
                    ) : (
                      <ul className="space-y-2">
                        {cuentas.map((c) => {
                          const mismoBanco = c.banco === (seleccionada.tarjetas?.banco || seleccionada.banco);
                          return (
                            <li
                              key={c.id}
                              className={cn(
                                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
                                mismoBanco ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-muted/30 opacity-60",
                              )}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{c.banco}</p>
                                <p className="text-xs font-semibold text-muted-foreground">
                                  {c.tipo === "interbancaria" ? "CCI" : "Ahorros"}
                                </p>
                              </div>
                              <span className="flex items-center gap-1">
                                <span className="cifras font-mono text-sm font-semibold text-marca-700">{c.numero_cuenta}</span>
                                <Copiar texto={c.numero_cuenta} soloIcono etiqueta="Copiar el número" />
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Panel>

                  {/* Resolución */}
                  {seleccionada.estado === "pendiente" && !puedeResolver ? (
                    <Aviso tono="info">
                      Estás viendo la cola como supervisor: aprobar y rechazar es del gestor que tiene el caso.
                    </Aviso>
                  ) : seleccionada.estado === "pendiente" ? (
                    <Panel titulo={modoRechazo ? "Rechazar la solicitud" : "Resolver"} tono={modoRechazo ? "peligro" : undefined}>
                      {!modoRechazo ? (
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <BotonAccion
                            onClick={() => aprobar(seleccionada)}
                            cargando={accion === "aprobando"}
                            disabled={accion !== null || Boolean(ajeno)}
                            tono="exito"
                            tamano="grande"
                            icono={<Check className="h-5 w-5" />}
                          >
                            {accion === "aprobando" ? "Aprobando..." : "Aprobar solicitud"}
                          </BotonAccion>
                          <BotonAccion
                            onClick={() => setModoRechazo(true)}
                            disabled={accion !== null || Boolean(ajeno)}
                            tono="peligroSuave"
                            tamano="grande"
                            icono={<Cruz className="h-4 w-4" />}
                          >
                            Rechazar
                          </BotonAccion>
                        </div>
                      ) : (
                        <div className="animate-aparecer space-y-3">
                          <Motivo
                            id="motivo"
                            etiqueta="Motivo"
                            ayuda="El cliente lee este texto en su app. Dile exactamente qué corregir para que pueda volver a enviarlo."
                            valor={motivo}
                            onCambio={setMotivo}
                            minimo={MIN_MOTIVO}
                            sugerencias={MOTIVOS_FRECUENTES}
                            placeholder="Ej: El voucher está borroso y no se distingue el número de operación."
                          />
                          <div className="flex justify-end gap-2">
                            <BotonAccion
                              onClick={() => {
                                setModoRechazo(false);
                                setMotivo("");
                              }}
                              disabled={accion !== null}
                              tono="neutro"
                            >
                              Cancelar
                            </BotonAccion>
                            <BotonAccion
                              onClick={() => rechazar(seleccionada)}
                              cargando={accion === "rechazando"}
                              disabled={accion !== null || motivo.trim().length < MIN_MOTIVO}
                              tono="peligro"
                            >
                              {accion === "rechazando" ? "Rechazando..." : "Confirmar rechazo"}
                            </BotonAccion>
                          </div>
                        </div>
                      )}
                    </Panel>
                  ) : (
                    <Panel titulo="Resolución">
                      <Dato etiqueta="Resuelta el">
                        {seleccionada.fecha_revision ? fechaLarga(seleccionada.fecha_revision) : null}
                      </Dato>
                      {seleccionada.motivo_rechazo && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                          <p className="t-etiqueta text-red-700">Motivo comunicado al cliente</p>
                          <p className="mt-1 text-md text-red-900">{seleccionada.motivo_rechazo}</p>
                        </div>
                      )}
                    </Panel>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <SinPendientes visible={sinPendientes} onCerrar={() => setSinPendientes(false)} />

      <Conflicto
        mensaje={conflicto?.mensaje}
        titulo={conflicto?.titulo}
        onCerrar={() => setConflicto(null)}
        onSiguiente={
          puedeResolver
            ? () => {
                setConflicto(null);
                atenderSiguiente();
              }
            : undefined
        }
      />
    </Shell>
  );
}
