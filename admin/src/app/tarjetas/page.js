"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firmarCampo, urlsFirmadas, extraerPath } from "@/lib/storage";
import { explicarError } from "@/lib/acciones";
import { resolverCaso, tomarCaso } from "@/lib/casos";
import { tomarSiguiente, minutosRestantes } from "@/lib/cola";
import { puede } from "@/lib/permisos";
import { colorDe } from "@/lib/colores";
import { useIrAlDetalle, useAtajos } from "@/lib/hooks";
import Atajos from "@/components/atajos";
import { cn } from "@/lib/utils";
import { colorBanco, nombreBanco } from "@/lib/bancos";
import { SiglaBanco, ChipBanco, DatoCorto } from "@/components/banco";
import Shell, { Tarjeta as IconoTarjeta, Check, Cruz, Manos, Imagen } from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import SinPendientes from "@/components/sinPendientes";
import Revisor from "@/components/revisor";
import BotonRefrescar from "@/components/refrescar";
import Pista from "@/components/pista";
import { Estado, Vacio, Aviso } from "@/components/marca";
import { EsqueletoCola, Esqueleto, BotonAccion, CargaPantalla } from "@/components/carga";
import { Segmentos, Buscador, Barra, Leyenda, Motivo, Copiar, Dialogo, IconoAlerta, Tostada } from "@/components/piezas";

/**
 * Verificación de tarjetas.
 *
 * Pensada para resolverse sin bajar: la cola a la izquierda; al abrir una
 * tarjeta, su foto en grande y, al lado, quién es el titular (su selfie de
 * la verificación, nombre, documento y cuenta), lo que hay que comprobar
 * (un punto por línea) y los botones, siempre abajo a la vista. "Comparar con su
 * DNI" pone la tarjeta junto al documento para ver el nombre.
 *
 * Aquí no se consulta el DNI contra RENIEC: eso es de Verificación.
 */

const RECHAZOS_FRECUENTES = [
  "La foto no deja ver el nombre del titular. Vuelve a tomarla completa.",
  "Los últimos 4 dígitos de la foto no coinciden con los que escribiste.",
  "Se ve el número completo de la tarjeta. Cúbrelo y deja solo los últimos 4.",
  "La tarjeta está a nombre de otra persona. Solo puedes registrar tarjetas tuyas.",
];

const BUCKET = "tarjetas-fotos";
const BUCKET_KYC = "kyc-documentos";
const FILTROS = [
  { clave: "pendiente", etiqueta: "Por verificar" },
  { clave: "aprobado", etiqueta: "Verificadas" },
  { clave: "rechazado", etiqueta: "Rechazadas" },
];
const MIN_MOTIVO = 10;

// Vistas de la foto grande.
const FRENTE = "frente";
const REVERSO = "reverso";
const COMPARAR = "comparar";
const SELFIE = "selfie";

// Alto del área de trabajo: la pantalla menos el encabezado (60), los
// márgenes (40) y la barra de filtros (66).
const ALTO_AREA = "2xl:h-[calc(100dvh-170px)] 2xl:min-h-[540px]";
// Alto del visor: el área menos las miniaturas (58 + 12) y su barra (46).
const ALTO_VISOR = "h-[52vh] 2xl:h-[calc(100dvh-290px)] 2xl:min-h-[320px]";

function fechaLarga(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "17 nov 2026, 08:30": cabe en media columna. */
function fechaCorta(iso, conHora = true) {
  if (!iso) return null;
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
  if (!conHora) return dia;
  return `${dia}, ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
}

const nombreDe = (c) => (c ? `${c.nombres || ""} ${c.apellidos || ""}`.trim() || "Sin nombre" : "Cliente sin perfil");
const inicialesDe = (c) =>
  c ? `${(c.nombres || "").trim()[0] || ""}${(c.apellidos || "").trim()[0] || ""}`.toUpperCase() || "?" : "?";

/** Firma una foto de la verificación de identidad: { url, error, path }. */
async function fotoKyc(valor) {
  const path = extraerPath(BUCKET_KYC, valor);
  if (!path) return { url: null, error: null, path: null };
  const { urls, fallos } = await urlsFirmadas(BUCKET_KYC, [path]);
  return { url: urls[path] || null, error: urls[path] ? null : fallos[path] || "No se pudo firmar el archivo.", path };
}

export default function TarjetasPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [tarjetas, setTarjetas] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [seleccionada, setSeleccionada] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [modoRechazo, setModoRechazo] = useState(false);
  // Baja de una tarjeta verificada: el cliente ya no puede hacerlo desde
  // el app ("para darla de baja, habla con un asesor").
  const [modoBaja, setModoBaja] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  const [conflicto, setConflicto] = useState(null);
  const [contadores, setContadores] = useState({});
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [vista, setVista] = useState(FRENTE);
  const [equipo, setEquipo] = useState({});
  const [ajeno, setAjeno] = useState(null);
  const [sinPendientes, setSinPendientes] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);
  // Lo que el revisor confirma haber mirado, por tarjeta.
  const [revisadoPor, setRevisadoPor] = useState({});
  const [ok, setOk] = useState("");
  const router = useRouter();
  const detalleRef = useIrAlDetalle(seleccionada?.id);

  // Verificar es del gestor; el supervisor mira como va el trabajo. El
  // admin conserva el mando.
  const puedeResolver = ["gestor", "admin"].includes(session?.rol);
  // Recortes del super administrador (pantalla Accesos).
  const puedeAprobar = puede(session, "tarjetas.aprobar");
  const puedeRechazar = puede(session, "tarjetas.rechazar");
  const esGestor = session?.rol === "gestor";

  // silencioso: solo renueva la lista, sin cerrar la ficha abierta ni
  // mostrar "cargando". Es lo que pasa al abrir una tarjeta (se toma y
  // se recarga): antes esa recarga cerraba la ficha que se acababa de
  // abrir y no había forma de aprobarla.
  const cargar = useCallback(async (estado, mias, yo, { silencioso = false } = {}) => {
    if (!silencioso) {
      setLoading(true);
      setSeleccionada(null);
      setModoRechazo(false);
      setMotivo("");
    }
    setError("");
    setFiltro(estado);

    let q = supabase
      .from("tarjetas")
      .select(
        `id, banco, ultimos_4, nombre_impreso, estado, foto_tarjeta, foto_reverso,
         motivo_rechazo, created_at, fecha_revision, asignado_a, asignado_en,
         perfiles_cliente (id, nombres, apellidos, tipo_documento, dni, telefono, user_id, foto_selfie, foto_dni_frontal)`,
      )
      .eq("estado", estado)
      .eq("activa", true);

    // El gestor solo ve lo que el sistema le repartió. En las listas ya
    // resueltas no hay reparto que respetar.
    if (estado === "pendiente" && mias && yo) {
      const vence = new Date(Date.now() - 10 * 60000).toISOString();
      q = q.eq("asignado_a", yo).gt("asignado_en", vence);
    }

    const { data, error: consultaError } = await q.order("created_at", {
      ascending: true,
    });

    if (consultaError) {
      setError("No se pudieron cargar las tarjetas: " + consultaError.message);
      setTarjetas([]);
      setLoading(false);
      return;
    }

    // La lista no firma ninguna foto: cada una se firma al abrirla.
    setTarjetas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      // Las tarjetas las verifican tambien los gestores.
      if (!["gestor", "supervisor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      // El gestor abre viendo lo suyo; supervisor y admin, toda la cola.
      const mias = s.rol === "gestor";
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
      cargar("pendiente", mias, s.user.id);
      contarPendientes();
    });
  }, [router, cargar]);

  /** Vuelve a pedir la lista con el filtro y el rol actuales. */
  function recargar(opciones) {
    cargar(filtro, session?.rol === "gestor", session?.user.id, opciones);
    contarPendientes();
  }
  const recargarRef = useRef(recargar);
  recargarRef.current = recargar;

  /**
   * La lista se actualiza sola: entra una tarjeta nueva, otro la toma o la
   * resuelve, y se ve en el momento, sin recargar la página. No cierra la
   * ficha abierta. Varios cambios seguidos se juntan en una sola recarga.
   */
  useEffect(() => {
    if (!session) return;
    let espera = null;
    const canal = supabase
      .channel(`cola-tarjetas-${Date.now().toString(36)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tarjetas" }, () => {
        clearTimeout(espera);
        espera = setTimeout(() => recargarRef.current({ silencioso: true }), 400);
      })
      .subscribe();
    return () => {
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [session]);

  /** Toma la siguiente tarjeta libre. Al encadenar avisa si no queda. */
  async function atenderSiguiente({ auto = false } = {}) {
    setPidiendo(true);
    const { id, vacia, error: e } = await tomarSiguiente("tarjeta");
    setPidiendo(false);
    if (e) return setError("No se pudo tomar la siguiente: " + e);
    if (vacia) {
      if (auto) setSinPendientes(true);
      else setError("No queda ninguna tarjeta libre por ahora.");
      recargar();
      return;
    }
    cargar("pendiente", session?.rol === "gestor", session?.user.id);
    contarPendientes();
  }

  async function contarPendientes() {
    const cuenta = async (tabla, filtros) => {
      let q = supabase.from(tabla).select("*", { count: "exact", head: true });
      for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
      const { count } = await q;
      return count || 0;
    };
    // Los tres a la vez, no uno tras otro.
    const [solicitudesPendientes, kycPendientes, tarjetasPendientes] = await Promise.all([
      cuenta("solicitudes", { estado: "pendiente" }),
      cuenta("users", { rol: "cliente", estado: "pendiente" }),
      cuenta("tarjetas", { estado: "pendiente", activa: true }),
    ]);
    setContadores({ solicitudesPendientes, kycPendientes, tarjetasPendientes });
  }

  async function abrir(t) {
    setSeleccionada(t);
    setMotivo("");
    setModoRechazo(false);
    setModoBaja(false);
    setAjeno(null);
    // Siempre se abre por el frente: es la cara obligatoria y la que
    // toda tarjeta tiene.
    setVista(FRENTE);

    // Abrirla es atenderla: así el resto del equipo la ve tomada. El
    // supervisor solo mira, y tomarla se la quitaría al gestor.
    const puedeTomar = ["gestor", "admin"].includes(session?.rol);
    if (puedeTomar && t.estado === "pendiente") {
      const r = await tomarCaso("tarjeta", t.id);
      if (!r.ok && r.motivo === "TOMADO") setAjeno(r);
      // La lista se renueva (ahora figura tomada) sin cerrar la ficha.
      recargar({ silencioso: true });
    }
    setCargandoDetalle(true);

    const c = t.perfiles_cliente;
    // Todo junto: las dos caras de la tarjeta, la selfie y el frente del
    // documento del titular y el estado de su cuenta. Cambiar de vista
    // queda inmediato.
    const [[conFrente], [conReverso], selfie, dniFrente, cuenta] = await Promise.all([
      firmarCampo(BUCKET, [t], "foto_tarjeta", "foto"),
      firmarCampo(BUCKET, [t], "foto_reverso", "reverso"),
      fotoKyc(c?.foto_selfie),
      fotoKyc(c?.foto_dni_frontal),
      c?.user_id
        ? supabase.from("users").select("estado, created_at").eq("id", c.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setSeleccionada((actual) =>
      actual && actual.id === t.id
        ? {
            ...actual,
            ...conFrente,
            ...conReverso,
            titular: {
              selfie,
              dniFrente,
              cuenta: cuenta.data || null,
            },
          }
        : actual,
    );
    setCargandoDetalle(false);
  }

  /**
   * Una sola puerta para verificar o rechazar: resolver_caso bloquea la
   * fila, comprueba que nadie más la tenga tomada, cambia el estado,
   * avisa al cliente y deja auditoría. Si otro llegó antes, lo dice con
   * nombre en vez de pisar su decisión.
   */
  async function resolver(t, aprobar, texto) {
    setAccion(aprobar ? "aprobando" : "rechazando");
    setError("");

    const r = await resolverCaso({
      tipo: "tarjeta",
      id: t.id,
      aprobar,
      motivo: texto,
    });
    setAccion(null);
    setModoRechazo(false);
    setMotivo("");

    if (!r.ok) {
      if (r.motivo === "TOMADO" || r.motivo === "RESUELTO") setConflicto(r);
      else setError(r.mensaje);
    } else {
      // Que se note lo que pasó: la ficha se cierra y llega la siguiente.
      const quien = t.perfiles_cliente?.nombres?.split(" ")[0];
      setOk(
        `Tarjeta ${nombreBanco(t.banco)} ···· ${t.ultimos_4}${quien ? ` de ${quien}` : ""} ${aprobar ? "verificada" : "rechazada: se le avisó con el motivo"}.`,
      );
    }
    setSeleccionada(null);
    setAjeno(null);
    recargar();
    if (r.ok && filtro === "pendiente" && session?.rol === "gestor") {
      await atenderSiguiente({ auto: true });
    }
  }

  async function aprobar(t) {
    await resolver(t, true, null);
  }

  async function darDeBaja(t) {
    const texto = motivoBaja.trim();
    if (texto.length < MIN_MOTIVO) return;
    setAccion("baja");
    setError("");
    const { data, error: e } = await supabase.rpc("dar_de_baja_tarjeta", { p_id: t.id, p_motivo: texto });
    setAccion(null);
    setModoBaja(false);
    if (e) {
      setError(explicarError(e));
      return;
    }
    if (data && data.ok === false) {
      setError("Esa tarjeta ya estaba dada de baja.");
    } else {
      setOk(`Tarjeta ${nombreBanco(t.banco)} ···· ${t.ultimos_4} dada de baja: se le avisó al cliente.`);
    }
    setMotivoBaja("");
    setSeleccionada(null);
    recargar();
  }

  async function rechazar(t) {
    if (motivo.trim().length < MIN_MOTIVO) return;
    await resolver(t, false, motivo.trim());
  }

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return tarjetas;
    return tarjetas.filter((x) =>
      [
        x.banco,
        x.ultimos_4,
        x.perfiles_cliente?.nombres,
        x.perfiles_cliente?.apellidos,
        x.perfiles_cliente?.dni,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [tarjetas, busqueda]);

  // ── Teclado: revisar sin soltar el teclado ──
  // Mismo orden que COMPROBAR (más abajo): 1 nombre, 2 dígitos, 3 tapado, 4 otra foto.
  const enRevision = seleccionada?.estado === "pendiente" && puedeResolver;
  const clavesRevision = seleccionada ? ["nombre", "digitos", "cubierto", ...(seleccionada.foto_reverso ? ["dos"] : [])] : [];
  const marcarPunto = (i) => () => {
    const k = clavesRevision[i];
    if (!k || !enRevision) return;
    const id = seleccionada.id;
    setRevisadoPor((m) => ({ ...m, [id]: { ...(m[id] || {}), [k]: !m[id]?.[k] } }));
  };
  const libre = accion === null && !ajeno;
  const todoMarcado = clavesRevision.length > 0 && clavesRevision.every((k) => revisadoPor[seleccionada?.id]?.[k]);
  useAtajos(
    {
      1: marcarPunto(0),
      2: marcarPunto(1),
      3: marcarPunto(2),
      4: marcarPunto(3),
      a: enRevision && puedeAprobar && libre && todoMarcado ? () => aprobar(seleccionada) : null,
      r: enRevision && puedeRechazar && libre ? () => setModoRechazo(true) : null,
      c: seleccionada ? () => setVista(COMPARAR) : null,
      f: seleccionada ? () => setVista(FRENTE) : null,
      n: filtro === "pendiente" && puedeResolver && !pidiendo ? () => atenderSiguiente() : null,
    },
    Boolean(session),
  );

  if (!session) return <CargaPantalla />;

  const s = seleccionada;
  const cliente = s?.perfiles_cliente;
  const titular = nombreDe(cliente);
  const info = s?.titular;
  const tipoDoc = cliente?.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI";
  const resoluble = s?.estado === "pendiente" && puedeResolver;
  const marcas = (s && revisadoPor[s.id]) || {};

  const COMPROBAR = s
    ? [
        // Títulos cortos y el dato a la derecha: cada punto en una línea.
        {
          clave: "nombre",
          ver: COMPARAR,
          titulo: "Nombre del titular",
          valor: s.nombre_impreso || "No lo indicó",
        },
        {
          clave: "digitos",
          ver: FRENTE,
          titulo: "Banco y últimos 4",
          valor: (
            <span className="inline-flex items-center gap-1.5">
              <ChipBanco banco={s.banco} />
              <span className="cifras font-mono tracking-wider">{s.ultimos_4}</span>
            </span>
          ),
        },
        { clave: "cubierto", ver: FRENTE, titulo: "Número completo tapado" },
        ...(s.foto_reverso ? [{ clave: "dos", ver: REVERSO, titulo: "Revisé la otra foto" }] : []),
      ]
    : [];
  const listos = COMPROBAR.filter((c) => marcas[c.clave]).length;
  const todoRevisado = listos === COMPROBAR.length;
  const faltaVerificar = ajeno
    ? "Otra persona tiene esta tarjeta."
    : !todoRevisado
      ? `Comprueba lo que falta (${listos} de ${COMPROBAR.length}).`
      : null;

  const fotoTarjeta = (cara) =>
    cara === REVERSO
      ? { url: s?.reverso, error: s?.reverso_error, path: s?.reverso_path }
      : { url: s?.foto, error: s?.foto_error, path: s?.foto_path };

  const MINIATURAS = s
    ? [
        { clave: FRENTE, titulo: "Tarjeta", detalle: "Foto principal", url: s.foto, falta: !s.foto_tarjeta },
        ...(s.foto_reverso ? [{ clave: REVERSO, titulo: "Otra foto", detalle: "Reverso u otra toma", url: s.reverso }] : []),
      ]
    : [];

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Tarjetas"
      descripcion={
        loading
          ? "Cargando..."
          : filtro === "pendiente"
            ? `${tarjetas.length} ${tarjetas.length === 1 ? "espera" : "esperan"} verificación`
            : `${tarjetas.length} en el historial`
      }
      ayuda="El cliente registra su tarjeta con una foto. Comprueba que sea suya y que el número completo esté tapado; al verificarla ya puede usarla en sus solicitudes."
      acciones={
        filtro === "pendiente" &&
        puedeResolver && (
          <BotonAccion
            onClick={() => atenderSiguiente()}
            cargando={pidiendo}
            icono={<Manos className="h-4 w-4" />}
            title="Te asigna la tarjeta libre que más tiempo lleva esperando"
          >
            <span className="hidden sm:inline">{pidiendo ? "Buscando…" : "Atender siguiente"}</span>
          </BotonAccion>
        )
      }
    >
      {/* Con una tarjeta abierta, el error sale en su panel. */}
      {error && !s && (
        <Aviso className="mb-4" titulo="No se pudo completar" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={filtro}
          onCambio={(clave) => cargar(clave, session?.rol === "gestor", session?.user.id)}
          opciones={FILTROS.map((f) => ({
            ...f,
            cuenta: f.clave === "pendiente" ? (contadores.tarjetasPendientes ?? null) : null,
            urgente: f.clave === "pendiente",
          }))}
        />
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Nombre, DNI, banco o últimos 4" className="w-full sm:w-72" />
        <div className="ml-auto flex items-center gap-2">
          {!puedeResolver && (
            <Pista texto="Como supervisor ves toda la cola y quién atiende cada tarjeta. Verificarla es del gestor que la tiene.">
              <span className="cursor-help rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Solo lectura</span>
            </Pista>
          )}
          <BotonRefrescar girando={loading} onClick={() => recargar()} texto="Actualizar la lista de tarjetas" />
        </div>
      </Barra>

      <div className={cn("grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]", ALTO_AREA)}>
        {/* ── Cola ── */}
        <section className="flex min-h-0 min-w-0 flex-col">
          {loading ? (
            <EsqueletoCola filas={4} />
          ) : visibles.length === 0 ? (
            <Vacio
              icono={<IconoTarjeta />}
              titulo={busqueda ? "Sin coincidencias" : filtro === "pendiente" ? "Cola vacía" : "Sin tarjetas"}
              detalle={
                busqueda
                  ? "Ninguna tarjeta coincide con lo que buscas."
                  : filtro === "pendiente"
                    ? esGestor
                      ? "No tienes tarjetas asignadas. Pulsa «Atender siguiente»."
                      : "No queda ninguna tarjeta por verificar."
                    : "No hay tarjetas en este estado."
              }
            />
          ) : (
            <div className="scroll-fino -mx-1 max-h-[60vh] min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-1 2xl:max-h-none">
              {visibles.map((t) => {
                const activa = s?.id === t.id;
                const tomada = t.asignado_a && minutosRestantes(t.asignado_en) > 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => abrir(t)}
                    className={cn(
                      "pulsable flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left",
                      tomada &&
                        (t.asignado_a === session.user.id ? "border-l-4 border-l-marca-600" : `border-l-4 ${colorDe(t.asignado_a).borde}`),
                      activa ? "border-marca-500 shadow-alzado ring-2 ring-marca-500/30" : "border-border hover:border-marca-200 hover:shadow-panel",
                    )}
                  >
                    <SiglaBanco banco={t.banco} />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-bold text-foreground">{nombreDe(t.perfiles_cliente)}</span>
                        {!t.foto_tarjeta ? (
                          <span className="ml-auto shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700">Sin foto</span>
                        ) : t.foto_reverso ? (
                          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
                            <Imagen className="h-3.5 w-3.5" />2
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-chico text-muted-foreground">
                          <span className="font-semibold text-foreground">{nombreBanco(t.banco)}</span>{" "}
                          <span className="cifras font-mono">···· {t.ultimos_4}</span>
                        </span>
                        {tomada && (
                          <Revisor
                            id={t.asignado_a}
                            persona={equipo[t.asignado_a]}
                            minutos={minutosRestantes(t.asignado_en)}
                            propio={t.asignado_a === session.user.id}
                          />
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {filtro === "pendiente" && !loading && visibles.length > 0 && (
            <Leyenda
              className="mt-3"
              items={[
                {
                  texto: "Franja de color",
                  marca: <span className="h-3.5 w-1 rounded bg-marca-600" />,
                  pista: "Quién la atiende: azul oscuro eres tú; cada compañero tiene su color.",
                },
                {
                  texto: "2 fotos",
                  marca: <Imagen className="h-3.5 w-3.5" />,
                  pista: "El cliente subió una segunda foto (por ejemplo, el reverso). Revisa ambas.",
                },
              ]}
            />
          )}
        </section>

        {/* ── Detalle ── */}
        <section ref={detalleRef} className="min-h-0 min-w-0 scroll-mt-20">
          {!s ? (
            <Vacio
              className="h-full min-h-[360px]"
              icono={<IconoTarjeta />}
              titulo="Elige una tarjeta de la lista"
              detalle="Al pulsarla se carga su foto y los datos del titular."
            />
          ) : (
            <div key={s.id} className="grid h-full animate-aparecer gap-4 2xl:grid-cols-[minmax(0,1fr)_410px]">
              {/* Fotos */}
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label="Fotos">
                  {MINIATURAS.map((m) => (
                    <Miniatura
                      key={m.clave}
                      activo={vista === m.clave}
                      onClick={() => setVista(m.clave)}
                      titulo={m.titulo}
                      detalle={m.falta ? "No subió foto" : cargandoDetalle ? "Cargando…" : m.url ? m.detalle : "No carga"}
                      peligro={m.falta || (!cargandoDetalle && !m.url)}
                      url={m.url}
                    />
                  ))}
                  <Miniatura
                    activo={vista === COMPARAR}
                    onClick={() => setVista(COMPARAR)}
                    titulo="Comparar con su DNI"
                    detalle="Tarjeta y documento juntos"
                    destacado
                    icono={
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                        <rect x="2" y="6" width="9.5" height="12" rx="1.5" />
                        <rect x="12.5" y="6" width="9.5" height="12" rx="1.5" />
                        <path d="M4.5 14.5h4.5M15 10h4.5M15 13h3" />
                      </svg>
                    }
                  />
                </div>

                {cargandoDetalle && !s.foto && !s.foto_error ? (
                  <Esqueleto className={cn("w-full rounded-xl", ALTO_VISOR)} />
                ) : vista === COMPARAR ? (
                  <div className="grid min-w-0 gap-3 md:grid-cols-2">
                    <Visor {...fotoTarjeta(FRENTE)} titulo="Tarjeta" alto={ALTO_VISOR} />
                    <Visor
                      {...(info?.dniFrente || {})}
                      titulo={info && !info.dniFrente?.path ? `${tipoDoc}: no hay foto` : `${tipoDoc} · Frente`}
                      alto={ALTO_VISOR}
                    />
                  </div>
                ) : vista === SELFIE ? (
                  <Visor {...(info?.selfie || {})} titulo={`Selfie de ${titular}`} alto={ALTO_VISOR} />
                ) : (
                  <Visor
                    {...fotoTarjeta(vista)}
                    titulo={vista === REVERSO ? "Otra foto de la tarjeta" : "Foto principal de la tarjeta"}
                    alto={ALTO_VISOR}
                  />
                )}
              </div>

              {/* Decisión: todo en una columna, los botones siempre abajo */}
              <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-panel">
                <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
                  {/* La tarjeta */}
                  {/* La tarjeta, con el color de su banco: se reconoce de un vistazo. */}
                  <div
                    className="flex items-center gap-3 px-5 py-3.5"
                    style={{ backgroundColor: colorBanco(s.banco).fondo, color: colorBanco(s.banco).texto }}
                  >
                    <IconoTarjeta className="h-6 w-6 shrink-0 opacity-80" />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-baseline gap-2.5">
                        <span className="min-w-0 truncate text-lg font-extrabold leading-tight">{nombreBanco(s.banco)}</span>
                        <span className="cifras shrink-0 font-mono text-lg font-bold tracking-wider">···· {s.ultimos_4}</span>
                      </p>
                      <p className="mt-0.5 text-xs font-semibold opacity-85">Registrada el {fechaCorta(s.created_at)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/95 p-px">
                      <Estado valor={s.estado} />
                    </span>
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
                        <Aviso tono="espera" titulo={`${ajeno.quien} está revisando esta tarjeta`}>
                          Puedes mirarla, pero verificarla es suyo hasta que pasen {ajeno.libre_en} min.
                        </Aviso>
                      )}
                    </div>
                  )}

                  {/* De quién es */}
                  <div className="space-y-4 border-b border-border px-5 py-4">
                    <div className="flex items-center gap-4">
                      <Pista texto={info?.selfie?.url ? "Ver su selfie en grande" : "No hay selfie de la verificación"}>
                        <button
                          type="button"
                          onClick={() => info?.selfie?.url && setVista(SELFIE)}
                          disabled={!info?.selfie?.url}
                          aria-label="Ver la selfie del titular"
                          className={cn(
                            "relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-marca-50 ring-2 ring-offset-2 transition",
                            vista === SELFIE ? "ring-marca-500" : "ring-border hover:ring-marca-300",
                            !info?.selfie?.url && "cursor-default",
                          )}
                        >
                          {info?.selfie?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={info.selfie.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className={cn("flex h-full w-full items-center justify-center text-md font-bold text-marca-700", !info && "animate-pulse")}>
                              {inicialesDe(cliente)}
                            </span>
                          )}
                        </button>
                      </Pista>
                      <div className="min-w-0 flex-1">
                        <p className="t-etiqueta">Titular</p>
                        <p className="mt-0.5 break-words text-lg font-bold leading-tight">{titular}</p>
                        {info?.cuenta?.estado && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Estado valor={info.cuenta.estado} />
                            {info.cuenta.created_at && (
                              <span className="text-xs text-muted-foreground">desde {fechaCorta(info.cuenta.created_at, false)}</span>
                            )}
                          </div>
                        )}
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

                  {/* Qué comprobar */}
                  {resoluble ? (
                    <div className="px-5 py-4">
                      <div className="mb-3 flex items-center gap-2">
                        <p className="t-seccion">Comprueba en la foto</p>
                        <Pista texto="Mira cada punto en la foto y márcalo. El botón de verificar se activa con todo marcado." />
                        <span
                          className={cn(
                            "cifras ml-auto rounded-full px-2 py-0.5 text-xs font-bold",
                            todoRevisado ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {listos}/{COMPROBAR.length}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {COMPROBAR.map((c) => {
                          const hecho = Boolean(marcas[c.clave]);
                          return (
                            <li key={c.clave} className="flex items-stretch gap-1.5">
                              <label
                                className={cn(
                                  "flex min-h-[46px] min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2 transition",
                                  hecho ? "border-emerald-200 bg-emerald-50/70" : "border-border hover:bg-muted/50",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={hecho}
                                  onChange={(e) => setRevisadoPor((m) => ({ ...m, [s.id]: { ...marcas, [c.clave]: e.target.checked } }))}
                                />
                                <span
                                  aria-hidden
                                  className={cn(
                                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-marca-500",
                                    hecho ? "border-emerald-600 bg-emerald-600 text-white" : "border-marca-200 bg-card",
                                  )}
                                >
                                  {hecho && <Check className="h-3 w-3" />}
                                </span>
                                <span className={cn("shrink-0 text-sm leading-tight", hecho ? "text-emerald-900" : "text-foreground")}>{c.titulo}</span>
                                {c.valor && (
                                  <span className="ml-auto min-w-0 truncate text-right text-sm font-bold text-foreground" title={typeof c.valor === "string" ? c.valor : undefined}>
                                    {c.valor}
                                  </span>
                                )}
                              </label>
                              <Pista texto={c.ver === COMPARAR ? "Ver la tarjeta junto a su DNI" : c.ver === REVERSO ? "Ver la otra foto" : "Ver la foto de la tarjeta"}>
                                <button
                                  type="button"
                                  onClick={() => setVista(c.ver)}
                                  aria-label={`Ver la foto para: ${c.titulo}`}
                                  className={cn(
                                    "flex w-9 shrink-0 items-center justify-center rounded-lg border transition",
                                    vista === c.ver ? "border-marca-300 bg-marca-50 text-marca-700" : "border-border text-muted-foreground hover:bg-muted",
                                  )}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </button>
                              </Pista>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : s.estado === "pendiente" ? (
                    <div className="p-4">
                      <Aviso tono="info">Estás viendo la cola como supervisor: verificar la tarjeta es del gestor que la tiene.</Aviso>
                    </div>
                  ) : (
                    <div className="space-y-3 p-4">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        <DatoCorto etiqueta={s.estado === "rechazado" ? "Rechazada el" : "Verificada el"} completo>
                          {fechaCorta(s.fecha_revision)}
                        </DatoCorto>
                        <DatoCorto etiqueta="Nombre impreso" completo>
                          {s.nombre_impreso || "No lo indicó (registro anterior)"}
                        </DatoCorto>
                      </dl>
                      {s.motivo_rechazo && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                          <p className="t-etiqueta text-red-700">Motivo comunicado</p>
                          <p className="mt-1 text-sm text-red-900">{s.motivo_rechazo}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Botones: siempre a la vista */}
                {resoluble && (puedeAprobar || puedeRechazar) && (
                  <div className="shrink-0 space-y-2 border-t border-border bg-muted/30 p-3">
                    <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${(listos / COMPROBAR.length) * 100}%` }}
                      />
                    </div>
                    <div className="flex gap-2">
                      {puedeAprobar && (
                        <Pista texto={faltaVerificar} className="block min-w-0 flex-1">
                          <BotonAccion
                            onClick={() => aprobar(s)}
                            cargando={accion === "aprobando"}
                            disabled={accion !== null || Boolean(faltaVerificar)}
                            tono="exito"
                            tamano="grande"
                            className="w-full"
                            icono={<Check className="h-5 w-5" />}
                          >
                            {accion === "aprobando" ? "Verificando..." : "Verificar"}
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
                    {faltaVerificar && puedeAprobar && <p className="text-center text-xs text-muted-foreground">{faltaVerificar}</p>}
                    <Atajos
                      items={[
                        ["1–" + COMPROBAR.length, "marcar"],
                        puedeAprobar && ["A", "verificar"],
                        puedeRechazar && ["R", "rechazar"],
                        ["C", "comparar"],
                        ["N", "siguiente"],
                      ]}
                    />
                  </div>
                )}
                {s.estado === "aprobado" && ["gestor", "supervisor", "admin"].includes(session?.rol) && puede(session, "tarjetas.baja") && (
                  <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/30 p-3">
                    <BotonAccion tono="peligroSuave" onClick={() => setModoBaja(true)} disabled={accion !== null} icono={<Cruz className="h-4 w-4" />}>
                      Dar de baja
                    </BotonAccion>
                    <Pista texto="El cliente no puede darla de baja desde la app: lo pide a un asesor. La tarjeta deja de aparecer en su app y recibe el motivo como aviso." />
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
        titulo="Rechazar la tarjeta"
        descripcion="El cliente lo lee en su app y puede volver a registrarla corrigiendo esto."
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
              Confirmar rechazo
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
          sugerencias={RECHAZOS_FRECUENTES}
          placeholder="Ej: La foto no deja ver el nombre del titular."
        />
      </Dialogo>

      {/* Dar de baja: también en una ventana. */}
      <Dialogo
        abierto={modoBaja}
        onCerrar={() => setModoBaja(false)}
        bloqueado={accion === "baja"}
        titulo="Dar de baja la tarjeta"
        descripcion="Deja de aparecer en la app del cliente y recibe el motivo en Mis avisos."
        tono="peligro"
        icono={<IconoAlerta />}
        ancho="max-w-lg"
        pie={
          <>
            <BotonAccion tono="neutro" disabled={accion !== null} onClick={() => setModoBaja(false)}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              tono="peligro"
              onClick={() => s && darDeBaja(s)}
              cargando={accion === "baja"}
              disabled={accion !== null || motivoBaja.trim().length < MIN_MOTIVO}
            >
              Confirmar baja
            </BotonAccion>
          </>
        }
      >
        <Motivo
          id="motivoBaja"
          etiqueta="Motivo de la baja"
          valor={motivoBaja}
          onCambio={setMotivoBaja}
          minimo={MIN_MOTIVO}
          placeholder="Ej: El cliente pidió retirarla por teléfono."
        />
      </Dialogo>

      <SinPendientes
        visible={sinPendientes}
        onCerrar={() => setSinPendientes(false)}
        texto="No hay tarjetas esperando verificación. Cuando entre una nueva, el sistema te la asigna sola."
      />

      <Conflicto mensaje={conflicto?.mensaje} titulo={conflicto?.titulo} onCerrar={() => setConflicto(null)} />
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

/** Pestaña con miniatura (o ícono) para elegir qué foto se ve en grande. */
function Miniatura({ activo, onClick, titulo, detalle, url, icono, peligro = false, destacado = false }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={cn(
        "pulsable flex shrink-0 items-center gap-2.5 rounded-xl border py-1.5 pl-1.5 pr-3.5 text-left transition",
        activo
          ? cn("border-marca-500 ring-1 ring-marca-500", destacado ? "bg-marca-50" : "bg-card")
          : destacado
            ? "border-dashed border-marca-300 bg-card hover:border-marca-500"
            : "border-border bg-card hover:border-marca-300",
      )}
    >
      <span
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg",
          destacado ? "bg-marca-50 text-marca-600" : "bg-muted",
        )}
      >
        {icono ||
          (url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : peligro ? (
            <Cruz className="h-4 w-4 text-red-500" />
          ) : null)}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-sm font-bold", activo ? "text-marca-700" : "text-foreground")}>{titulo}</span>
        <span className={cn("block text-xs", peligro ? "font-semibold text-red-600" : "text-muted-foreground")}>{detalle}</span>
      </span>
    </button>
  );
}
