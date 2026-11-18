"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firmarCampo, urlsFirmadas, extraerPath } from "@/lib/storage";
import { explicarError } from "@/lib/acciones";
import { puede } from "@/lib/permisos";
import { colorBanco, nombreBanco, recibeDeposito } from "@/lib/bancos";
import {
  tomarSiguiente,
  estadoCola,
  contadoresDe,
  minutosRestantes,
  RESERVA_MINUTOS,
} from "@/lib/cola";
import { resolverCaso, tomarCaso } from "@/lib/casos";
import { useRetraso, idsDeClientes, useIrAlDetalle, useAtajos } from "@/lib/hooks";
import Atajos from "@/components/atajos";
import { cn } from "@/lib/utils";
import Shell, { Documento, Check, Cruz, Manos, Reloj, Tarjeta as IconoTarjeta } from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import SinPendientes from "@/components/sinPendientes";
import Pista from "@/components/pista";
import Revisor from "@/components/revisor";
import { colorDe } from "@/lib/colores";
import BotonRefrescar from "@/components/refrescar";
import Paginador from "@/components/paginador";
import { EsqueletoCola, BarraCarga, BotonAccion, Esqueleto, CargaPantalla } from "@/components/carga";
import { Estado, Vacio, Aviso } from "@/components/marca";
import { Segmentos, Buscador, Barra, Leyenda, Motivo, Copiar, Dialogo, IconoAlerta, Tostada } from "@/components/piezas";
import { SiglaBanco, ChipBanco, DatoCorto } from "@/components/banco";

/**
 * Revisión de solicitudes (comprobantes).
 *
 * Pensada para resolverse sin bajar: la cola a la izquierda; al abrir una,
 * el comprobante en grande y, al lado, la tarjeta usada (en el color de su
 * banco), el titular con su selfie, dónde se le deposita y los botones,
 * siempre abajo a la vista. Rechazar se escribe en una ventana.
 *
 * El cliente ya pasó la verificación de identidad: aquí no se vuelve a
 * consultar su DNI.
 */

// Motivos que se repiten. Un clic los escribe y se pueden ajustar.
const MOTIVOS_FRECUENTES = [
  "El comprobante está borroso y no se lee el número de operación.",
  "El comprobante no corresponde a la tarjeta registrada.",
  "La foto está cortada: no se ve el monto o la fecha de la operación.",
  "El comprobante ya fue usado en otra solicitud.",
];
const BUCKET = "comprobantes";
const BUCKET_KYC = "kyc-documentos";

// Alto del área de trabajo: la pantalla menos el encabezado (60), los
// márgenes (40) y la barra de filtros (66). El visor resta su barra (46).
const ALTO_AREA = "2xl:h-[calc(100dvh-170px)] 2xl:min-h-[540px]";
const ALTO_VISOR = "h-[60vh] 2xl:h-[calc(100dvh-216px)] 2xl:min-h-[400px]";

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

// Todas las columnas de la solicitud: así llegan también la modalidad
// y la comisión (migración 065) sin romper si aún no se aplicó.
const CAMPOS = `*,
   tarjetas (banco, ultimos_4),
   perfiles_cliente (nombres, apellidos, tipo_documento, telefono, dni, user_id, foto_selfie)`;

const nombreDe = (c) => (c ? `${c.nombres || ""} ${c.apellidos || ""}`.trim() || "Sin nombre" : "Cliente sin perfil");
const inicialesDe = (c) =>
  c ? `${(c.nombres || "").trim()[0] || ""}${(c.apellidos || "").trim()[0] || ""}`.toUpperCase() || "?" : "?";

/** Firma la selfie de la verificación del titular. */
async function firmarSelfie(valor) {
  const path = extraerPath(BUCKET_KYC, valor);
  if (!path) return null;
  const { urls } = await urlsFirmadas(BUCKET_KYC, [path]);
  return urls[path] || null;
}

const porcentaje = (n) =>
  Number(n)
    .toFixed(2)
    .replace(/\.?0+$/, "");

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
  const [ok, setOk] = useState("");
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
  // Recortes del super administrador (pantalla Accesos).
  const puedeAprobar = puede(session, "solicitudes.aprobar");
  const puedeRechazar = puede(session, "solicitudes.rechazar");
  const esGestor = session?.rol === "gestor";

  // Evita que una respuesta lenta pise a otra mas reciente cuando el
  // usuario cambia de pestana o sigue escribiendo.
  const peticion = useRef(0);
  // La página y la búsqueda a la vista: una recarga (tiempo real, abrir un
  // caso, Actualizar) las respeta en vez de volver a la primera página sin
  // filtro.
  const vista = useRef({ pag: 0, buscar: "" });
  vista.current = { pag: pagina, buscar: termino };

  const cargar = useCallback(async (estado, opciones = {}) => {
    const {
      idPreferido = null,
      pag = vista.current.pag,
      buscar = vista.current.buscar,
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

  // Al cambiar la busqueda o la pagina, se vuelve a pedir al servidor. Al
  // abrir la pantalla no: de eso se encarga la carga inicial (si no, la
  // lista se pedía dos veces).
  const arranco = useRef(false);
  useEffect(() => {
    if (!arranco.current) {
      arranco.current = true;
      return;
    }
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
    // Varios cambios seguidos (tomar, resolver, pagar) se juntan en una sola recarga.
    let espera = null;
    const canal = supabase
      .channel(`cola-solicitudes-${Date.now().toString(36)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solicitudes" },
        () => {
          clearTimeout(espera);
          espera = setTimeout(() => {
            cargar(filtro, { silencioso: true });
            contarPendientes();
          }, 400);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
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
    cargar(clave, { pag: 0, buscar: termino });
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
    await cargar("pendiente", { idPreferido: id, pag: 0, buscar: "", silencioso: true });
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

    const [firmadas, selfie] = await Promise.all([
      firmarCampo(BUCKET, [sol], "comprobante_url", "comprobante"),
      firmarSelfie(sol.perfiles_cliente?.foto_selfie),
      cargarCuentas(sol.cliente_id),
    ]);

    // Si mientras tanto se pulsó otra, esta respuesta ya no vale.
    setSeleccionada((actual) =>
      actual && actual.id === sol.id ? { ...actual, ...firmadas[0], selfie } : actual,
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
    // quien revisa cien al día. Que se note lo que pasó.
    const quien = sol.perfiles_cliente?.nombres?.split(" ")[0];
    setOk(`Solicitud ${sol.codigo}${quien ? ` de ${quien}` : ""} ${aprobar ? "aprobada: pasa a Pagos" : "rechazada: se le avisó con el motivo"}.`);
    setModoRechazo(false);
    setMotivo("");
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
    if (texto.length < MIN_MOTIVO) return;
    await resolver(sol, false, texto);
  }

  // ── Teclado ──
  const enRevision = seleccionada?.estado === "pendiente" && puedeResolver && accion === null && !ajeno;
  useAtajos(
    {
      a: enRevision && puedeAprobar ? () => aprobar(seleccionada) : null,
      r: enRevision && puedeRechazar ? () => setModoRechazo(true) : null,
      n: esCola && puedeResolver && !pidiendo ? () => atenderSiguiente() : null,
    },
    Boolean(session),
  );

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

  const s = seleccionada;
  const cliente = s?.perfiles_cliente;
  const nombre = nombreDe(cliente);
  const tipoDoc = cliente?.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI";
  const bancoTarjeta = s?.tarjetas?.banco || s?.banco;
  const resoluble = s?.estado === "pendiente" && puedeResolver;

  const libres = Number(cola?.libres || 0);
  const esMia =
    s?.estado === "pendiente" &&
    s?.asignado_a === session.user.id &&
    minutosRestantes(s?.asignado_en) > 0;

  // Dónde se le deposita: la cuenta que eligió en la solicitud. Si ya no
  // está activa queda lo que se guardó de ella; en solicitudes antiguas,
  // sin cuenta elegida, las que pueden recibir según el banco.
  const elegida = s?.cuenta_deposito_id ? cuentas.find((c) => c.id === s.cuenta_deposito_id) : null;
  const guardada =
    !elegida && s?.deposito_banco
      ? { banco: s.deposito_banco, tipo: s.deposito_tipo, ultimos4: s.deposito_ultimos4 }
      : null;
  const destinos = elegida ? [elegida] : guardada ? [] : cuentas.filter((c) => recibeDeposito(bancoTarjeta, c));
  const otrasCuentas = cuentas.filter((c) => !destinos.includes(c));

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

      {/* Con una solicitud abierta, el error sale en su panel. */}
      {error && !s && (
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

      <div className={cn("grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]", ALTO_AREA)}>
        {/* ══════════ Cola o historial ══════════ */}
        <section className="flex min-h-0 min-w-0 flex-col">
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
                  "max-h-[60vh] 2xl:max-h-none",
                  refrescando && "opacity-60",
                )}
              >
                {visibles.map((sol, i) => {
                  const activa = s?.id === sol.id;
                  const e = espera(sol.created_at);
                  const tomada = esCola && sol.asignado_a && minutosRestantes(sol.asignado_en) > 0;
                  return (
                    <button
                      key={sol.id}
                      onClick={() => abrir(sol)}
                      style={{ "--retraso": `${Math.min(i, 12) * 28}ms` }}
                      className={cn(
                        "entra pulsable flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left",
                        tomada &&
                          (sol.asignado_a === session.user.id
                            ? "border-l-4 border-l-marca-600"
                            : `border-l-4 ${colorDe(sol.asignado_a).borde}`),
                        activa
                          ? "border-marca-500 shadow-alzado ring-2 ring-marca-500/30"
                          : "border-border hover:border-marca-200 hover:shadow-panel",
                      )}
                    >
                      <SiglaBanco banco={sol.tarjetas?.banco || sol.banco} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-bold text-foreground">{nombreDe(sol.perfiles_cliente)}</span>
                          <span
                            className={cn(
                              "ml-auto inline-flex shrink-0 items-center gap-1 text-xs",
                              esCola && e.urgente ? "font-bold text-oro-700" : "font-medium text-muted-foreground",
                            )}
                          >
                            {esCola && e.urgente && <Reloj className="h-3.5 w-3.5" />}
                            {esCola ? e.texto : fechaCorta(sol.fecha_revision || sol.created_at)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-chico text-muted-foreground">
                          <span className="cifras min-w-0 truncate font-mono">{sol.codigo}</span>
                          {!sol.comprobante_url && (
                            <span className="shrink-0 rounded bg-red-50 px-1.5 py-px text-xs font-bold text-red-700">Sin foto</span>
                          )}
                          {!esCola && <Estado valor={sol.estado} className="ml-auto" />}
                          {tomada && (
                            <span className="ml-auto shrink-0">
                              <Revisor
                                id={sol.asignado_a}
                                persona={equipo[sol.asignado_a]}
                                minutos={minutosRestantes(sol.asignado_en)}
                                propio={sol.asignado_a === session.user.id}
                              />
                            </span>
                          )}
                        </span>
                      </span>
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
        <section ref={detalleRef} className="min-h-0 min-w-0 scroll-mt-20">
          {primeraCarga ? (
            <div className="grid h-full gap-4 2xl:grid-cols-[minmax(0,1fr)_410px]">
              <Esqueleto className={cn("rounded-xl", ALTO_VISOR)} />
              <Esqueleto className="h-[420px] rounded-xl 2xl:h-full" />
            </div>
          ) : !s ? (
            <Vacio
              className="h-full min-h-[360px]"
              icono={<Documento />}
              titulo="Elige una solicitud de la lista"
              detalle="Al pulsarla se cargan el comprobante, los datos del titular y su cuenta de destino."
            />
          ) : (
            <div key={s.id} className="grid h-full animate-aparecer gap-4 2xl:grid-cols-[minmax(0,1fr)_410px]">
              {/* Comprobante */}
              <div className="min-w-0">
                {cargandoDetalle && !s.comprobante && !s.comprobante_error ? (
                  <Esqueleto className={cn("w-full rounded-xl", ALTO_VISOR)} />
                ) : (
                  <Visor
                    url={s.comprobante}
                    error={s.comprobante_error}
                    path={s.comprobante_path}
                    titulo="Comprobante de la operación"
                    alto={ALTO_VISOR}
                  />
                )}
              </div>

              {/* Decisión: todo en una columna, los botones siempre abajo */}
              <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-panel">
                <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
                  {/* La tarjeta usada, con el color de su banco */}
                  <div
                    className="flex items-center gap-3 px-5 py-3.5"
                    style={{ backgroundColor: colorBanco(bancoTarjeta).fondo, color: colorBanco(bancoTarjeta).texto }}
                  >
                    <IconoTarjeta className="h-6 w-6 shrink-0 opacity-80" />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-baseline gap-2.5">
                        <span className="min-w-0 truncate text-lg font-extrabold leading-tight">{nombreBanco(bancoTarjeta)}</span>
                        <span className="cifras shrink-0 font-mono text-lg font-bold tracking-wider">···· {s.tarjetas?.ultimos_4 || "····"}</span>
                      </p>
                      <p className="mt-0.5 text-xs font-semibold opacity-85">Tarjeta usada</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/95 p-px">
                      <Estado valor={s.estado} />
                    </span>
                  </div>

                  {/* Código, espera y reserva */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-5 py-2.5">
                    <span className="cifras font-mono text-sm font-bold text-marca-700">{s.codigo}</span>
                    <Copiar texto={s.codigo} soloIcono etiqueta="Copiar el código" />
                    <Pista texto={`Enviada el ${fechaLarga(s.created_at)}`}>
                      <span className="cursor-help text-xs text-muted-foreground">{espera(s.created_at).texto}</span>
                    </Pista>
                    {esMia && (
                      <Pista fin texto="Es tuya mientras dure la reserva. Al agotarse vuelve sola a la cola y cualquiera puede tomarla.">
                        <span className="cifras ml-auto inline-flex cursor-help items-center gap-1 rounded-full bg-oro-100 px-2 py-0.5 text-xs font-bold text-oro-700">
                          <Reloj className="h-3.5 w-3.5" />
                          {minutosRestantes(s.asignado_en)} min
                        </span>
                      </Pista>
                    )}
                  </div>

                  {/* Avisos */}
                  {(error || ajeno) && (
                    <div className="space-y-2 border-b border-border p-3">
                      {error && (
                        <Aviso titulo="No se pudo completar" onCerrar={() => setError("")}>
                          {error}
                        </Aviso>
                      )}
                      {ajeno && (
                        <Aviso tono="espera" titulo={`${ajeno.quien} está revisando este caso`}>
                          Puedes mirarlo, pero resolverlo es suyo hasta que pasen {ajeno.libre_en} min.
                        </Aviso>
                      )}
                    </div>
                  )}

                  {/* Titular */}
                  <div className="space-y-3.5 border-b border-border px-5 py-4">
                    <div className="flex items-center gap-4">
                      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-marca-50 ring-2 ring-border ring-offset-2">
                        {s.selfie ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.selfie} alt={`Selfie de ${nombre}`} className="h-full w-full object-cover" />
                        ) : (
                          <span
                            className={cn(
                              "flex h-full w-full items-center justify-center text-md font-bold text-marca-700",
                              cargandoDetalle && "animate-pulse",
                            )}
                          >
                            {inicialesDe(cliente)}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="t-etiqueta">Titular</p>
                        <p className="mt-0.5 break-words text-lg font-bold leading-tight">{nombre}</p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 rounded-lg bg-muted/40 px-3.5 py-2.5">
                      <DatoCorto etiqueta={tipoDoc} copiar={cliente?.dni} mono chico>
                        {cliente?.dni}
                      </DatoCorto>
                      <DatoCorto etiqueta="Celular" copiar={cliente?.telefono} mono chico>
                        {cliente?.telefono}
                      </DatoCorto>
                    </dl>
                  </div>

                  {/* Depósito */}
                  <div className="space-y-3 border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2">
                      <p className="t-seccion">Depósito</p>
                      <Pista texto="La cuenta que eligió el cliente al enviar la solicitud. Una tarjeta de banco principal recibe en una cuenta de ahorros del mismo banco." />
                      {s.modalidad && (
                        <span
                          className={cn(
                            "ml-auto rounded-full px-2 py-0.5 text-xs font-bold",
                            s.modalidad === "siguiente" ? "bg-sky-50 text-sky-800" : "bg-muted text-foreground",
                          )}
                        >
                          {s.modalidad === "siguiente" ? "Al día siguiente" : "Mismo día"}
                          {s.porcentaje_comision != null && ` · ${porcentaje(s.porcentaje_comision)} %`}
                        </span>
                      )}
                    </div>
                    {s.modalidad === "siguiente" && s.fecha_deposito && (
                      <p className="-mt-1.5 text-xs text-muted-foreground">
                        Se paga el{" "}
                        {new Date(`${s.fecha_deposito}T12:00:00`).toLocaleDateString("es-PE", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                    )}

                    {cargandoCuentas ? (
                      <Esqueleto className="h-14 w-full rounded-lg" />
                    ) : guardada ? (
                      <CuentaDestino banco={guardada.banco} tipo={guardada.tipo} numero={guardada.ultimos4 ? `···· ${guardada.ultimos4}` : null} />
                    ) : destinos.length === 0 ? (
                      <Aviso>Sin cuenta donde depositarle.</Aviso>
                    ) : (
                      <ul className="space-y-2">
                        {destinos.map((c) => (
                          <li key={c.id}>
                            <CuentaDestino banco={c.banco} tipo={c.tipo} numero={c.numero_cuenta} copiar />
                          </li>
                        ))}
                      </ul>
                    )}
                    {!cargandoCuentas && otrasCuentas.length > 0 && (
                      <Pista
                        texto={otrasCuentas
                          .map((c) => `${nombreBanco(c.banco)} ${c.tipo === "interbancaria" ? "CCI" : "ahorros"} ${c.numero_cuenta}`)
                          .join(" · ")}
                      >
                        <span className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
                          Tiene {otrasCuentas.length} cuenta{otrasCuentas.length === 1 ? "" : "s"} más
                        </span>
                      </Pista>
                    )}
                  </div>

                  {s.nota_cliente && (
                    <div className="border-b border-border px-5 py-4">
                      <p className="t-etiqueta text-marca-600">Nota del cliente</p>
                      <p className="mt-1 text-sm">{s.nota_cliente}</p>
                    </div>
                  )}

                  {/* Resolución */}
                  {s.estado === "pendiente" && !puedeResolver ? (
                    <div className="p-4">
                      <Aviso tono="info">Estás viendo la cola como supervisor: aprobar y rechazar es del gestor que tiene el caso.</Aviso>
                    </div>
                  ) : s.estado !== "pendiente" ? (
                    <div className="space-y-3 px-5 py-4">
                      <dl>
                        <DatoCorto etiqueta={s.estado === "rechazado" ? "Rechazada el" : "Resuelta el"} completo>
                          {s.fecha_revision ? fechaLarga(s.fecha_revision) : null}
                        </DatoCorto>
                      </dl>
                      {s.motivo_rechazo && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                          <p className="t-etiqueta text-red-700">Motivo comunicado al cliente</p>
                          <p className="mt-1 text-sm text-red-900">{s.motivo_rechazo}</p>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Botones: siempre a la vista */}
                {resoluble && (puedeAprobar || puedeRechazar) && (
                  <div className="shrink-0 space-y-2 border-t border-border bg-muted/30 p-3">
                  <div className="flex gap-2">
                    {puedeAprobar && (
                      <Pista texto={ajeno ? "Otra persona tiene este caso." : null} className="block min-w-0 flex-1">
                        <BotonAccion
                          onClick={() => aprobar(s)}
                          cargando={accion === "aprobando"}
                          disabled={accion !== null || Boolean(ajeno)}
                          tono="exito"
                          tamano="grande"
                          className="w-full"
                          icono={<Check className="h-5 w-5" />}
                        >
                          {accion === "aprobando" ? "Aprobando..." : "Aprobar"}
                        </BotonAccion>
                      </Pista>
                    )}
                    {puedeRechazar && (
                      <BotonAccion
                        onClick={() => setModoRechazo(true)}
                        disabled={accion !== null || Boolean(ajeno)}
                        tono="peligroSuave"
                        tamano="grande"
                        className={puedeAprobar ? "shrink-0" : "w-full"}
                        icono={<Cruz className="h-4 w-4" />}
                      >
                        Rechazar
                      </BotonAccion>
                    )}
                  </div>
                  <Atajos items={[puedeAprobar && ["A", "aprobar"], puedeRechazar && ["R", "rechazar"], esCola && ["N", "siguiente"]]} />
                  </div>
                )}
              </aside>
            </div>
          )}
        </section>
      </div>

      {/* Rechazar: en una ventana, sin mover la ficha. */}
      <Dialogo
        abierto={modoRechazo}
        onCerrar={() => setModoRechazo(false)}
        bloqueado={accion === "rechazando"}
        titulo="Rechazar la solicitud"
        descripcion="El cliente lee este texto en su app. Dile exactamente qué corregir para que pueda volver a enviarlo."
        tono="peligro"
        icono={<IconoAlerta />}
        ancho="max-w-lg"
        pie={
          <>
            <BotonAccion tono="neutro" disabled={accion !== null} onClick={() => setModoRechazo(false)}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              tono="peligro"
              onClick={() => s && rechazar(s)}
              cargando={accion === "rechazando"}
              disabled={accion !== null || motivo.trim().length < MIN_MOTIVO}
            >
              {accion === "rechazando" ? "Rechazando..." : "Confirmar rechazo"}
            </BotonAccion>
          </>
        }
      >
        <Motivo
          id="motivo"
          etiqueta="Motivo"
          valor={motivo}
          onCambio={setMotivo}
          minimo={MIN_MOTIVO}
          filas={4}
          sugerencias={MOTIVOS_FRECUENTES}
          placeholder="Ej: El voucher está borroso y no se distingue el número de operación."
        />
      </Dialogo>

      <SinPendientes visible={sinPendientes} onCerrar={() => setSinPendientes(false)} />
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />

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

/** La cuenta donde se deposita, con su banco en color. */
function CuentaDestino({ banco, tipo, numero, copiar = false }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
      <SiglaBanco banco={banco} className="h-9 w-9 text-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          {nombreBanco(banco)}
          <span className="text-xs font-semibold text-muted-foreground">{tipo === "interbancaria" ? "CCI" : "Ahorros"}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1">
          <span className="cifras truncate font-mono text-md font-bold text-marca-700">{numero || "—"}</span>
          {copiar && numero && <Copiar texto={numero} soloIcono etiqueta="Copiar el número de cuenta" />}
        </p>
      </div>
    </div>
  );
}
