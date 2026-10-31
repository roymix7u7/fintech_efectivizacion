"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { extraerPath } from "@/lib/storage";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { recibeDeposito, BANCOS_PRINCIPALES } from "@/lib/bancos";
import Shell, { Check, Cruz, Billete, Documento, Enviar } from "@/components/shell";
import { Vacio, Aviso } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, Rueda, BarraCarga, CargaPantalla } from "@/components/carga";
import { Segmentos, Buscador, Barra, Leyenda, Dialogo, Motivo, Tostada, Copiar, IconoAlerta } from "@/components/piezas";
import Pista from "@/components/pista";
import Paginador from "@/components/paginador";
import VisorImagen from "@/components/cliente/visor";

const BUCKET_COMPROBANTES = "comprobantes";
const POR_PAGINA = 30;
const POR_PAGINA_HISTORIAL = 15;

// Cada cuanto se refresca la lista sola. Varios encargados trabajan el
// mismo banco: sin esto, uno veria libre una solicitud que otro acaba
// de marcar hasta que recargara a mano.
const REFRESCO_MS = 20 * 1000;

// Las marcas no caducan: hacer transferencias lleva el tiempo que lleve,
// y que vencieran a mitad de una tanda obligaba a marcar otra vez lo ya
// pagado. Lo marcado espera hasta que se confirme o se quite.

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

const porcentaje = (v) =>
  Number(v)
    .toFixed(2)
    .replace(/\.?0+$/, "");

/** Fecha sin hora ("2026-11-02") como "lun. 2 nov.", sin correrse de día. */
const diaCorto = (iso) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
};

/**
 * ¿Qué cuenta recibe? La que eligió Pagos o la de siempre (la base la
 * manda en cuenta_deposito_id). Sin la migración 065, la regla de siempre.
 */
const recibe = (fila, c) =>
  "cuenta_deposito_id" in fila ? c.id === fila.cuenta_deposito_id : recibeDeposito(fila.banco, c);

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

/**
 * Una solicitud en la lista.
 *
 * Es una vista para pagar, no para revisar: lo grande es el nombre, el
 * DNI y las cuentas. El comprobante queda como un botón pequeño, por si
 * hace falta mirarlo.
 */
function Fila({ fila, estado, ocupado, onMarcar, onComprobante, onCancelar, onCuenta }) {
  const tomadaPorOtro = fila.marcada_por && !fila.marcada_por_mi;
  const seleccionable = estado === "aprobado" && fila.puedo_pagar && !tomadaPorOtro;
  const marcada = fila.marcada_por_mi;
  const ningunaRecibe = fila.cuentas?.length > 0 && !fila.cuentas.some((c) => recibe(fila, c));
  // Pagos elige en qué cuenta del cliente depositar: de ahorros o, como
  // último recurso, su CCI.
  const puedeCambiar = estado === "aprobado" && fila.puedo_pagar && !tomadaPorOtro && "cuenta_deposito_id" in fila;

  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border bg-card p-3.5 transition",
        marcada ? "border-marca-500 bg-marca-50/50 ring-1 ring-marca-500/40" : "border-border",
        tomadaPorOtro && "opacity-70",
      )}
    >
      {estado === "aprobado" && (
        <Pista
          texto={
            !fila.puedo_pagar
              ? "Este banco lo atiende otro compañero"
              : tomadaPorOtro
                ? `Marcada por ${fila.marcada_por}`
                : marcada
                  ? "Quitar del lote"
                  : "Agregar al lote"
          }
          lado="right"
        >
          <button
            type="button"
            onClick={() => seleccionable && onMarcar(fila)}
            disabled={!seleccionable || ocupado}
            aria-pressed={marcada}
            aria-label={marcada ? "Quitar del lote" : "Agregar al lote"}
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition",
              marcada ? "border-marca-700 bg-marca-700 text-white" : "border-marca-200 bg-card hover:border-marca-500",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {ocupado ? <Rueda className="h-3 w-3" claro={marcada} /> : marcada && <Check className="h-4 w-4" />}
          </button>
        </Pista>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-md font-bold text-foreground">{nombreDe(fila.cliente) || "Cliente sin nombre"}</p>
          <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5">
            <span className="cifras text-chico font-bold text-foreground">DNI {fila.cliente?.dni}</span>
            <Copiar texto={fila.cliente?.dni} soloIcono etiqueta="Copiar DNI" />
          </span>
        </div>

        <p className="mt-0.5 text-chico text-muted-foreground">
          <span className="cifras font-mono">{fila.codigo}</span>
          {" · "}Tarjeta {fila.banco}
          {fila.ultimos_4 && <span className="cifras"> ···· {fila.ultimos_4}</span>}
          {" · "}
          {estado === "pagado"
            ? `pagada ${haceCuanto(fila.pagado_en)}${fila.pagado_por ? ` por ${fila.pagado_por}` : ""}`
            : estado === "aprobado"
              ? `aprobada ${haceCuanto(fila.fecha_revision)}`
              : `enviada ${haceCuanto(fila.created_at)}`}
        </p>

        {fila.modalidad && (fila.modalidad === "siguiente" || fila.porcentaje_comision != null) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
                fila.modalidad === "siguiente" ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200" : "bg-muted text-foreground",
              )}
            >
              {fila.modalidad === "siguiente" ? "Al día siguiente" : "Mismo día"}
              {fila.porcentaje_comision != null && <span className="cifras font-semibold">· {porcentaje(fila.porcentaje_comision)} %</span>}
            </span>
            {estado === "aprobado" && fila.programada && (
              <span className="inline-flex items-center rounded-full bg-oro-100 px-2 py-0.5 text-xs font-bold text-oro-700">
                Programada: {diaCorto(fila.fecha_deposito)}
              </span>
            )}
          </div>
        )}

        {/* La cuenta que recibe va primera y resaltada: el pagador no
            tiene que deducir a cuál depositar. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fila.cuentas?.length ? (
            [...fila.cuentas]
              .sort((a, b) => recibe(fila, b) - recibe(fila, a))
              .map((c, i) => {
                const esta = recibe(fila, c);
                const elegible = puedeCambiar && !esta;
                const esCci = c.tipo === "interbancaria";
                return (
                  <span
                    key={c.id || i}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1",
                      esta ? "border-emerald-300 bg-emerald-50" : "border-border bg-background",
                      !esta && !elegible && "opacity-70",
                    )}
                  >
                    {esta && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-1.5 py-px text-xs font-bold text-white">
                        <Check className="h-3 w-3" />
                        Recibe
                      </span>
                    )}
                    <span className="text-xs font-bold uppercase tracking-wide text-marca-700">{c.banco}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{c.tipo === "interbancaria" ? "CCI" : "Ahorros"}</span>
                    <span className="cifras font-mono text-sm font-semibold text-foreground">{agrupar(c.numero)}</span>
                    <Copiar texto={c.numero} soloIcono etiqueta="Copiar el número" />
                    {elegible && (
                      <Pista texto={esCci ? "Último recurso: transferencia interbancaria a su CCI. Tarda más en reflejarse." : "Depositar en esta cuenta del cliente"}>
                        <button
                          type="button"
                          onClick={() => onCuenta(fila, c)}
                          disabled={ocupado}
                          className={cn(
                            "ml-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold transition disabled:opacity-50",
                            esCci ? "bg-oro-50 text-oro-700 hover:bg-oro-100" : "bg-marca-50 text-marca-700 hover:bg-marca-100",
                          )}
                        >
                          {esCci ? "Por CCI" : "Depositar aquí"}
                        </button>
                      </Pista>
                    )}
                  </span>
                );
              })
          ) : (
            <span className="rounded-lg bg-red-50 px-2 py-1 text-chico font-semibold text-red-700">
              Sin cuentas registradas: contacta al cliente antes de pagar
            </span>
          )}
        </div>

        {fila.cuenta_cambiada && estado === "aprobado" && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-chico font-semibold text-oro-700">
            {fila.cuentas?.find((c) => c.id === fila.cuenta_deposito_id)?.tipo === "interbancaria"
              ? "Se pagará por CCI (transferencia interbancaria): al confirmar, el cliente recibe un aviso con su CCI."
              : "No es la cuenta de siempre: al confirmar, el cliente recibe un aviso con la cuenta."}
            {puedeCambiar && (
              <button type="button" onClick={() => onCuenta(fila, null)} disabled={ocupado} className="underline underline-offset-2">
                Volver a la de siempre
              </button>
            )}
          </p>
        )}

        {estado === "pagado" && fila.deposito && (
          <p className="mt-1.5 text-chico text-muted-foreground">
            Pagado en{" "}
            <span className="font-semibold text-foreground">
              {fila.deposito.tipo === "interbancaria" ? "CCI" : "ahorros"} {fila.deposito.banco} ···· {fila.deposito.ultimos_4}
            </span>
            {BANCOS_PRINCIPALES.includes(fila.banco) && fila.deposito.banco !== fila.banco && " (otra cuenta del cliente)"}
          </p>
        )}

        {ningunaRecibe && (
          <p className="mt-1.5 text-chico font-semibold text-red-700">
            Ninguna cuenta recibe esta operación: falta la cuenta de ahorros
            {BANCOS_PRINCIPALES.includes(fila.banco) ? ` ${fila.banco}` : ""}.{" "}
            {fila.cuentas.some((c) => c.tipo === "interbancaria") && "cuenta_deposito_id" in fila
              ? "Contacta al cliente o, como último recurso, usa «Por CCI»."
              : "Contacta al cliente antes de pagar."}
          </p>
        )}

        {fila.nota_cliente && <p className="mt-1.5 text-chico italic text-muted-foreground">“{fila.nota_cliente}”</p>}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {tomadaPorOtro && (
          <span className="max-w-[170px] truncate rounded-full bg-oro-100 px-2 py-0.5 text-xs font-bold text-oro-700">
            Marcada por {fila.marcada_por}
          </span>
        )}
        {!fila.puedo_pagar && estado === "aprobado" && !tomadaPorOtro && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Solo lectura</span>
        )}
        {fila.comprobante_url && (
          <BotonAccion tono="suave" tamano="chico" onClick={() => onComprobante(fila.comprobante_url)} icono={<Documento className="h-3.5 w-3.5" />}>
            Comprobante
          </BotonAccion>
        )}
        {estado === "pagado" && fila.puedo_pagar && (
          <BotonAccion tono="peligroSuave" tamano="chico" onClick={() => onCancelar(fila)}>
            Cancelar envío
          </BotonAccion>
        )}
      </div>
    </li>
  );
}

// ── Pantalla ──────────────────────────────────────────────────

export default function PagosPage() {
  const router = useRouter();
  const [session, setSession] = useState(sesionEnCache);
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
  // Comprobante abierto en el visor: { url } (url null mientras se firma).
  const [comprobante, setComprobante] = useState(null);

  // ── Carga ──

  /** Cambia en qué cuenta del cliente se deposita (null: la de siempre). */
  async function cambiarCuenta(fila, cuenta) {
    setOcupados((o) => new Set(o).add(fila.id));
    const { error: e } = await supabase.rpc("pagos_cuenta_deposito", {
      p_solicitud: fila.id,
      p_cuenta: cuenta?.id ?? null,
    });
    setOcupados((o) => {
      const n = new Set(o);
      n.delete(fila.id);
      return n;
    });
    if (e) return setError(motivoDe(e, "No se pudo cambiar la cuenta de depósito."));
    setOk(
      cuenta
        ? `Se depositará en ${cuenta.tipo === "interbancaria" ? "el CCI" : "ahorros"} ${cuenta.banco} ···· ${String(cuenta.numero).slice(-4)}.`
        : "Vuelve a la cuenta de siempre.",
    );
    cargarLista({ silencioso: true });
    cargarLote();
  }

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
    // Se abre aquí mismo, con zoom; mientras se firma, el visor espera.
    setComprobante({ url: null });
    const { data, error: e } = await supabase.storage
      .from(BUCKET_COMPROBANTES)
      .createSignedUrl(path, 300);
    if (e || !data?.signedUrl) {
      setComprobante(null);
      return setError(
        "No se pudo abrir el comprobante: " + (e?.message || "sin URL"),
      );
    }
    setComprobante({ url: data.signedUrl });
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

  if (!session) return <CargaPantalla />;

  const esPagos = session.rol === "pagos";
  // banco deja de ser undefined cuando ya llegó el resumen: antes de eso
  // no se sabe si tiene bancos y el aviso parpadearía al entrar.
  const sinBancos = esPagos && banco !== undefined && misBancos.length === 0;

  return (
    <Shell
      session={session}
      titulo="Pagos"
      descripcion={esPagos ? (misBancos.length ? `Tus bancos: ${misBancos.join(", ")}` : "Sin bancos asignados") : "Todos los bancos"}
      ayuda="Marca las solicitudes aprobadas que vas a transferir, haz las transferencias desde el banco y confirma el lote. Cada cliente recibe un aviso de que su pago fue enviado."
    >
      <BarraCarga activa={refrescando} />

      <div className="space-y-4">
        {sinBancos && (
          <Aviso tono="espera" titulo="Todavía no tienes bancos asignados">
            Puedes ver el trabajo de todos, pero para marcar y pagar el administrador tiene que asignarte tus bancos desde Equipo.
          </Aviso>
        )}
        {error && (
          <Aviso titulo="Atención" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        )}

        <Barra className="mb-0">
          <Segmentos
            valor={vista}
            onCambio={setVista}
            opciones={[
              { clave: "cola", etiqueta: "Para pagar" },
              { clave: "historial", etiqueta: "Lotes enviados" },
            ]}
          />
          {vista === "cola" && (
            <Segmentos
              valor={estado}
              onCambio={setEstado}
              tamano="chico"
              opciones={ESTADOS.map((x) => ({
                clave: x.clave,
                etiqueta: x.titulo,
                pista:
                  x.clave === "aprobado"
                    ? "Aprobadas por un revisor: listas para transferir."
                    : x.clave === "pendiente"
                      ? "Todavía no las valida un revisor. Se muestran para responder si el cliente pregunta; se pagan cuando pasan a «Por pagar»."
                      : "Ya transferidas, las más recientes primero. Si un envío salió mal, cancélalo y vuelve a «Por pagar».",
              }))}
            />
          )}
          <Buscador
            valor={buscar}
            onCambio={setBuscar}
            pendiente={buscar !== termino}
            placeholder={vista === "cola" ? "DNI, nombre o código" : "DNI o código"}
            className="w-full sm:w-72"
            autoFocus
          />
        </Barra>

        {/* Bancos */}
        <div className="scroll-fino -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <PestanaBanco activa={banco === null} onClick={() => setBanco(null)} titulo="Todos" cuenta={vista === "cola" ? totalTodos : null} />
          {resumen.map((r) => (
            <PestanaBanco
              key={r.banco}
              activa={banco === r.banco}
              onClick={() => setBanco(r.banco)}
              titulo={r.banco}
              cuenta={vista === "cola" ? Number(r[campo] || 0) : null}
              propio={r.es_mio}
              mias={Number(r.marcadas_por_mi || 0)}
              programadas={vista === "cola" && estado === "aprobado" ? Number(r.programadas || 0) : 0}
            />
          ))}
        </div>

        {vista === "cola" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-3">
              {bancoPropio === false && estado === "aprobado" && (
                <Aviso tono="info">{banco} lo atiende otro compañero. Puedes ver sus solicitudes, pero no marcarlas.</Aviso>
              )}

              {cargando ? (
                <EsqueletoFilas filas={5} alto="h-[96px]" />
              ) : filas.length === 0 ? (
                <Vacio
                  icono={<Billete />}
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
                      ? "Revisa el DNI o prueba en «Todos» los bancos."
                      : estado === "aprobado"
                        ? "Cuando un revisor apruebe una solicitud, aparecerá aquí."
                        : undefined
                  }
                />
              ) : (
                <>
                  <ul className="space-y-2">
                    {filas.map((f, i) => (
                      <FilaConSeparador key={f.id} fila={f} anterior={filas[i - 1]} estado={estado}>
                        <Fila
                          fila={f}
                          estado={estado}
                          ocupado={ocupados.has(f.id)}
                          onMarcar={alternarMarca}
                          onComprobante={verComprobante}
                          onCuenta={cambiarCuenta}
                          onCancelar={(x) => {
                            setACancelar(x);
                            setMotivo("");
                          }}
                        />
                      </FilaConSeparador>
                    ))}
                  </ul>
                  <Paginador pagina={pagina} porPagina={POR_PAGINA} total={total} cargando={refrescando} onCambio={setPagina} />
                </>
              )}

              {estado === "aprobado" && filas.length > 0 && (
                <Leyenda
                  items={[
                    {
                      texto: "Recibe",
                      marca: <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />,
                      pista: "La cuenta a la que hay que depositar: la de ahorros del banco de la tarjeta, o la que elijas con «Depositar aquí».",
                    },
                    {
                      texto: "Tu banco",
                      marca: <span className="h-2 w-2 rounded-full bg-oro-500" />,
                      pista: "Bancos que te asignaron. En los demás solo puedes mirar.",
                    },
                    {
                      texto: "Marcadas por ti",
                      marca: <span className="rounded bg-oro-100 px-1 text-xs font-bold text-oro-700">✓3</span>,
                      pista: "Cuántas tienes en tu lote en ese banco.",
                    },
                  ]}
                />
              )}
            </div>

            {/* Lote en preparación */}
            <aside className="lg:sticky lg:top-[76px] lg:self-start">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
                <div className="flex items-center gap-2 border-b border-border bg-marca-900 px-4 py-3 text-white">
                  <h2 className="t-seccion">Tu lote</h2>
                  <Pista texto="Lo marcado queda guardado para ti hasta que confirmes el envío o lo quites. Puedes buscar otro DNI, cambiar de banco o cerrar la pantalla y seguir después." />
                  <span className="cifras ml-auto font-heading text-2xl font-semibold text-oro-500">{lote.length}</span>
                </div>

                <div className="p-4">
                  {lote.length === 0 ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Marca las casillas de las solicitudes que vas a transferir.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {desglose.map(([b, n]) => (
                          <span key={b} className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                            {b} · <span className="cifras">{n}</span>
                          </span>
                        ))}
                      </div>

                      <ul className="scroll-fino mt-3 max-h-[42vh] space-y-0.5 overflow-y-auto">
                        {lote.map((f) => (
                          <li key={f.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">{nombreDe(f.cliente)}</p>
                              <p className="cifras text-xs text-muted-foreground">
                                {f.cliente?.dni} · {f.banco} · {f.codigo}
                              </p>
                            </div>
                            <button
                              onClick={() => quitarDelLote([f.id])}
                              className="rounded p-1 text-muted-foreground opacity-60 hover:bg-card hover:text-red-600 group-hover:opacity-100"
                              aria-label={`Quitar a ${nombreDe(f.cliente)} del lote`}
                            >
                              <Cruz className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>

                      <BotonAccion tono="exito" className="mt-3 w-full" onClick={() => setConfirmando(true)} icono={<Enviar className="h-4 w-4" />}>
                        Confirmar envío de {lote.length}
                      </BotonAccion>
                      <BotonAccion tono="suave" tamano="chico" className="mt-1.5 w-full" onClick={() => quitarDelLote(lote.map((f) => f.id))}>
                        Vaciar lote
                      </BotonAccion>
                    </>
                  )}
                </div>
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
                icono={<Billete />}
                titulo={termino ? "Ningún lote con ese DNI o código" : "Todavía no hay lotes"}
                detalle="Cada vez que alguien confirma un envío, el lote queda registrado aquí."
              />
            ) : (
              <>
                <ul className="space-y-2">
                  {lotes.map((l) => {
                    const abierto = abiertos.has(l.id);
                    const canceladas = l.items.filter((i) => i.cancelacion).length;
                    return (
                      <li key={l.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
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
                          <span className="text-md font-bold text-foreground">{fechaHora(l.creado_en)}</span>
                          <span className="text-sm text-muted-foreground">{l.creado_por}</span>
                          <span className="cifras text-sm font-semibold text-foreground">
                            {l.cantidad} solicitud{l.cantidad === 1 ? "" : "es"}
                          </span>
                          <span className="flex gap-1">
                            {(l.bancos || []).map((b) => (
                              <span key={b} className="rounded bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                                {b}
                              </span>
                            ))}
                          </span>
                          {canceladas > 0 && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                              {canceladas} cancelada{canceladas === 1 ? "" : "s"}
                            </span>
                          )}
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", abierto && "rotate-180")}
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>

                        {abierto && (
                          <ul className="divide-y divide-border border-t border-border">
                            {l.items.map((it) => (
                              <li key={it.solicitud_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                                <div className="min-w-[200px] flex-1">
                                  <p className="text-sm font-semibold text-foreground">{nombreDe(it.cliente)}</p>
                                  <p className="cifras text-xs text-muted-foreground">
                                    DNI {it.cliente?.dni} · {it.codigo} · Tarjeta {it.banco}
                                  </p>
                                  {it.cancelacion && (
                                    <p className="mt-0.5 text-chico text-red-700">
                                      Cancelada por {it.cancelacion.por} ({fechaHora(it.cancelacion.en)}): {it.cancelacion.motivo}
                                    </p>
                                  )}
                                </div>

                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-xs font-bold",
                                    it.en_este_lote && it.estado === "pagado"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : it.estado === "pagado"
                                        ? "bg-marca-50 text-marca-700"
                                        : "bg-oro-100 text-oro-700",
                                  )}
                                >
                                  {it.en_este_lote && it.estado === "pagado"
                                    ? "Pagada"
                                    : it.estado === "pagado"
                                      ? "Pagada en otro lote"
                                      : "Volvió a por pagar"}
                                </span>

                                {it.puedo_cancelar && (
                                  <BotonAccion
                                    tono="peligroSuave"
                                    tamano="chico"
                                    onClick={() => {
                                      setACancelar({ id: it.solicitud_id, codigo: it.codigo, cliente: it.cliente, banco: it.banco });
                                      setMotivo("");
                                    }}
                                  >
                                    Cancelar envío
                                  </BotonAccion>
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
      <Dialogo
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        bloqueado={enviando}
        titulo={`Confirmar envío de ${lote.length}`}
        descripcion="Confírmalo después de haber hecho las transferencias. Cada cliente recibirá un aviso de que su pago fue enviado."
        tono="exito"
        icono={<Enviar className="h-5 w-5" />}
        ancho="max-w-lg"
        pie={
          <>
            <BotonAccion tono="neutro" disabled={enviando} onClick={() => setConfirmando(false)}>
              Volver
            </BotonAccion>
            <BotonAccion tono="exito" cargando={enviando} onClick={confirmarLote}>
              Ya transferí, confirmar
            </BotonAccion>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {desglose.map(([b, n]) => (
            <span key={b} className="rounded-full bg-muted px-2.5 py-1 text-chico font-bold">
              {b}: <span className="cifras">{n}</span>
            </span>
          ))}
        </div>
        <ul className="scroll-fino mt-3 max-h-[40vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {lote.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-sm text-foreground">{nombreDe(f.cliente)}</span>
              <span className="cifras shrink-0 text-chico text-muted-foreground">
                {f.cliente?.dni} · {f.banco}
              </span>
            </li>
          ))}
        </ul>
      </Dialogo>

      {/* Cancelar envío */}
      <Dialogo
        abierto={Boolean(aCancelar)}
        onCerrar={() => setACancelar(null)}
        bloqueado={cancelando}
        titulo={`Cancelar envío de ${aCancelar?.codigo || ""}`}
        descripcion={
          aCancelar
            ? `${nombreDe(aCancelar.cliente)} · DNI ${aCancelar.cliente?.dni}. Volverá a «Por pagar» en ${aCancelar.banco} y el cliente recibirá un aviso de que su pago se está revisando.`
            : ""
        }
        tono="peligro"
        icono={<IconoAlerta />}
        pie={
          <>
            <BotonAccion tono="neutro" disabled={cancelando} onClick={() => setACancelar(null)}>
              Volver
            </BotonAccion>
            <BotonAccion tono="peligro" cargando={cancelando} disabled={motivo.trim().length < 5} onClick={cancelarEnvio}>
              Cancelar envío
            </BotonAccion>
          </>
        }
      >
        <Motivo
          id="motivo"
          etiqueta="Motivo"
          ayuda="Queda en el historial con tu nombre. Es obligatorio."
          valor={motivo}
          onCambio={setMotivo}
          minimo={5}
          maximo={300}
          sugerencias={["La transferencia fue rechazada por el banco.", "Se transfirió a una cuenta equivocada."]}
          placeholder="Ej: La transferencia fue rechazada por el banco"
        />
      </Dialogo>

      <VisorImagen
        src={comprobante?.url}
        alt="Comprobante de la operación"
        abierto={Boolean(comprobante)}
        onCerrar={() => setComprobante(null)}
      />
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

/**
 * Por pagar: lo de hoy va primero; al empezar lo programado para otro
 * día (depósito al día siguiente) se pone un separador.
 */
function FilaConSeparador({ fila, anterior, estado, children }) {
  const empieza = estado === "aprobado" && fila.programada && (!anterior || !anterior.programada);
  return (
    <>
      {empieza && (
        <li className="flex items-center gap-3 pt-3" aria-hidden>
          <span className="t-etiqueta whitespace-nowrap text-oro-700">Programadas para otro día</span>
          <span className="h-px flex-1 bg-border" />
        </li>
      )}
      {children}
    </>
  );
}

function PestanaBanco({ activa, onClick, titulo, cuenta, propio, mias, programadas = 0 }) {
  const boton = (
    <button
      onClick={onClick}
      className={cn(
        "pulsable flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-bold",
        activa
          ? "border-marca-700 bg-marca-700 text-white"
          : propio
            ? "border-marca-300 bg-card text-foreground hover:bg-marca-50"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {propio && <span className={cn("h-2 w-2 rounded-full", activa ? "bg-oro-300" : "bg-oro-500")} aria-label="Tu banco" />}
      {titulo}
      {cuenta !== null && cuenta !== undefined && (
        <span className={cn("cifras rounded-full px-1.5 py-0.5 text-xs font-bold", activa ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>
          {cuenta}
        </span>
      )}
      {mias > 0 && (
        <span className={cn("cifras rounded-full px-1.5 py-0.5 text-xs font-bold", activa ? "bg-oro-500 text-marca-900" : "bg-oro-100 text-oro-700")}>
          ✓{mias}
        </span>
      )}
      {programadas > 0 && (
        <span
          title="Programadas para otro día (depósito al día siguiente)"
          className={cn("cifras rounded-full px-1.5 py-0.5 text-xs font-semibold", activa ? "bg-white/15 text-white/80" : "bg-sky-50 text-sky-800")}
        >
          +{programadas} luego
        </span>
      )}
    </button>
  );
  return propio === false ? (
    <Pista texto="Banco de otro compañero: solo lectura" lado="bottom">
      {boton}
    </Pista>
  ) : (
    boton
  );
}
