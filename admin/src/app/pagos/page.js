"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { extraerPath } from "@/lib/storage";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Check, Cruz, Billete } from "@/components/shell";
import { Vacio, Aviso } from "@/components/marca";
import {
  EsqueletoFilas,
  BotonAccion,
  Rueda,
  BarraCarga,
} from "@/components/carga";
import Paginador from "@/components/paginador";

const BUCKET_COMPROBANTES = "comprobantes";
const POR_PAGINA = 30;
const POR_PAGINA_HISTORIAL = 15;

// Cada cuanto se refresca la lista sola. Varios encargados trabajan el
// mismo banco: sin esto, uno veria libre una solicitud que otro acaba
// de marcar hasta que recargara a mano.
const REFRESCO_MS = 20 * 1000;

// Las marcas duran 30 minutos en el servidor. Mientras la pantalla esta
// abierta se renuevan cada 10, para que un lote grande no pierda sus
// reservas a mitad de las transferencias.
const RENOVAR_MS = 10 * 60 * 1000;

const ESTADOS = [
  { clave: "aprobado", titulo: "Por pagar", campo: "por_pagar" },
  { clave: "pendiente", titulo: "En revisión", campo: "en_revision" },
  { clave: "pagado", titulo: "Pagadas", campo: "pagadas_hoy" },
];

// ── Utilidades ────────────────────────────────────────────────

function haceCuanto(iso) {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

const fechaHora = (iso) =>
  new Date(iso).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Número de cuenta en grupos de 4: se dicta y se copia sin perderse. */
const agrupar = (n) =>
  (n || "")
    .replace(/\s/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();

const nombreDe = (c) => [c?.nombres, c?.apellidos].filter(Boolean).join(" ");

/**
 * Mensaje de error de una funcion de pagos.
 *
 * Las funciones del servidor ya lanzan frases pensadas para quien lee
 * ("Ninguna de esas solicitudes sigue marcada por ti"), asi que se
 * muestran tal cual. Solo los errores tecnicos pasan por la traduccion.
 */
function motivoDe(error, contexto) {
  if (!error) return "";
  if (error.code === "P0001") return error.message;
  return explicarError(error, contexto);
}

// ── Piezas ────────────────────────────────────────────────────

function Copiar({ texto, etiqueta = "Copiar" }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(String(texto).replace(/\s/g, ""));
          setHecho(true);
          setTimeout(() => setHecho(false), 1400);
        } catch {}
      }}
      className={cn(
        "pulsable rounded px-1.5 py-0.5 text-[11px] font-medium",
        hecho
          ? "bg-emerald-50 text-emerald-700"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-label={`${etiqueta} ${texto}`}
    >
      {hecho ? "Copiado" : etiqueta}
    </button>
  );
}

/** Ventana modal sencilla. */
function Modal({ titulo, children, onCerrar }) {
  useEffect(() => {
    const tecla = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/50 p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="entra max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Cerrar"
          >
            <Cruz className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Una solicitud en la lista.
 *
 * Es una vista para pagar, no para revisar: lo grande es el nombre, el
 * DNI y las cuentas. El comprobante queda como un enlace pequeño, por
 * si hace falta mirarlo.
 */
function Fila({ fila, estado, ocupado, onMarcar, onComprobante, onCancelar }) {
  const tomadaPorOtro = fila.marcada_por && !fila.marcada_por_mi;
  const seleccionable =
    estado === "aprobado" && fila.puedo_pagar && !tomadaPorOtro;
  const marcada = fila.marcada_por_mi;

  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border bg-card p-3.5 transition",
        marcada ? "border-marca-400 bg-marca-50/40" : "border-border",
        tomadaPorOtro && "opacity-70",
      )}
    >
      {estado === "aprobado" && (
        <button
          type="button"
          onClick={() => seleccionable && onMarcar(fila)}
          disabled={!seleccionable || ocupado}
          aria-pressed={marcada}
          aria-label={marcada ? "Quitar del lote" : "Agregar al lote"}
          title={
            !fila.puedo_pagar
              ? "Este banco lo atiende otro compañero"
              : tomadaPorOtro
                ? `Marcada por ${fila.marcada_por}`
                : undefined
          }
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
            marcada
              ? "border-marca-700 bg-marca-700 text-white"
              : "border-slate-300 bg-card hover:border-marca-500",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {ocupado ? (
            <Rueda className="h-3 w-3" claro={marcada} />
          ) : (
            marcada && <Check className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[0.9333rem] font-semibold text-foreground">
            {nombreDe(fila.cliente) || "Cliente sin nombre"}
          </p>
          <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5">
            <span className="cifras text-[12px] font-semibold text-foreground">
              DNI {fila.cliente?.dni}
            </span>
            <Copiar texto={fila.cliente?.dni} />
          </span>
        </div>

        <p className="mt-0.5 text-[12px] text-muted-foreground">
          <span className="cifras">{fila.codigo}</span>
          {" · "}
          Tarjeta {fila.banco}
          {fila.ultimos_4 && (
            <span className="cifras"> •••• {fila.ultimos_4}</span>
          )}
          {" · "}
          {estado === "pagado"
            ? `pagada ${haceCuanto(fila.pagado_en)}${fila.pagado_por ? ` por ${fila.pagado_por}` : ""}`
            : estado === "aprobado"
              ? `aprobada ${haceCuanto(fila.fecha_revision)}`
              : `enviada ${haceCuanto(fila.created_at)}`}
        </p>

        {/* Cuentas: lo que de verdad se necesita para pagar */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fila.cuentas?.length ? (
            fila.cuentas.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1"
              >
                <span className="text-[11px] font-bold uppercase tracking-wide text-marca-700">
                  {c.banco}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {c.tipo === "interbancaria" ? "CCI" : "Ahorros"}
                </span>
                <span className="cifras font-mono text-[12.5px] text-foreground">
                  {agrupar(c.numero)}
                </span>
                <Copiar texto={c.numero} />
              </span>
            ))
          ) : (
            <span className="rounded-lg bg-red-50 px-2 py-1 text-[12px] font-medium text-red-700">
              Sin cuentas registradas: contacta al cliente antes de pagar
            </span>
          )}
        </div>

        {fila.nota_cliente && (
          <p className="mt-1.5 text-[12px] italic text-muted-foreground">
            “{fila.nota_cliente}”
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {tomadaPorOtro && (
          <span className="max-w-[160px] truncate rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            Marcada por {fila.marcada_por}
          </span>
        )}
        {!fila.puedo_pagar && estado === "aprobado" && !tomadaPorOtro && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Solo lectura
          </span>
        )}
        {fila.comprobante_url && (
          <button
            onClick={() => onComprobante(fila.comprobante_url)}
            className="pulsable rounded-md px-2 py-1 text-[12px] font-medium text-marca-700 hover:bg-marca-50"
          >
            Comprobante
          </button>
        )}
        {estado === "pagado" && fila.puedo_pagar && (
          <button
            onClick={() => onCancelar(fila)}
            className="pulsable rounded-md px-2 py-1 text-[12px] font-medium text-red-600 hover:bg-red-50"
          >
            Cancelar envío
          </button>
        )}
      </div>
    </li>
  );
}

// ── Pantalla ──────────────────────────────────────────────────

export default function PagosPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [vista, setVista] = useState("cola");

  const [resumen, setResumen] = useState([]);
  const [banco, setBanco] = useState(undefined); // undefined: sin elegir aun
  const [estado, setEstado] = useState("aprobado");
  const [buscar, setBuscar] = useState("");
  const termino = useRetraso(buscar);

  const [filas, setFilas] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const [lote, setLote] = useState([]);
  const [ocupados, setOcupados] = useState(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [aCancelar, setACancelar] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const [lotes, setLotes] = useState([]);
  const [totalHist, setTotalHist] = useState(0);
  const [paginaHist, setPaginaHist] = useState(0);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [abiertos, setAbiertos] = useState(new Set());

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // ── Carga ──

  const cargarResumen = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("pagos_resumen");
    if (e) {
      setError(motivoDe(e, "No se pudo cargar el resumen."));
      return [];
    }
    setResumen(data || []);
    return data || [];
  }, []);

  const cargarLista = useCallback(
    async ({ silencioso = false } = {}) => {
      if (banco === undefined) return;
      silencioso ? setRefrescando(true) : setCargando(true);

      const { data, error: e } = await supabase.rpc("pagos_listar", {
        p_banco: banco,
        p_estado: estado,
        p_buscar: termino || null,
        p_limite: POR_PAGINA,
        p_desde: pagina * POR_PAGINA,
        p_solo_mias: false,
      });

      if (e) setError(motivoDe(e, "No se pudo cargar la lista."));
      else {
        setFilas(data?.filas || []);
        setTotal(data?.total || 0);
      }
      setCargando(false);
      setRefrescando(false);
    },
    [banco, estado, termino, pagina],
  );

  /** El lote vive en el servidor: sobrevive a recargas y abarca bancos. */
  const cargarLote = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("pagos_listar", {
      p_banco: null,
      p_estado: "aprobado",
      p_buscar: null,
      p_limite: 200,
      p_desde: 0,
      p_solo_mias: true,
    });
    if (!e) setLote(data?.filas || []);
  }, []);

  const cargarHistorial = useCallback(async () => {
    setCargandoHist(true);
    const { data, error: e } = await supabase.rpc("pagos_historial", {
      p_banco: banco ?? null,
      p_buscar: termino || null,
      p_limite: POR_PAGINA_HISTORIAL,
      p_desde: paginaHist * POR_PAGINA_HISTORIAL,
    });
    if (e) setError(motivoDe(e, "No se pudo cargar el historial."));
    else {
      setLotes(data?.lotes || []);
      setTotalHist(data?.total || 0);
    }
    setCargandoHist(false);
  }, [banco, termino, paginaHist]);

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) return router.push("/login");
      if (!["admin", "pagos"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);

      const r = await cargarResumen();
      // Arranca en el primer banco propio con trabajo pendiente: es lo
      // que el encargado viene a hacer.
      const propios = r.filter((x) => x.es_mio);
      const conTrabajo = propios.find((x) => Number(x.por_pagar) > 0);
      setBanco(
        s.rol === "admin" ? null : ((conTrabajo || propios[0])?.banco ?? null),
      );
      cargarLote();
    });
  }, [router, cargarResumen, cargarLote]);

  useEffect(() => {
    if (vista === "cola") cargarLista();
  }, [vista, cargarLista]);

  useEffect(() => {
    if (vista === "historial" && banco !== undefined) cargarHistorial();
  }, [vista, banco, cargarHistorial]);

  // Volver a la primera pagina cuando cambia lo que se esta mirando.
  useEffect(() => setPagina(0), [banco, estado, termino]);
  useEffect(() => setPaginaHist(0), [banco, termino]);

  // Refresco automatico, solo con la pestaña del navegador a la vista.
  useEffect(() => {
    if (!session || vista !== "cola") return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      cargarResumen();
      cargarLista({ silencioso: true });
      cargarLote();
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [session, vista, cargarResumen, cargarLista, cargarLote]);

  // Renovar las reservas del lote mientras la pantalla esta abierta.
  const loteRef = useRef(lote);
  loteRef.current = lote;
  useEffect(() => {
    if (!session) return;
    const t = setInterval(async () => {
      const ids = loteRef.current.map((f) => f.id);
      if (!ids.length) return;
      const { data } = await supabase.rpc("pagos_marcar", { p_ids: ids });
      if (data?.rechazadas?.length) {
        setError(
          `${data.rechazadas.length} solicitud(es) de tu lote ya no están disponibles y se quitaron.`,
        );
        cargarLote();
        cargarLista({ silencioso: true });
      }
    }, RENOVAR_MS);
    return () => clearInterval(t);
  }, [session, cargarLote, cargarLista]);

  // ── Acciones ──

  async function alternarMarca(fila) {
    setError("");
    setOcupados((s) => new Set(s).add(fila.id));

    if (fila.marcada_por_mi) {
      const { error: e } = await supabase.rpc("pagos_desmarcar", {
        p_ids: [fila.id],
      });
      if (e) setError(motivoDe(e, "No se pudo quitar del lote."));
    } else {
      const { data, error: e } = await supabase.rpc("pagos_marcar", {
        p_ids: [fila.id],
      });
      if (e) setError(motivoDe(e, "No se pudo marcar."));
      else if (data?.rechazadas?.length) {
        setError(
          "Otro compañero la acaba de marcar, o ya no está por pagar. La lista se actualizó.",
        );
      }
    }

    setOcupados((s) => {
      const n = new Set(s);
      n.delete(fila.id);
      return n;
    });
    await Promise.all([
      cargarLista({ silencioso: true }),
      cargarLote(),
      cargarResumen(),
    ]);
  }

  async function quitarDelLote(ids) {
    setError("");
    const { error: e } = await supabase.rpc("pagos_desmarcar", { p_ids: ids });
    if (e) setError(motivoDe(e, "No se pudo quitar del lote."));
    await Promise.all([
      cargarLista({ silencioso: true }),
      cargarLote(),
      cargarResumen(),
    ]);
  }

  async function confirmarLote() {
    setEnviando(true);
    setError("");
    const ids = lote.map((f) => f.id);
    const { data, error: e } = await supabase.rpc("pagos_confirmar", {
      p_ids: ids,
    });
    setEnviando(false);
    setConfirmando(false);

    if (e) {
      setError(motivoDe(e, "No se pudo confirmar el lote."));
    } else {
      const omitidas = data?.omitidas?.length || 0;
      setOk(
        `Lote confirmado: ${data?.confirmadas} solicitud${data?.confirmadas === 1 ? "" : "es"} pagada${data?.confirmadas === 1 ? "" : "s"}. Cada cliente ya recibió su aviso.` +
          (omitidas
            ? ` ${omitidas} no entraron porque ya no estaban marcadas por ti: revísalas antes de volver a pagar.`
            : ""),
      );
    }
    await Promise.all([
      cargarLista({ silencioso: true }),
      cargarLote(),
      cargarResumen(),
    ]);
  }

  async function cancelarEnvio() {
    if (motivo.trim().length < 5) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    setCancelando(true);
    setError("");
    const { error: e } = await supabase.rpc("pagos_cancelar", {
      p_id: aCancelar.id,
      p_motivo: motivo.trim(),
    });
    setCancelando(false);

    if (e) {
      setError(motivoDe(e, "No se pudo cancelar el envío."));
      return;
    }
    setOk(
      `Envío de ${aCancelar.codigo} cancelado. Volvió a "Por pagar" y el cliente fue avisado.`,
    );
    setACancelar(null);
    setMotivo("");
    cargarResumen();
    if (vista === "historial") cargarHistorial();
    else cargarLista({ silencioso: true });
  }

  async function verComprobante(valor) {
    const path = extraerPath(BUCKET_COMPROBANTES, valor);
    if (!path) return setError("La ruta del comprobante no es válida.");
    // Se abre la ventana antes de esperar la firma: si se abre despues
    // de un await, el navegador lo trata como ventana emergente y la
    // bloquea.
    const ventana = window.open("", "_blank");
    const { data, error: e } = await supabase.storage
      .from(BUCKET_COMPROBANTES)
      .createSignedUrl(path, 300);
    if (e || !data?.signedUrl) {
      ventana?.close();
      return setError(
        "No se pudo abrir el comprobante: " + (e?.message || "sin URL"),
      );
    }
    if (ventana) ventana.location.href = data.signedUrl;
  }

  // ── Derivados ──

  const misBancos = useMemo(
    () => resumen.filter((r) => r.es_mio).map((r) => r.banco),
    [resumen],
  );

  const campo = ESTADOS.find((x) => x.clave === estado)?.campo || "por_pagar";
  const totalTodos = resumen.reduce((n, r) => n + Number(r[campo] || 0), 0);

  const bancoPropio = banco === null ? null : misBancos.includes(banco);

  const desglose = useMemo(() => {
    const m = {};
    for (const f of lote) m[f.banco] = (m[f.banco] || 0) + 1;
    return Object.entries(m);
  }, [lote]);

  if (!session) return null;

  const esPagos = session.rol === "pagos";
  // banco deja de ser undefined cuando ya llego el resumen: antes de eso
  // no se sabe si tiene bancos y el aviso parpadearia al entrar.
  const sinBancos = esPagos && banco !== undefined && misBancos.length === 0;

  return (
    <Shell
      session={session}
      titulo="Pagos"
      descripcion={
        esPagos
          ? misBancos.length
            ? `Tus bancos: ${misBancos.join(", ")}`
            : "Sin bancos asignados"
          : "Todos los bancos"
      }
    >
      <BarraCarga activa={refrescando} />

      <div className="space-y-4">
        {/* Vista */}
        <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/60 p-1">
          {[
            { clave: "cola", titulo: "Por pagar" },
            { clave: "historial", titulo: "Historial de lotes" },
          ].map((v) => (
            <button
              key={v.clave}
              onClick={() => setVista(v.clave)}
              className={cn(
                "pulsable rounded-md px-4 py-1.5 text-[0.8667rem] font-medium",
                vista === v.clave
                  ? "bg-card text-foreground shadow-panel"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.titulo}
            </button>
          ))}
        </div>

        {sinBancos && (
          <Aviso tono="espera" titulo="Todavía no tienes bancos asignados">
            Puedes ver el trabajo de todos, pero para marcar y pagar el
            administrador tiene que asignarte tus bancos desde Equipo.
          </Aviso>
        )}
        {error && (
          <Aviso titulo="Atención" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        )}
        {ok && (
          <Aviso tono="info" onCerrar={() => setOk("")}>
            {ok}
          </Aviso>
        )}

        {/* Bancos */}
        <div className="scroll-fino -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <PestanaBanco
            activa={banco === null}
            onClick={() => setBanco(null)}
            titulo="Todos"
            cuenta={vista === "cola" ? totalTodos : null}
          />
          {resumen.map((r) => (
            <PestanaBanco
              key={r.banco}
              activa={banco === r.banco}
              onClick={() => setBanco(r.banco)}
              titulo={r.banco}
              cuenta={vista === "cola" ? Number(r[campo] || 0) : null}
              propio={r.es_mio}
              mias={Number(r.marcadas_por_mi || 0)}
            />
          ))}
        </div>

        {/* Buscador */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] max-w-md flex-1">
            <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder={
                vista === "cola" ? "DNI, nombre o código" : "DNI o código"
              }
              inputMode="search"
              autoFocus
              className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
            />
          </div>

          {vista === "cola" && (
            <div className="inline-flex gap-1 rounded-lg border border-border bg-card p-1">
              {ESTADOS.map((x) => (
                <button
                  key={x.clave}
                  onClick={() => setEstado(x.clave)}
                  className={cn(
                    "pulsable rounded-md px-3 py-1.5 text-[0.8rem] font-medium",
                    estado === x.clave
                      ? "bg-marca-700 text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {x.titulo}
                </button>
              ))}
            </div>
          )}
        </div>

        {vista === "cola" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              {bancoPropio === false && estado === "aprobado" && (
                <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                  {banco} lo atiende otro compañero. Puedes ver sus solicitudes,
                  pero no marcarlas.
                </p>
              )}
              {estado === "pendiente" && (
                <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                  Todavía no las valida un revisor. Se muestran para que puedas
                  responder si el cliente pregunta; se pagan cuando pasan a “Por
                  pagar”.
                </p>
              )}
              {estado === "pagado" && (
                <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                  Las más recientes primero. Si un envío salió mal, cancélalo
                  con su motivo y volverá a “Por pagar”.
                </p>
              )}

              {cargando ? (
                <EsqueletoFilas filas={5} alto="h-[92px]" />
              ) : filas.length === 0 ? (
                <Vacio
                  icono={<Billete className="h-5 w-5" />}
                  titulo={
                    termino
                      ? "Nada coincide con esa búsqueda"
                      : estado === "aprobado"
                        ? "No hay nada por pagar"
                        : estado === "pendiente"
                          ? "Nada en revisión"
                          : "Todavía no hay pagos"
                  }
                  detalle={
                    termino
                      ? "Revisa el DNI o prueba en “Todos” los bancos."
                      : estado === "aprobado"
                        ? "Cuando un revisor apruebe una solicitud, aparecerá aquí."
                        : undefined
                  }
                />
              ) : (
                <>
                  <ul className="space-y-2">
                    {filas.map((f) => (
                      <Fila
                        key={f.id}
                        fila={f}
                        estado={estado}
                        ocupado={ocupados.has(f.id)}
                        onMarcar={alternarMarca}
                        onComprobante={verComprobante}
                        onCancelar={(x) => {
                          setACancelar(x);
                          setMotivo("");
                        }}
                      />
                    ))}
                  </ul>
                  <Paginador
                    pagina={pagina}
                    porPagina={POR_PAGINA}
                    total={total}
                    cargando={refrescando}
                    onCambio={setPagina}
                  />
                </>
              )}
            </div>

            {/* Lote en preparacion */}
            <aside className="lg:sticky lg:top-[84px] lg:self-start">
              <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-[0.9333rem] font-semibold text-foreground">
                    Lote en preparación
                  </h2>
                  <span className="cifras text-[1.25rem] font-bold text-marca-700">
                    {lote.length}
                  </span>
                </div>

                {lote.length === 0 ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    Marca las solicitudes que vas a pagar. Puedes buscar otro
                    DNI o cambiar de banco: lo marcado se queda aquí.
                  </p>
                ) : (
                  <>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {desglose.map(([b, n]) => (
                        <span
                          key={b}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {b} · <span className="cifras">{n}</span>
                        </span>
                      ))}
                    </div>

                    <ul className="scroll-fino mt-3 max-h-[46vh] space-y-1 overflow-y-auto">
                      {lote.map((f) => (
                        <li
                          key={f.id}
                          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-medium text-foreground">
                              {nombreDe(f.cliente)}
                            </p>
                            <p className="cifras text-[11px] text-muted-foreground">
                              {f.cliente?.dni} · {f.banco} · {f.codigo}
                            </p>
                          </div>
                          <button
                            onClick={() => quitarDelLote([f.id])}
                            className="rounded p-1 text-muted-foreground opacity-60 hover:bg-card hover:text-red-600 group-hover:opacity-100"
                            aria-label="Quitar del lote"
                          >
                            <Cruz className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>

                    <BotonAccion
                      tono="exito"
                      className="mt-3 w-full"
                      onClick={() => setConfirmando(true)}
                    >
                      Confirmar envío de {lote.length}
                    </BotonAccion>
                    <button
                      onClick={() => quitarDelLote(lote.map((f) => f.id))}
                      className="mt-1.5 w-full rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted"
                    >
                      Vaciar lote
                    </button>
                  </>
                )}

                <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Lo marcado queda reservado para ti mientras tengas esta
                  pantalla abierta. Si la cierras, se libera a los 30 minutos.
                </p>
              </div>
            </aside>
          </div>
        ) : (
          /* ── Historial ── */
          <div>
            {cargandoHist && lotes.length === 0 ? (
              <EsqueletoFilas filas={4} />
            ) : lotes.length === 0 ? (
              <Vacio
                icono={<Billete className="h-5 w-5" />}
                titulo={
                  termino
                    ? "Ningún lote con ese DNI o código"
                    : "Todavía no hay lotes"
                }
                detalle="Cada vez que alguien confirma un envío, el lote queda registrado aquí."
              />
            ) : (
              <>
                <ul className="space-y-2">
                  {lotes.map((l) => {
                    const abierto = abiertos.has(l.id);
                    const canceladas = l.items.filter(
                      (i) => i.cancelacion,
                    ).length;
                    return (
                      <li
                        key={l.id}
                        className="overflow-hidden rounded-xl border border-border bg-card"
                      >
                        <button
                          onClick={() =>
                            setAbiertos((s) => {
                              const n = new Set(s);
                              n.has(l.id) ? n.delete(l.id) : n.add(l.id);
                              return n;
                            })
                          }
                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/50"
                          aria-expanded={abierto}
                        >
                          <span className="text-[0.8667rem] font-semibold text-foreground">
                            {fechaHora(l.creado_en)}
                          </span>
                          <span className="text-[12.5px] text-muted-foreground">
                            {l.creado_por}
                          </span>
                          <span className="cifras text-[12.5px] text-foreground">
                            {l.cantidad} solicitud{l.cantidad === 1 ? "" : "es"}
                          </span>
                          <span className="flex gap-1">
                            {(l.bancos || []).map((b) => (
                              <span
                                key={b}
                                className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                              >
                                {b}
                              </span>
                            ))}
                          </span>
                          {canceladas > 0 && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-200">
                              {canceladas} cancelada
                              {canceladas === 1 ? "" : "s"}
                            </span>
                          )}
                          <span className="ml-auto text-muted-foreground">
                            {abierto ? "▴" : "▾"}
                          </span>
                        </button>

                        {abierto && (
                          <ul className="divide-y divide-border border-t border-border">
                            {l.items.map((it) => (
                              <li
                                key={it.solicitud_id}
                                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                              >
                                <div className="min-w-[200px] flex-1">
                                  <p className="text-[12.5px] font-medium text-foreground">
                                    {nombreDe(it.cliente)}
                                  </p>
                                  <p className="cifras text-[11px] text-muted-foreground">
                                    DNI {it.cliente?.dni} · {it.codigo} ·
                                    Tarjeta {it.banco}
                                  </p>
                                  {it.cancelacion && (
                                    <p className="mt-0.5 text-[11.5px] text-red-700">
                                      Cancelada por {it.cancelacion.por} (
                                      {fechaHora(it.cancelacion.en)}):{" "}
                                      {it.cancelacion.motivo}
                                    </p>
                                  )}
                                </div>

                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    it.en_este_lote && it.estado === "pagado"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : it.estado === "pagado"
                                        ? "bg-marca-50 text-marca-700"
                                        : "bg-amber-50 text-amber-700",
                                  )}
                                >
                                  {it.en_este_lote && it.estado === "pagado"
                                    ? "Pagada"
                                    : it.estado === "pagado"
                                      ? "Pagada en otro lote"
                                      : "Volvió a por pagar"}
                                </span>

                                {it.puedo_cancelar && (
                                  <button
                                    onClick={() => {
                                      setACancelar({
                                        id: it.solicitud_id,
                                        codigo: it.codigo,
                                        cliente: it.cliente,
                                        banco: it.banco,
                                      });
                                      setMotivo("");
                                    }}
                                    className="pulsable rounded-md px-2 py-1 text-[12px] font-medium text-red-600 hover:bg-red-50"
                                  >
                                    Cancelar envío
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <Paginador
                  pagina={paginaHist}
                  porPagina={POR_PAGINA_HISTORIAL}
                  total={totalHist}
                  cargando={cargandoHist}
                  onCambio={setPaginaHist}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Confirmar lote */}
      {confirmando && (
        <Modal
          titulo={`Confirmar envío de ${lote.length}`}
          onCerrar={() => !enviando && setConfirmando(false)}
        >
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Confírmalo <strong className="text-foreground">después</strong> de
            haber hecho las transferencias. Cada cliente recibirá un aviso de
            que su pago fue enviado.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {desglose.map(([b, n]) => (
              <span
                key={b}
                className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium"
              >
                {b}: <span className="cifras">{n}</span>
              </span>
            ))}
          </div>
          <ul className="scroll-fino mt-3 max-h-[40vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {lote.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="truncate text-[12.5px] text-foreground">
                  {nombreDe(f.cliente)}
                </span>
                <span className="cifras shrink-0 text-[11.5px] text-muted-foreground">
                  {f.cliente?.dni} · {f.banco}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <BotonAccion
              tono="exito"
              cargando={enviando}
              onClick={confirmarLote}
              className="flex-1"
            >
              Ya transferí, confirmar
            </BotonAccion>
            <BotonAccion
              tono="neutro"
              disabled={enviando}
              onClick={() => setConfirmando(false)}
            >
              Volver
            </BotonAccion>
          </div>
        </Modal>
      )}

      {/* Cancelar envio */}
      {aCancelar && (
        <Modal
          titulo={`Cancelar envío de ${aCancelar.codigo}`}
          onCerrar={() => !cancelando && setACancelar(null)}
        >
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {nombreDe(aCancelar.cliente)} · DNI {aCancelar.cliente?.dni}. La
            solicitud volverá a “Por pagar” en {aCancelar.banco} y el cliente
            recibirá un aviso de que su pago se está revisando.
          </p>
          <label
            htmlFor="motivo"
            className="mt-3 block text-[0.8rem] font-medium text-foreground"
          >
            Motivo
          </label>
          <textarea
            id="motivo"
            autoFocus
            rows={3}
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: La transferencia fue rechazada por el banco / cuenta equivocada"
            className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-marca-400"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Queda en el historial con tu nombre. Es obligatorio.
          </p>
          <div className="mt-4 flex gap-2">
            <BotonAccion
              tono="peligro"
              cargando={cancelando}
              disabled={motivo.trim().length < 5}
              onClick={cancelarEnvio}
              className="flex-1"
            >
              Cancelar envío
            </BotonAccion>
            <BotonAccion
              tono="neutro"
              disabled={cancelando}
              onClick={() => setACancelar(null)}
            >
              Volver
            </BotonAccion>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function PestanaBanco({ activa, onClick, titulo, cuenta, propio, mias }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "pulsable flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-[0.8667rem] font-medium",
        activa
          ? "border-marca-700 bg-marca-700 text-white"
          : propio
            ? "border-marca-300 bg-card text-foreground hover:bg-marca-50"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
      title={
        propio === false ? "Banco de otro compañero: solo lectura" : undefined
      }
    >
      {titulo}
      {propio && !activa && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-oro-500"
          aria-label="Tu banco"
        />
      )}
      {cuenta !== null && cuenta !== undefined && (
        <span
          className={cn(
            "cifras rounded-full px-1.5 py-0.5 text-[11px] font-bold",
            activa
              ? "bg-white/20 text-white"
              : "bg-muted text-muted-foreground",
          )}
        >
          {cuenta}
        </span>
      )}
      {mias > 0 && (
        <span
          className={cn(
            "cifras rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            activa ? "bg-oro-500 text-marca-900" : "bg-oro-100 text-oro-700",
          )}
          title="Marcadas por ti"
        >
          ✓{mias}
        </span>
      )}
    </button>
  );
}
