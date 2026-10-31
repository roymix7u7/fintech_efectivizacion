"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Persona } from "@/components/shell";
import { Vacio } from "@/components/marca";
import { EsqueletoFilas, BotonAccion } from "@/components/carga";
import { Buscador, Barra, Campo, Dialogo } from "@/components/piezas";
import Paginador from "@/components/paginador";
import Pista from "@/components/pista";

/**
 * Seguimiento de clientes (posventa): en qué etapa está cada cliente y
 * a quién llamar para que empiece a operar o vuelva. La etapa la calcula
 * la base (etapa_cliente); cada contacto queda registrado, y desde aquí
 * se mandan recordatorios a la app y la web (campana + notificación).
 */
export const ETAPAS = {
  sin_tarjeta: {
    t: "Sin tarjeta",
    c: "bg-oro-50 text-oro-700 ring-oro-200",
    hacer: "Verificados que no registran tarjeta. Ayúdalos a registrarla.",
    whatsapp: (n) =>
      `Hola ${n}, te saluda ALTOQUE PERU WK. Tu cuenta ya está verificada, pero aún no registras tu tarjeta. ¿Te ayudamos a hacerlo?`,
  },
  sin_cuenta: {
    t: "Falta cuenta",
    c: "bg-oro-50 text-oro-700 ring-oro-200",
    hacer:
      "Tienen tarjeta verificada, pero no una cuenta de ahorros donde depositarles.",
    whatsapp: (n) =>
      `Hola ${n}, te saluda ALTOQUE PERU WK. Tu tarjeta ya está verificada; solo falta tu cuenta de ahorros para poder depositarte. ¿Te ayudamos?`,
  },
  sin_operar: {
    t: "Listo, sin operar",
    c: "bg-sky-50 text-sky-800 ring-sky-200",
    hacer:
      "Tienen todo listo y nunca enviaron una solicitud. Resuelve sus dudas.",
    whatsapp: (n) =>
      `Hola ${n}, te saluda ALTOQUE PERU WK. Ya tienes todo listo para operar. ¿Tienes alguna duda para enviar tu primera solicitud?`,
  },
  inactivo: {
    t: "Inactivo",
    c: "bg-red-50 text-red-700 ring-red-200",
    hacer:
      "Operaron antes, pero no en los últimos 30 días. Pregunta cómo les fue.",
    whatsapp: (n) =>
      `Hola ${n}, te saluda ALTOQUE PERU WK. Hace un tiempo no operas con nosotros. ¿Podemos ayudarte en algo?`,
  },
  tarjeta_en_revision: {
    t: "Tarjeta en revisión",
    c: "bg-marca-50 text-marca-700 ring-marca-200",
    hacer:
      "Esperan que el equipo verifique su tarjeta. No hace falta llamarlos.",
  },
  sin_verificar: {
    t: "Sin verificar",
    c: "bg-muted text-muted-foreground ring-border",
    hacer: "Su identidad aún no se aprueba (en revisión u observada).",
  },
  opera: {
    t: "Opera",
    c: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    hacer: "Enviaron una solicitud en los últimos 30 días.",
  },
  bloqueado: {
    t: "Bloqueado",
    c: "bg-red-50 text-red-700 ring-red-200",
    hacer: "Cuentas bloqueadas.",
  },
};
// Las que se trabajan, primero.
const ORDEN = [
  "sin_tarjeta",
  "sin_cuenta",
  "sin_operar",
  "inactivo",
  "tarjeta_en_revision",
  "sin_verificar",
  "opera",
];
const CON_RECORDATORIO = [
  "sin_tarjeta",
  "sin_cuenta",
  "sin_operar",
  "inactivo",
];

export const RESULTADOS = {
  interesado: { t: "Interesado", c: "bg-emerald-50 text-emerald-700" },
  volver_a_llamar: { t: "Volver a llamar", c: "bg-oro-50 text-oro-700" },
  no_contesto: { t: "No contestó", c: "bg-muted text-muted-foreground" },
  no_interesado: { t: "No interesado", c: "bg-red-50 text-red-700" },
  numero_equivocado: { t: "Número equivocado", c: "bg-red-50 text-red-700" },
  enviado: { t: "Recordatorio", c: "bg-sky-50 text-sky-800" },
};

const POR_PAGINA = 30;
const hoyLima = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

function haceDias(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}
const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
const fechaDia = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};
const soloDigitos = (t) => String(t || "").replace(/\D/g, "");

export default function Seguimiento({ onVerFicha, onAviso }) {
  const [etapa, setEtapa] = useState("sin_tarjeta");
  const [busqueda, setBusqueda] = useState("");
  const termino = useRetraso(busqueda);
  const [pagina, setPagina] = useState(0);
  const [datos, setDatos] = useState({ resumen: {}, total: 0, filas: [] });
  const [cargando, setCargando] = useState(true);
  const [elegidos, setElegidos] = useState(new Set());
  const [contacto, setContacto] = useState(null); // cliente al que se registra el contacto
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: e } = await supabase.rpc("clientes_seguimiento", {
      p_etapa: etapa === "todos" ? null : etapa,
      p_buscar: termino.trim() || null,
      p_limite: POR_PAGINA,
      p_desde: pagina * POR_PAGINA,
    });
    setCargando(false);
    if (e)
      return setError(
        e.code === "PGRST202"
          ? "Falta aplicar en Supabase la migración 20261031000066_seguimiento_clientes.sql."
          : explicarError(e, "No se pudo cargar el seguimiento."),
      );
    setError("");
    setDatos(data || { resumen: {}, total: 0, filas: [] });
  }, [etapa, termino, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => {
    setPagina(0);
    setElegidos(new Set());
  }, [etapa, termino]);

  async function recordar(ids) {
    setEnviando(true);
    const { data, error: e } = await supabase.rpc("enviar_recordatorio", {
      p_clientes: ids,
    });
    setEnviando(false);
    if (e)
      return setError(explicarError(e, "No se pudo enviar el recordatorio."));
    const omitidos = data?.omitidos || [];
    const enviados = data?.enviados || 0;
    onAviso(
      enviados
        ? `Recordatorio enviado a ${enviados} cliente${enviados === 1 ? "" : "s"}${omitidos.length ? ` · ${omitidos.length} omitido${omitidos.length === 1 ? "" : "s"} (${omitidos[0].motivo})` : ""}.`
        : `No se envió: ${omitidos[0]?.motivo || "no aplica"}.`,
    );
    setElegidos(new Set());
    cargar();
  }

  const resumen = datos.resumen || {};
  const filas = datos.filas || [];
  const info = ETAPAS[etapa];
  const conRecordatorio = CON_RECORDATORIO.includes(etapa);
  const todosElegidos =
    filas.length > 0 && filas.every((f) => elegidos.has(f.id));

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {/* Etapas con su cantidad */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {ORDEN.map((k) => {
          const e = ETAPAS[k];
          const activa = etapa === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setEtapa(k)}
              aria-pressed={activa}
              className={cn(
                "rounded-xl border bg-card px-3 py-2.5 text-left transition",
                activa
                  ? "border-marca-700 ring-2 ring-marca-700/20"
                  : "border-border hover:border-marca-300",
              )}
            >
              <span className="cifras block font-heading text-2xl font-semibold text-foreground">
                {resumen[k] ?? 0}
              </span>
              <span
                className={cn(
                  "mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
                  e.c,
                )}
              >
                {e.t}
              </span>
            </button>
          );
        })}
      </div>

      <Barra>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{info?.hacer}</p>
        </div>
        <Buscador
          valor={busqueda}
          onCambio={setBusqueda}
          pendiente={busqueda !== termino}
          placeholder="Nombre, DNI o celular"
          className="w-full sm:w-64"
        />
      </Barra>

      {conRecordatorio && filas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="flex-1 text-chico text-sky-900">
            Los recordatorios llegan a la campana y como notificación al
            celular. Máximo uno cada 3 días por cliente
            {etapa === "inactivo"
              ? "; a los inactivos solo si aceptaron recibir novedades"
              : ""}
            . Además salen solos cada día hábil a las 10 a. m.
          </p>
          <BotonAccion
            tamano="chico"
            disabled={!elegidos.size}
            cargando={enviando}
            onClick={() => recordar([...elegidos])}
          >
            Enviar recordatorio{elegidos.size ? ` (${elegidos.size})` : ""}
          </BotonAccion>
        </div>
      )}

      {cargando && filas.length === 0 ? (
        <EsqueletoFilas filas={6} />
      ) : filas.length === 0 ? (
        <Vacio
          icono={<Persona />}
          titulo="Nadie en esta etapa"
          detalle={termino ? "Prueba con otro nombre o DNI." : "Buen trabajo."}
        />
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-xl border border-border bg-card shadow-panel transition",
            cargando && "opacity-60",
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  {conRecordatorio && (
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Elegir todos"
                        checked={todosElegidos}
                        onChange={() =>
                          setElegidos(
                            todosElegidos
                              ? new Set()
                              : new Set(filas.map((f) => f.id)),
                          )
                        }
                        className="h-4 w-4 accent-marca-700"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2.5 t-etiqueta">Cliente</th>
                  <th className="px-3 py-2.5 t-etiqueta">Contactar</th>
                  <th className="px-3 py-2.5 t-etiqueta">Situación</th>
                  <th className="px-3 py-2.5 t-etiqueta">Último contacto</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => {
                  const e = ETAPAS[f.etapa] || {};
                  const uc = f.ultimo_contacto;
                  const toca = uc?.volver_el && uc.volver_el <= hoyLima();
                  const tel = soloDigitos(f.telefono);
                  const wa = tel
                    ? `https://wa.me/${tel.length === 9 ? `51${tel}` : tel}?text=${encodeURIComponent((e.whatsapp || ((n) => `Hola ${n}, te saluda ALTOQUE PERU WK.`))(f.nombres.split(" ")[0]))}`
                    : null;
                  return (
                    <tr key={f.id} className={cn(toca && "bg-oro-50/50")}>
                      {conRecordatorio && (
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Elegir a ${f.nombres}`}
                            checked={elegidos.has(f.id)}
                            onChange={() =>
                              setElegidos((s) => {
                                const n = new Set(s);
                                n.has(f.id) ? n.delete(f.id) : n.add(f.id);
                                return n;
                              })
                            }
                            className="h-4 w-4 accent-marca-700"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => onVerFicha(f.dni)}
                          className="text-left hover:underline"
                        >
                          <span className="block font-semibold text-foreground">
                            {f.nombres} {f.apellidos}
                          </span>
                          <span className="cifras block text-chico text-muted-foreground">
                            {f.tipo_documento === "ce" ? "CE" : "DNI"} {f.dni} ·
                            registro {fechaCorta(f.created_at)}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="cifras block text-sm text-foreground">
                          {f.telefono || "—"}
                        </span>
                        {tel && (
                          <span className="mt-1 flex gap-1.5">
                            <a
                              href={`tel:+${tel.length === 9 ? `51${tel}` : tel}`}
                              className="rounded-md bg-marca-50 px-2 py-0.5 text-xs font-bold text-marca-700 hover:bg-marca-100"
                            >
                              Llamar
                            </a>
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener"
                              className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                            >
                              WhatsApp
                            </a>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
                            e.c,
                          )}
                        >
                          {e.t}
                        </span>
                        <span className="mt-1 block text-chico text-muted-foreground">
                          {f.ultima_operacion
                            ? `Última operación ${haceDias(f.ultima_operacion)} · ${f.operaciones} pagada${f.operaciones === 1 ? "" : "s"}`
                            : f.fecha_validacion
                              ? `Verificado ${haceDias(f.fecha_validacion)}`
                              : `Registrado ${haceDias(f.created_at)}`}
                        </span>
                        {f.recordatorios > 0 && (
                          <span className="block text-chico text-sky-800">
                            {f.recordatorios} recordatorio
                            {f.recordatorios === 1 ? "" : "s"} · último{" "}
                            {haceDias(f.ultimo_recordatorio)}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        {uc ? (
                          <>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                                  RESULTADOS[uc.resultado]?.c,
                                )}
                              >
                                {RESULTADOS[uc.resultado]?.t || uc.resultado}
                              </span>
                              <span className="text-chico text-muted-foreground">
                                {uc.canal === "whatsapp"
                                  ? "WhatsApp"
                                  : "Llamada"}{" "}
                                · {haceDias(uc.en)}
                              </span>
                            </span>
                            {uc.volver_el && (
                              <span
                                className={cn(
                                  "mt-1 block text-chico font-semibold",
                                  toca
                                    ? "text-oro-700"
                                    : "text-muted-foreground",
                                )}
                              >
                                {toca
                                  ? "Toca llamar hoy"
                                  : `Volver a llamar el ${fechaDia(uc.volver_el)}`}
                              </span>
                            )}
                            {uc.nota && (
                              <Pista texto={uc.nota}>
                                <span className="mt-0.5 block truncate text-chico italic text-muted-foreground">
                                  “{uc.nota}”
                                </span>
                              </Pista>
                            )}
                            {uc.por && (
                              <span className="block text-[0.7rem] text-muted-foreground">
                                {uc.por}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-chico font-semibold text-muted-foreground">
                            Sin contactar
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <span className="inline-flex gap-1.5">
                          <BotonAccion
                            tamano="chico"
                            tono="neutro"
                            onClick={() => setContacto(f)}
                          >
                            Registrar contacto
                          </BotonAccion>
                          {CON_RECORDATORIO.includes(f.etapa) && (
                            <BotonAccion
                              tamano="chico"
                              tono="suave"
                              disabled={enviando}
                              onClick={() => recordar([f.id])}
                            >
                              Recordatorio
                            </BotonAccion>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Paginador
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={datos.total}
        cargando={cargando}
        onCambio={setPagina}
      />

      <RegistrarContacto
        cliente={contacto}
        onCerrar={() => setContacto(null)}
        onListo={(texto) => {
          setContacto(null);
          onAviso(texto);
          cargar();
        }}
      />
    </div>
  );
}

/** Ventana para anotar una llamada o un WhatsApp con su resultado. */
function RegistrarContacto({ cliente, onCerrar, onListo }) {
  const [canal, setCanal] = useState("llamada");
  const [resultado, setResultado] = useState("");
  const [nota, setNota] = useState("");
  const [volver, setVolver] = useState("");
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cliente) return;
    setCanal("llamada");
    setResultado("");
    setNota("");
    setVolver("");
    setTocado(false);
    setError("");
  }, [cliente]);

  const fallas = {
    resultado: !resultado ? "Elige el resultado." : null,
    volver:
      resultado === "volver_a_llamar" && !volver
        ? "Indica cuándo volver a llamar."
        : volver && volver < hoyLima()
          ? "No puede ser una fecha pasada."
          : null,
    nota: nota.length > 500 ? "Máximo 500 caracteres." : null,
  };

  async function guardar() {
    setTocado(true);
    if (Object.values(fallas).some(Boolean)) return;
    setGuardando(true);
    const { error: e } = await supabase.rpc("registrar_seguimiento", {
      p_cliente: cliente.id,
      p_canal: canal,
      p_resultado: resultado,
      p_nota: nota.trim() || null,
      p_volver_el: volver || null,
    });
    setGuardando(false);
    if (e)
      return setError(
        e.code === "P0001"
          ? e.message
          : explicarError(e, "No se pudo registrar."),
      );
    onListo(`Contacto con ${cliente.nombres} registrado.`);
  }

  return (
    <Dialogo
      abierto={Boolean(cliente)}
      onCerrar={onCerrar}
      titulo={
        cliente ? `Contacto con ${cliente.nombres} ${cliente.apellidos}` : ""
      }
      descripcion="Queda registrado con tu nombre, la fecha y la etapa del cliente."
      icono={<Persona className="h-5 w-5" />}
      pie={
        <>
          <BotonAccion tono="neutro" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonAccion>
          <BotonAccion onClick={guardar} cargando={guardando}>
            Guardar
          </BotonAccion>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <Campo etiqueta="Canal">
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Canal"
          >
            {[
              ["llamada", "Llamada"],
              ["whatsapp", "WhatsApp"],
            ].map(([k, t]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={canal === k}
                onClick={() => setCanal(k)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-semibold transition",
                  canal === k
                    ? "border-marca-700 bg-marca-700 text-white"
                    : "border-border hover:bg-muted/50",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Campo>
        <Campo etiqueta="Resultado" error={tocado ? fallas.resultado : null}>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Resultado"
          >
            {[
              "interesado",
              "volver_a_llamar",
              "no_contesto",
              "no_interesado",
              "numero_equivocado",
            ].map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={resultado === k}
                onClick={() => setResultado(k)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                  resultado === k
                    ? "border-marca-700 bg-marca-700 text-white"
                    : "border-border hover:bg-muted/50",
                )}
              >
                {RESULTADOS[k].t}
              </button>
            ))}
          </div>
        </Campo>
        <Campo
          etiqueta="Volver a llamar el"
          htmlFor="volverEl"
          opcional={resultado !== "volver_a_llamar"}
          error={tocado ? fallas.volver : null}
        >
          <input
            id="volverEl"
            type="date"
            min={hoyLima()}
            value={volver}
            onChange={(e) => setVolver(e.target.value)}
            className="campo w-48"
          />
        </Campo>
        <Campo
          etiqueta="Nota"
          htmlFor="notaContacto"
          opcional
          error={tocado ? fallas.nota : null}
          ayuda={`${nota.length}/500`}
        >
          <textarea
            id="notaContacto"
            rows={3}
            maxLength={500}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: no sabía cómo registrar la tarjeta, le expliqué por WhatsApp."
            className="campo resize-y"
          />
        </Campo>
      </div>
    </Dialogo>
  );
}
