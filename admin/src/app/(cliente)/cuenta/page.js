"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  aceptarDocumentos,
  subirFotosIdentidad,
  mensajeError,
  listarAlertas,
  marcarAlertasVistas,
} from "@/lib/cliente";
import {
  colorBanco,
  nombreBanco,
  estadoBanco,
  bancosDelCliente,
  BANCOS_PRINCIPALES,
} from "@/lib/bancos";
import { Boton, Aviso, Cargando, Casilla } from "@/components/cliente/piezas";
import SubidaFotos, { fotosCompletas } from "@/components/cliente/fotos";
import VisorImagen from "@/components/cliente/visor";
import { WHATSAPP, HORARIO } from "@/components/sitio/datos";
import { Objetos3D } from "@/components/sitio/tarjetas3d";
import { ESCENA_REGISTRO_IDENTIDAD } from "@/components/cliente/escenas";
import { useCuenta } from "@/components/cliente/contexto";
import { VISTAS } from "@/components/cliente/barra";

/**
 * Mi cuenta: lo que ve el cliente con la sesión abierta. Solo sus
 * datos, nada de la presentación de la empresa. Lee las mismas tablas
 * que la app, así que lo que se hace en una se ve en la otra.
 *
 * Arriba, una franja azul noche con lo importante (cifras y "Nueva
 * solicitud"); debajo, una pestaña por tema en vez de todo en una hoja.
 */
const ESTADO_SOLICITUD = {
  pendiente: {
    texto: "En revisión",
    chip: "bg-[#DCE6F7] text-[#1E3A8A]",
    barra: "bg-[#3B6FD8]",
  },
  aprobado: {
    texto: "Por pagar",
    chip: "bg-[#FCEFC7] text-[#6E5300]",
    barra: "bg-oro-500",
  },
  pagado: {
    texto: "Pagada",
    chip: "bg-[#D5F2E3] text-[#065F46]",
    barra: "bg-emerald-500",
  },
  rechazado: {
    texto: "Rechazada",
    chip: "bg-[#FBDADA] text-[#991B1B]",
    barra: "bg-red-500",
  },
};

const ESTADO_BANCO = {
  listo: { texto: "Listo para operar", chip: "bg-[#D5F2E3] text-[#065F46]" },
  verificando: {
    texto: "Verificando tarjeta",
    chip: "bg-[#DCE6F7] text-[#1E3A8A]",
  },
  falta_cuenta: {
    texto: "Falta tu cuenta",
    chip: "bg-[#FCEFC7] text-[#6E5300]",
  },
  falta_tarjeta: {
    texto: "Falta tu tarjeta",
    chip: "bg-[#E6EAF1] text-[#3D4A63]",
  },
};

const fecha = (f, conHora) =>
  f
    ? new Date(f).toLocaleString("es-PE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(conHora ? { hour: "numeric", minute: "2-digit" } : {}),
      })
    : "";
/** Fecha sin hora ("2026-11-02") como "lun. 2 nov.", sin correrse de día. */
const diaCorto = (iso) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};
const hoyLima = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
/** Cuándo se deposita, dicho para el cliente. */
const cuandoDeposito = (x) => {
  if (!x.fecha_deposito) return null;
  if (x.fecha_deposito <= hoyLima()) return "Hoy";
  return diaCorto(x.fecha_deposito);
};
const porcentaje = (v) =>
  Number(v)
    .toFixed(2)
    .replace(/\.?0+$/, "");
const soles = (n) =>
  `S/ ${Number(n).toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const ocultar = (n) => (n ? `•••• ${String(n).slice(-4)}` : "");

export default function CuentaPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <Cuenta />
    </Suspense>
  );
}

function Cuenta() {
  const {
    sb,
    estado,
    usuario,
    perfil,
    legales,
    setLegales,
    bloqueo,
    recienAprobada,
    recargar,
    salir,
  } = useCuenta();
  const params = useSearchParams();
  const bienvenida = params.get("bienvenida") === "1";
  const guardado = {
    tarjeta: "Tarjeta enviada a verificación. Te avisaremos cuando esté lista.",
    cuenta: "Cuenta agregada.",
    "cuenta-editada": "Cuenta actualizada.",
  }[params.get("aviso")];

  if (estado === "bloqueado")
    return (
      <Franja>
        <span className="inline-flex rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-red-300">
          Cuenta bloqueada
        </span>
        <h1 className="mt-4 font-heading text-3xl font-normal">
          No puedes operar por ahora
        </h1>
        <p className="mt-3 max-w-xl text-white/70">
          {bloqueo?.motivo
            ? `Motivo: ${bloqueo.motivo}`
            : "Escríbenos para conocer el motivo."}
        </p>
        <a
          href={`https://wa.me/${WHATSAPP}`}
          target="_blank"
          rel="noopener"
          className="mt-6 inline-flex h-12 items-center rounded-full bg-oro-500 px-6 font-bold text-marca-900 hover:bg-oro-300"
        >
          Escribir por WhatsApp
        </a>
      </Franja>
    );

  if (!estado || !perfil) return <Cargando />;

  return (
    <>
      {legales.length > 0 && (
        <AceptarLegales
          lista={legales}
          onListo={() => setLegales([])}
          onSalir={() => salir()}
        />
      )}
      {estado === "activo" ? (
        <Activo
          sb={sb}
          perfil={perfil}
          usuario={usuario}
          guardado={
            recienAprobada
              ? "¡Tu cuenta fue aprobada! Ya puedes registrar tus tarjetas y cuentas y enviar solicitudes."
              : guardado
          }
          onSalir={() => salir()}
        />
      ) : (
        <EnRevision
          sb={sb}
          estado={estado}
          perfil={perfil}
          usuario={usuario}
          bienvenida={bienvenida}
          onEnviado={recargar}
        />
      )}
    </>
  );
}

/** Franja azul noche bajo el encabezado: el saludo y lo principal. */
function Franja({ children, pie, enMarco }) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden bg-[#0B1426] text-white",
        enMarco && "rounded-3xl",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-40 -z-10 h-96 w-96 rounded-full bg-oro-500/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-24 -z-10 h-96 w-96 rounded-full bg-[#2B4C9B]/35 blur-3xl"
      />
      <div
        className={
          enMarco
            ? "px-4 pb-7 pt-8 sm:px-7"
            : "mx-auto max-w-5xl px-4 pb-8 pt-9 sm:px-5"
        }
      >
        {children}
      </div>
      {pie}
    </section>
  );
}

/* ───────── En revisión u observada ───────── */

function EnRevision({ sb, estado, perfil, usuario, bienvenida, onEnviado }) {
  const [fotos, setFotos] = useState({
    dni_frontal: null,
    dni_posterior: null,
    selfie: null,
  });
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const observado = estado === "observado";

  // Igual que la app: el sufijo de tiempo evita que la foto vieja quede
  // en caché, y la cuenta vuelve a la cola de revisión.
  async function reenviar() {
    setEnviando(true);
    setAviso(null);
    let paths = null;
    try {
      paths = await subirFotosIdentidad(usuario.id, fotos, true);
      const { error } = await sb
        .from("perfiles_cliente")
        .update({
          foto_dni_frontal: paths.dni_frontal,
          foto_dni_posterior: paths.dni_posterior,
          foto_selfie: paths.selfie,
          motivo_observacion: null,
        })
        .eq("user_id", usuario.id);
      if (error) throw error;
      const { error: e2 } = await sb
        .from("users")
        .update({ estado: "pendiente" })
        .eq("id", usuario.id);
      if (e2)
        setAviso({
          tono: "atencion",
          texto:
            "Guardamos tus documentos, pero no pudimos reabrir la revisión. Escríbenos para activarla.",
        });
      setFotos({ dni_frontal: null, dni_posterior: null, selfie: null });
      onEnviado();
    } catch (e) {
      if (paths)
        await sb.storage
          .from("kyc-documentos")
          .remove(Object.values(paths))
          .catch(() => {});
      setAviso({ tono: "error", texto: mensajeError(e) });
    } finally {
      setEnviando(false);
    }
  }

  const pasos = [
    { t: "Cuenta creada", hecho: true },
    {
      t: observado ? "Corrige tus fotos" : "Verificamos tu identidad",
      actual: true,
      alerta: observado,
    },
    { t: "Registra tarjeta y cuenta" },
    { t: "Envía tu primera solicitud" },
  ];

  return (
    <>
      <Franja>
        <div className="flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/60">Hola, {perfil.nombres}</p>
            <h1 className="mt-1 font-heading text-[1.75rem] font-normal leading-tight tracking-[-0.02em] sm:text-[2rem]">
              {observado
                ? "Necesitamos una corrección"
                : bienvenida
                  ? "¡Listo! Recibimos tus documentos."
                  : "Estamos verificando tu identidad"}
            </h1>
            {!observado && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-3 pr-4 text-sm text-white/85 ring-1 ring-white/15">
                <Latido />
                En revisión · esta página cambia sola al aprobarse
              </p>
            )}
          </div>
          <Objetos3D
            className="relative hidden h-32 w-48 shrink-0 sm:block lg:h-36 lg:w-56"
            objetos={ESCENA_REGISTRO_IDENTIDAD.objetos}
            conScroll={false}
          />
        </div>
        <ol className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {pasos.map((p, i) => (
            <li
              key={p.t}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-3 ring-1 sm:px-4",
                p.actual
                  ? p.alerta
                    ? "bg-oro-500/15 ring-oro-500/50"
                    : "bg-white/10 ring-white/25"
                  : "bg-white/[0.04] ring-white/10",
              )}
            >
              <span
                className={cn(
                  "cifras flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  p.hecho
                    ? "bg-emerald-500 text-white"
                    : p.actual
                      ? "pulso-paso bg-oro-500 text-marca-900"
                      : "bg-white/10 text-white/50",
                )}
              >
                {p.hecho ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold leading-tight",
                  p.hecho || p.actual ? "text-white" : "text-white/50",
                )}
              >
                {p.t}
              </span>
            </li>
          ))}
        </ol>
      </Franja>

      <main className="mx-auto grid max-w-5xl items-start gap-6 px-4 py-8 sm:px-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {observado ? (
          <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,27,51,0.05)] sm:p-8">
            <h2 className="font-heading text-xl">Vuelve a subir tus fotos</h2>
            {perfil.motivo_observacion && (
              <p className="mt-3 rounded-xl bg-[#FCEFC7] px-4 py-3 text-sm text-[#6E5300]">
                <strong>Motivo:</strong> {perfil.motivo_observacion}
              </p>
            )}
            <div className="mt-6">
              {aviso && (
                <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)}>
                  {aviso.texto}
                </Aviso>
              )}
              <SubidaFotos
                fotos={fotos}
                onCambio={setFotos}
                tipoDocumento={perfil.tipo_documento}
                deshabilitado={enviando}
              />
              <Boton
                tono="oro"
                className="mt-6 w-full"
                cargando={enviando}
                disabled={!fotosCompletas(fotos)}
                onClick={reenviar}
              >
                Enviar a revisión
              </Boton>
            </div>
          </section>
        ) : (
          <div className="min-w-0 space-y-6">
            <EstadoRevision perfil={perfil} onRevisar={onEnviado} />
            <MientrasTanto />
          </div>
        )}
        <MisDatos perfil={perfil} usuario={usuario} />
      </main>
    </>
  );
}

/** Punto verde que late: algo está en curso. */
function Latido() {
  return (
    <span className="relative flex h-2.5 w-2.5" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

/**
 * En qué va la verificación, como línea de tiempo. La página escucha la
 * aprobación en vivo (contexto.jsx), así que "Actualizar" es solo un
 * respaldo y va discreto.
 */
function EstadoRevision({ perfil, onRevisar }) {
  const [revisando, setRevisando] = useState(false);
  const linea = [
    {
      t: "Recibimos tus datos y tus fotos",
      d: fecha(perfil.created_at, true),
      estado: "hecho",
    },
    {
      t: "Una persona de nuestro equipo las revisa",
      d: `Normalmente en unas horas, de ${HORARIO.dias.toLowerCase()} de ${HORARIO.horas}`,
      estado: "actual",
    },
    {
      t: "Tu cuenta queda aprobada",
      d: "Esta página cambia sola. Ya podrás registrar tus tarjetas y enviar solicitudes.",
      estado: "pendiente",
    },
  ];
  return (
    <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,27,51,0.05)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-heading text-xl">Tu verificación</h2>
        <button
          type="button"
          disabled={revisando}
          onClick={async () => {
            setRevisando(true);
            try {
              await onRevisar();
            } finally {
              setRevisando(false);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-marca-700 ring-1 ring-[#DCE3EE] transition hover:bg-[#F4F7FB] disabled:opacity-60"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("h-4 w-4", revisando && "animate-spin")}
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          {revisando ? "Revisando..." : "Actualizar"}
        </button>
      </div>

      <ol className="mt-6">
        {linea.map((x, i) => (
          <li key={x.t} className="relative flex gap-4 pb-6 last:pb-0">
            {i < linea.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-0.5 rounded-full",
                  x.estado === "hecho" ? "bg-emerald-400" : "bg-[#E3E9F2]",
                )}
              />
            )}
            <span
              className={cn(
                "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                x.estado === "hecho" && "bg-emerald-500 text-white",
                x.estado === "actual" && "bg-oro-500 text-marca-900",
                x.estado === "pendiente" && "bg-[#EFF3F9] text-[#AFBCD0]",
              )}
            >
              {x.estado === "actual" && (
                <span className="absolute inset-0 animate-ping rounded-full bg-oro-500/40 motion-reduce:hidden" />
              )}
              {x.estado === "hecho" ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="m5 12 5 5L20 7" />
                </svg>
              ) : x.estado === "actual" ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="relative h-4 w-4"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              ) : (
                <span className="h-2 w-2 rounded-full bg-current" />
              )}
            </span>
            <div className="min-w-0 pt-1">
              <p
                className={cn(
                  "font-semibold",
                  x.estado === "pendiente"
                    ? "text-[#8A93A6]"
                    : "text-marca-900",
                )}
              >
                {x.t}
                {x.estado === "actual" && (
                  <span className="ml-2 inline-flex rounded-full bg-oro-100 px-2 py-0.5 align-middle text-[0.7rem] font-bold uppercase tracking-wide text-oro-700">
                    En curso
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-[#6B7690]">
                {x.d}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Qué tener listo mientras se aprueba la cuenta. */
function MientrasTanto() {
  const items = [
    {
      t: "Tu tarjeta de crédito",
      d: "A tu nombre. Registrarás el banco, los últimos 4 dígitos y una foto.",
      icono: ["M3 6h18v12H3z", "M3 10h18", "M7 15h4"],
    },
    {
      t: "Tu cuenta de ahorros",
      d: "También a tu nombre: ahí te depositamos.",
      icono: ["M3 10 12 4l9 6", "M5 10v8M9 10v8M15 10v8M19 10v8", "M3 20h18"],
    },
    {
      t: "Nuestras comisiones",
      d: "Desde 1 %, según tu tarjeta. Sabrás cuánto recibes antes de confirmar.",
      icono: [
        "M19 5 5 19",
        "M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
        "M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
      ],
      href: "/#comisiones",
    },
  ];
  return (
    <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,27,51,0.05)] sm:p-8">
      <h2 className="font-heading text-xl">Mientras tanto, ten a mano</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {items.map((x, i) => {
          const contenido = (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1426] text-oro-500">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden
                >
                  {x.icono.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </span>
              <span className="mt-3 block font-semibold text-marca-900">
                {x.t}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-[#6B7690]">
                {x.d}
              </span>
              {x.href && (
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-marca-700">
                  Ver tarifas <span aria-hidden>→</span>
                </span>
              )}
            </>
          );
          return (
            <li
              key={x.t}
              className="entra"
              style={{ "--retraso": `${i * 90}ms` }}
            >
              {x.href ? (
                <Link
                  href={x.href}
                  className="block h-full rounded-2xl bg-[#F4F7FB] p-4 ring-1 ring-[#E3E9F2] transition hover:-translate-y-0.5 hover:bg-[#EFF3F9]"
                >
                  {contenido}
                </Link>
              ) : (
                <div className="h-full rounded-2xl bg-[#F4F7FB] p-4 ring-1 ring-[#E3E9F2]">
                  {contenido}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#4F5B74]">
        ¿Tienes dudas mientras esperas?
        <a
          href={`https://wa.me/${WHATSAPP}`}
          target="_blank"
          rel="noopener"
          className="font-semibold text-marca-900 underline underline-offset-4"
        >
          Escríbenos por WhatsApp
        </a>
      </p>
    </section>
  );
}

/* ───────── Cuenta activa ───────── */

/** Qué cambió desde la carga anterior, dicho para el cliente. */
function novedadesEntre(antes, ahora) {
  if (!antes) return [];
  const out = [];
  const previas = Object.fromEntries(
    antes.tarjetas.map((t) => [t.id, t.estado]),
  );
  for (const t of ahora.tarjetas) {
    const e = previas[t.id];
    if (!e || e === t.estado) continue;
    const cual = `${nombreBanco(t.banco)} •••• ${t.ultimos_4}`;
    if (t.estado === "aprobado")
      out.push({
        tono: "exito",
        texto: `Tu tarjeta ${cual} fue verificada. Ya puedes operar con ella.`,
      });
    if (t.estado === "rechazado")
      out.push({
        tono: "error",
        texto: `Tu tarjeta ${cual} fue rechazada${t.motivo_rechazo ? `: ${t.motivo_rechazo}` : "."}`,
      });
  }
  const solPrevias = Object.fromEntries(
    antes.solicitudes.map((x) => [x.id, x.estado]),
  );
  for (const x of ahora.solicitudes) {
    const e = solPrevias[x.id];
    if (!e || e === x.estado) continue;
    if (x.estado === "aprobado")
      out.push({
        tono: "exito",
        texto: `Tu solicitud ${x.codigo} fue aprobada: estamos preparando tu depósito.`,
      });
    if (x.estado === "pagado")
      out.push({
        tono: "exito",
        texto: `¡Te depositamos la solicitud ${x.codigo}! Revisa tu cuenta.`,
      });
    if (x.estado === "rechazado")
      out.push({
        tono: "error",
        texto: `Tu solicitud ${x.codigo} fue rechazada${x.motivo_rechazo ? `: ${x.motivo_rechazo}` : "."}`,
      });
  }
  return out;
}

function Activo({ sb, perfil, usuario, guardado, onSalir }) {
  const {
    vista: pestana,
    irA,
    setEnCurso,
    setNoticiasNuevas,
    setAvisos,
    cache,
  } = useCuenta();
  // Lo último cargado se muestra al instante y se actualiza detrás.
  const [datos, setDatos] = useState(() => cache.current);
  const [novedades, setNovedades] = useState([]);
  const previo = useRef(cache.current);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [s, t, c, com, alertas, avisos, noticias] = await Promise.all([
        sb
          .from("solicitudes")
          .select(
            "*, tarjetas(banco, ultimos_4)",
          )
          .eq("cliente_id", perfil.id)
          .order("created_at", { ascending: false })
          .limit(60),
        sb
          .from("tarjetas")
          .select("id, banco, ultimos_4, estado, motivo_rechazo, created_at")
          .eq("cliente_id", perfil.id)
          .eq("activa", true)
          .order("created_at", { ascending: false }),
        sb
          .from("cuentas_bancarias")
          .select("id, banco, tipo, numero_cuenta")
          .eq("cliente_id", perfil.id)
          .eq("activa", true)
          .order("banco"),
        sb.rpc("mis_comisiones"),
        listarAlertas(),
        sb
          .from("notificaciones")
          .select("id, tipo, titulo, cuerpo, leida, created_at")
          .eq("user_id", usuario.id)
          .order("created_at", { ascending: false })
          .limit(50),
        sb
          .from("alertas_sistema")
          .select(
            "id, titulo, mensaje, tipo, imagenes, fecha_inicio, fecha_fin",
          )
          .eq("categoria", "noticia")
          .order("fecha_inicio", { ascending: false })
          .limit(30),
      ]);
      const fallo = s.error || t.error || c.error || com.error;
      if (fallo) throw fallo;
      const nuevos = {
        solicitudes: s.data || [],
        tarjetas: t.data || [],
        cuentas: c.data || [],
        comisiones: com.data || { bancos: [] },
        alertas,
        avisos: avisos.data || [],
        noticias: noticias.data || [],
      };
      const cambios = novedadesEntre(previo.current, nuevos);
      if (cambios.length) setNovedades((n) => [...cambios, ...n].slice(0, 4));
      previo.current = nuevos;
      cache.current = nuevos;
      setDatos(nuevos);
      setAvisos(nuevos.avisos);
      setError("");
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [sb, perfil.id, usuario.id, cache, setAvisos]);

  // En vivo: lo que el equipo decide en el panel (verificar una tarjeta,
  // aprobar o pagar una solicitud, publicar una alerta) llega solo. Como
  // respaldo, se vuelve a pedir cada minuto y al volver a la pestaña.
  useEffect(() => {
    cargar();
    const canal = sb
      .channel(`mi-cuenta-${perfil.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tarjetas",
          filter: `cliente_id=eq.${perfil.id}`,
        },
        () => cargar(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "solicitudes",
          filter: `cliente_id=eq.${perfil.id}`,
        },
        () => cargar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alertas_sistema" },
        () => cargar(),
      )
      .subscribe();
    const reloj = setInterval(cargar, 60000);
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      sb.removeChannel(canal);
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [sb, perfil.id, cargar]);

  const solicitudes = useMemo(() => datos?.solicitudes || [], [datos]);
  const tarjetas = useMemo(() => datos?.tarjetas || [], [datos]);
  const cuentas = useMemo(() => datos?.cuentas || [], [datos]);
  const enCurso = solicitudes.filter(
    (x) => x.estado === "pendiente" || x.estado === "aprobado",
  ).length;
  const pagadas = solicitudes.filter((x) => x.estado === "pagado").length;
  useEffect(() => setEnCurso(enCurso), [enCurso, setEnCurso]);
  const nuevasNoticias = (datos?.noticias || []).filter(esNueva).length;
  useEffect(
    () => setNoticiasNuevas(nuevasNoticias),
    [nuevasNoticias, setNoticiasNuevas],
  );
  const listos = bancosDelCliente(tarjetas, cuentas).filter(
    (b) => estadoBanco(b, tarjetas, cuentas) === "listo",
  ).length;

  return (
    <>
      {pestana === "resumen" && (
        <Franja enMarco>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-white/60">Hola,</p>
              <h1 className="font-heading text-[2rem] font-normal leading-tight tracking-[-0.02em]">
                {perfil.nombres} {perfil.apellidos}
              </h1>
            </div>
            <div className="flex items-center gap-3 self-start md:self-auto">
              <Link
                href="/cuenta/solicitud-nueva"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-oro-500 px-6 font-bold text-marca-900 shadow-[0_12px_30px_-10px_rgba(232,184,0,0.7)] transition hover:bg-oro-300"
              >
                <span className="text-lg leading-none">+</span> Nueva solicitud
              </Link>
            </div>
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-3">
            {[
              ["En curso", enCurso, "text-oro-500"],
              ["Pagadas", pagadas, "text-emerald-400"],
              ["Bancos listos", listos, "text-[#8FB2FF]"],
            ].map(([k, v, color]) => (
              <div
                key={k}
                className="rounded-2xl bg-white/[0.06] px-4 py-3.5 ring-1 ring-white/10"
              >
                <dt className="text-chico text-white/60">{k}</dt>
                <dd
                  className={cn("cifras mt-0.5 font-heading text-3xl", color)}
                >
                  {datos ? v : "–"}
                </dd>
              </div>
            ))}
          </dl>
        </Franja>
      )}

      <main className={pestana === "resumen" ? "py-6" : "pb-6"}>
        {pestana !== "resumen" && (
          <h1 className="mb-5 font-heading text-2xl font-normal tracking-[-0.02em] text-marca-900 sm:text-[1.75rem]">
            {VISTAS.find((v) => v.k === pestana)?.t}
          </h1>
        )}
        {guardado && <Aviso tono="exito">{guardado}</Aviso>}
        {novedades.map((n, i) => (
          <Aviso
            key={n.texto}
            tono={n.tono}
            onCerrar={() => setNovedades((l) => l.filter((_, k) => k !== i))}
          >
            {n.texto}
          </Aviso>
        ))}
        {pestana === "resumen" && datos?.alertas?.length > 0 && (
          <AlertasServicio alertas={datos.alertas} userId={usuario.id} />
        )}
        {error && (
          <Aviso>
            {error}{" "}
            <button onClick={cargar} className="font-semibold underline">
              Reintentar
            </button>
          </Aviso>
        )}
        {!datos ? (
          !error && <Cargando />
        ) : pestana === "resumen" ? (
          <Resumen
            solicitudes={solicitudes}
            tarjetas={tarjetas}
            cuentas={cuentas}
            comisiones={datos.comisiones}
            noticias={datos.noticias || []}
            sb={sb}
            irA={irA}
          />
        ) : pestana === "solicitudes" ? (
          <Solicitudes sb={sb} solicitudes={solicitudes} />
        ) : pestana === "bancos" ? (
          <TarjetasYCuentas tarjetas={tarjetas} cuentas={cuentas} />
        ) : pestana === "noticias" ? (
          <Noticias sb={sb} noticias={datos.noticias || []} />
        ) : (
          <Perfil
            sb={sb}
            perfil={perfil}
            usuario={usuario}
            comisiones={datos.comisiones}
            onSalir={onSalir}
          />
        )}
      </main>
    </>
  );
}

/* ── Piezas comunes ── */

function Panel({ titulo, accion, children, className }) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(15,27,51,0.05)] sm:p-6",
        className,
      )}
    >
      {(titulo || accion) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg">{titulo}</h2>
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

function BotonChico({ href, onClick, children }) {
  const clase =
    "shrink-0 whitespace-nowrap rounded-full bg-[#E6ECF5] px-3.5 py-1.5 text-chico font-semibold text-marca-900 transition hover:bg-[#D8E0EC]";
  return href ? (
    <Link href={href} className={clase}>
      {children}
    </Link>
  ) : (
    <button onClick={onClick} className={clase}>
      {children}
    </button>
  );
}

function SiglaBanco({ banco, grande }) {
  const c = colorBanco(banco);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-bold tracking-wide",
        grande ? "h-12 w-12 text-sm" : "h-10 w-10 text-[0.7rem]",
      )}
      style={{ background: c.fondo, color: c.texto }}
      aria-hidden
    >
      {c.sigla}
    </span>
  );
}

function Chip({ clase, children }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        clase,
      )}
    >
      {children}
    </span>
  );
}

function Vacio({ titulo, texto, accion }) {
  return (
    <div className="rounded-2xl bg-[#E9EEF6] px-6 py-10 text-center">
      <p className="font-semibold">{titulo}</p>
      {texto && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-[#4F5B74]">{texto}</p>
      )}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

/** Una fila de solicitud. Con `detalle`, se abre para ver todo. */
function FilaSolicitud({ x, abierta, onAbrir, children }) {
  const e = ESTADO_SOLICITUD[x.estado] || {
    texto: x.estado,
    chip: "bg-[#E6EAF1]",
    barra: "bg-[#8A93A6]",
  };
  const banco = x.tarjetas?.banco || x.banco;
  return (
    <li className="overflow-hidden rounded-2xl bg-[#F4F7FB] ring-1 ring-[#E3E9F2]">
      <button
        onClick={onAbrir}
        aria-expanded={onAbrir ? abierta : undefined}
        disabled={!onAbrir}
        className="flex w-full items-center gap-3 py-3 pl-0 pr-4 text-left"
      >
        <span
          className={cn("h-10 w-1 shrink-0 rounded-r-full", e.barra)}
          aria-hidden
        />
        <SiglaBanco banco={banco} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {nombreBanco(banco)}{" "}
            {x.tarjetas?.ultimos_4 && (
              <span className="cifras whitespace-nowrap font-normal text-[#6B7690]">
                •••• {x.tarjetas.ultimos_4}
              </span>
            )}
          </span>
          <span className="cifras block truncate text-chico text-[#6B7690]">
            {x.codigo} · {fecha(x.created_at)}
          </span>
          {x.modalidad === "siguiente" &&
            (x.estado === "pendiente" || x.estado === "aprobado") && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#EEF3FD] px-2 py-0.5 text-[0.7rem] font-semibold text-[#1E3A8A]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                  aria-hidden
                >
                  <path d="M4 6h16v14H4z" />
                  <path d="M4 10h16M9 3v4M15 3v4" />
                </svg>
                Depósito {cuandoDeposito(x)?.toLowerCase()}
              </span>
            )}
        </span>
        <Chip clase={e.chip}>{e.texto}</Chip>
        {onAbrir && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={cn(
              "h-4 w-4 shrink-0 text-[#8A93A6] transition",
              abierta && "rotate-180",
            )}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>
      {abierta && children}
    </li>
  );
}

/* ── Alertas del servicio ── */

const TONO_ALERTA = {
  critico: {
    etiqueta: "Urgente",
    icono: [
      "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
      "M12 9v4",
      "M12 17h.01",
    ],
    circulo: "bg-red-600 text-white",
    chip: "bg-red-50 text-red-700 ring-red-200",
    fila: "bg-[#FFF5F5]",
  },
  advertencia: {
    etiqueta: "Atención",
    icono: ["M12 7v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
    circulo: "bg-oro-500 text-marca-900",
    chip: "bg-oro-50 text-oro-700 ring-oro-200",
    fila: "bg-white",
  },
  info: {
    etiqueta: "Aviso",
    icono: ["M12 16v-4", "M12 8h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
    circulo: "bg-[#3B6FD8] text-white",
    chip: "bg-[#EEF3FD] text-[#1E3A8A] ring-[#C9D7F5]",
    fila: "bg-white",
  },
};
const ORDEN_ALERTA = { critico: 0, advertencia: 1, info: 2 };

/** Vigente ahora: ya empezó y no terminó. */
const vigente = (a) => {
  const ahora = Date.now();
  return (
    (!a.fecha_inicio || new Date(a.fecha_inicio).getTime() <= ahora) &&
    (!a.fecha_fin || new Date(a.fecha_fin).getTime() > ahora)
  );
};

/**
 * Estado del servicio ("el BCP no procesa hoy"), solo en el Resumen: una
 * tarjeta con las alertas vigentes, de la más urgente a la menos. Las
 * nuevas se ven completas; "Entendido" las marca como vistas en la base
 * (así la app tampoco las vuelve a resaltar) y quedan plegadas, a mano.
 */
function AlertasServicio({ alertas, userId }) {
  const [vistas, setVistas] = useState(
    () => new Set(alertas.filter((a) => a.vista).map((a) => a.id)),
  );
  const [verVistas, setVerVistas] = useState(false);
  const lista = alertas
    .filter(vigente)
    .sort((a, b) => (ORDEN_ALERTA[a.tipo] ?? 3) - (ORDEN_ALERTA[b.tipo] ?? 3));
  const nuevas = lista.filter((a) => !vistas.has(a.id));
  const leidas = lista.filter((a) => vistas.has(a.id));
  if (lista.length === 0) return null;

  function entendido() {
    const ids = nuevas.map((a) => a.id);
    setVistas((v) => new Set([...v, ...ids]));
    marcarAlertasVistas(userId, ids);
  }

  const urgente = lista.some((a) => a.tipo === "critico");

  // Todo visto: una sola línea que se despliega.
  if (nuevas.length === 0)
    return (
      <section aria-label="Estado del servicio" className="mb-6">
        <button
          onClick={() => setVerVistas((v) => !v)}
          aria-expanded={verVistas}
          className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(15,27,51,0.05)] transition hover:bg-[#FAFBFD]"
        >
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              urgente ? "bg-red-600" : "bg-oro-500",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-marca-900">
            {lista.length === 1
              ? `Estado del servicio: ${lista[0].titulo}`
              : `Estado del servicio: ${lista.length} avisos activos`}
          </span>
          <span className="shrink-0 text-chico font-semibold text-marca-700">
            {verVistas ? "Ocultar" : "Ver"}
          </span>
        </button>
        {verVistas && (
          <ul className="mt-2 divide-y divide-[#EEF2F7] overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,27,51,0.05)]">
            {lista.map((a) => (
              <FilaAlerta key={a.id} a={a} />
            ))}
          </ul>
        )}
      </section>
    );

  return (
    <section
      aria-label="Estado del servicio"
      className="mb-6 overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,27,51,0.05),0_20px_40px_-30px_rgba(15,27,51,0.35)]"
    >
      <header className="flex items-center gap-3 border-b border-[#EEF2F7] px-5 py-4">
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden",
              urgente ? "bg-red-500" : "bg-oro-500",
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-2.5 w-2.5 rounded-full",
              urgente ? "bg-red-600" : "bg-oro-500",
            )}
          />
        </span>
        <h2 className="min-w-0 truncate font-heading text-lg">
          Estado del servicio
        </h2>
        <span className="cifras hidden shrink-0 rounded-full bg-[#EFF3F9] px-2 py-0.5 text-xs font-bold text-[#3D4A63] sm:inline">
          {nuevas.length} {nuevas.length === 1 ? "nuevo" : "nuevos"}
        </span>
        <button
          onClick={entendido}
          className="ml-auto shrink-0 rounded-full bg-marca-900 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-marca-700 sm:px-4"
        >
          Entendido
        </button>
      </header>
      <ul className="divide-y divide-[#EEF2F7]" role="alert">
        {nuevas.map((a) => (
          <FilaAlerta key={a.id} a={a} />
        ))}
      </ul>
      {leidas.length > 0 && (
        <div className="border-t border-[#EEF2F7]">
          <button
            onClick={() => setVerVistas((v) => !v)}
            aria-expanded={verVistas}
            className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-[#4F5B74] transition hover:bg-[#FAFBFD]"
          >
            {leidas.length === 1
              ? "1 aviso que ya viste"
              : `${leidas.length} avisos que ya viste`}
            <span className="ml-auto text-chico text-marca-700">
              {verVistas ? "Ocultar" : "Ver"}
            </span>
          </button>
          {verVistas && (
            <ul className="divide-y divide-[#EEF2F7] border-t border-[#EEF2F7]">
              {leidas.map((a) => (
                <FilaAlerta key={a.id} a={a} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function FilaAlerta({ a }) {
  const t = TONO_ALERTA[a.tipo] || TONO_ALERTA.info;
  return (
    <li className={cn("flex gap-4 px-5 py-4", t.fila)}>
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          t.circulo,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          {t.icono.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-semibold text-marca-900">{a.titulo}</p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide ring-1",
              t.chip,
            )}
          >
            {t.etiqueta}
          </span>
        </div>
        {a.mensaje && (
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[#4F5B74]">
            {a.mensaje}
          </p>
        )}
        <p className="mt-1.5 text-chico text-[#8A93A6]">
          {a.fecha_fin
            ? `Hasta ${fecha(a.fecha_fin, true)}`
            : `Desde ${fecha(a.fecha_inicio, true)}`}
        </p>
      </div>
    </li>
  );
}

/* ── Cupón vigente ── */

/** Banda con el cupón del cliente y los días que le quedan. */
function CuponVigente({ cupon }) {
  if (!cupon) return null;
  const quedan = cupon.hasta
    ? Math.max(
        0,
        Math.ceil((new Date(cupon.hasta).getTime() - Date.now()) / 86400000),
      )
    : null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#0F1B33] px-4 py-3 text-white">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-oro-500 text-marca-900"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6z" />
          <path d="M14.5 9.5l-5 5M9.5 9.5h.01M14.5 14.5h.01" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-chico text-white/60">
          Tienes un cupón con tarifa preferencial
        </span>
        <span className="block font-semibold">{cupon.nombre}</span>
      </span>
      {quedan !== null && (
        <span className="text-right">
          <span className="cifras block font-heading text-2xl leading-none text-oro-500">
            {quedan}
          </span>
          <span className="block text-chico text-white/60">
            día{quedan === 1 ? "" : "s"} · vence {fecha(cupon.hasta)}
          </span>
        </span>
      )}
    </div>
  );
}

/* ── Noticias ── */

/** Sobretítulo de cada tipo de noticia, como en la app. */
const TIPOS_NOTICIA = {
  promocion: { etiqueta: "Promoción", clase: "bg-oro-500 text-marca-900" },
  info: { etiqueta: "Aviso", clase: "bg-[#DCE6F7] text-[#1E3A8A]" },
  advertencia: { etiqueta: "Importante", clase: "bg-[#FCEFC7] text-[#6E5300]" },
  critico: { etiqueta: "Urgente", clase: "bg-red-600 text-white" },
};
const tipoNoticia = (n) => TIPOS_NOTICIA[n?.tipo] || TIPOS_NOTICIA.info;
// Publicada en los últimos tres días: lleva la marca "Nueva".
const esNueva = (n) =>
  n?.fecha_inicio &&
  Date.now() - new Date(n.fecha_inicio).getTime() < 3 * 86400000;
function quedanTexto(fin) {
  if (!fin) return null;
  const q = Math.ceil((new Date(fin).getTime() - Date.now()) / 86400000);
  if (q <= 0) return "Último día";
  return q === 1 ? "Queda 1 día" : `Quedan ${q} días`;
}
/** Las imágenes viven en un bucket público: la URL se arma directo. */
const imagenesDe = (sb, n) =>
  (n?.imagenes || [])
    .map((p) =>
      p.includes("://")
        ? p
        : sb.storage.from("noticias-fotos").getPublicUrl(p).data.publicUrl,
    )
    .filter(Boolean);

function ChipsNoticia({ n }) {
  const t = tipoNoticia(n);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Chip clase={t.clase}>{t.etiqueta}</Chip>
      {esNueva(n) && <Chip clase="bg-emerald-500 text-white">Nueva</Chip>}
    </span>
  );
}

function FechaNoticia({ n, className }) {
  const quedan = quedanTexto(n.fecha_fin);
  return (
    <span className={cn("text-chico", className)}>
      {fecha(n.fecha_inicio)}
      {quedan && ` · ${quedan}`}
    </span>
  );
}

/**
 * Afiche de una noticia, completo y sin recortes. Los afiches suelen ser
 * verticales (1080×1350): se muestran enteros sobre un fondo hecho con la
 * misma imagen desenfocada, así el marco nunca queda vacío.
 */
function Afiche({ src, alt = "", className, zoom }) {
  return (
    <span
      className={cn("relative block overflow-hidden bg-[#0B1426]", className)}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className={cn(
              "relative h-full w-full object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition duration-500",
              zoom && "group-hover:scale-[1.03]",
            )}
          />
        </>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-white/30">
          Sin imagen
        </span>
      )}
    </span>
  );
}

/** Portada (la más reciente) y las demás en tarjetas, como en la app. */
function Noticias({ sb, noticias }) {
  const [abierta, setAbierta] = useState(null);
  const noticia = noticias.find((n) => n.id === abierta);
  if (!noticias.length)
    return (
      <Vacio
        titulo="Sin noticias por ahora"
        texto="Aquí verás promociones, feriados y novedades del servicio."
      />
    );
  const [portada, ...resto] = noticias;

  return (
    <div className="space-y-5">
      <button
        onClick={() => setAbierta(portada.id)}
        className="group block w-full overflow-hidden rounded-3xl bg-white text-left shadow-[0_1px_2px_rgba(15,27,51,0.05)] ring-1 ring-transparent transition hover:ring-[#C9D6EC]"
      >
        <div className="grid md:grid-cols-[minmax(0,360px)_1fr]">
          <Afiche
            src={imagenesDe(sb, portada)[0]}
            className="aspect-[16/11] md:aspect-[4/5]"
            zoom
          />
          <div className="flex flex-col gap-3 p-6 md:p-8">
            <ChipsNoticia n={portada} />
            <h2 className="font-heading text-2xl leading-tight md:text-[1.7rem]">
              {portada.titulo}
            </h2>
            {portada.mensaje && (
              <p className="line-clamp-5 whitespace-pre-line leading-relaxed text-[#4F5B74]">
                {portada.mensaje}
              </p>
            )}
            <span className="mt-auto flex items-center justify-between gap-3 pt-2">
              <FechaNoticia n={portada} className="text-[#8A93A6]" />
              <span className="rounded-full bg-[#0B1426] px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-marca-700">
                Ver noticia
              </span>
            </span>
          </div>
        </div>
      </button>

      {resto.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {resto.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => setAbierta(n.id)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-3xl bg-white text-left shadow-[0_1px_2px_rgba(15,27,51,0.05)] ring-1 ring-transparent transition hover:ring-[#C9D6EC]"
              >
                <Afiche
                  src={imagenesDe(sb, n)[0]}
                  className="aspect-[16/11]"
                  zoom
                />
                <span className="flex flex-1 flex-col gap-2 p-4">
                  <ChipsNoticia n={n} />
                  <span className="font-semibold leading-snug">{n.titulo}</span>
                  {n.mensaje && (
                    <span className="line-clamp-2 text-sm text-[#4F5B74]">
                      {n.mensaje}
                    </span>
                  )}
                  <FechaNoticia n={n} className="mt-auto pt-1 text-[#8A93A6]" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {noticia && (
        <DetalleNoticia
          sb={sb}
          noticia={noticia}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}

/**
 * Una noticia abierta. En la computadora, el afiche completo a la
 * izquierda y el texto a la derecha; en el celular, el afiche arriba y
 * el texto debajo. Varias imágenes se pasan con flechas, no se apilan.
 */
function DetalleNoticia({ sb, noticia, onCerrar }) {
  const imagenes = imagenesDe(sb, noticia);
  const [i, setI] = useState(0);
  const total = imagenes.length;
  const mover = useCallback(
    (d) => setI((x) => (x + d + total) % total),
    [total],
  );

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === "Escape") onCerrar();
      if (total > 1 && e.key === "ArrowRight") mover(1);
      if (total > 1 && e.key === "ArrowLeft") mover(-1);
    };
    window.addEventListener("keydown", tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = previo;
    };
  }, [onCerrar, mover, total]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0B1426]/75 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCerrar}
    >
      <article
        role="dialog"
        aria-modal="true"
        aria-label={noticia.titulo}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl md:flex-row",
          total ? "max-w-5xl" : "max-w-xl",
        )}
      >
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-marca-900 shadow-md backdrop-blur transition hover:bg-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {total > 0 && (
          <div className="relative shrink-0 md:w-[54%]">
            <a
              href={imagenes[i]}
              target="_blank"
              rel="noopener"
              title="Ver en tamaño completo"
              className="block"
            >
              <Afiche
                src={imagenes[i]}
                alt={`${noticia.titulo}${total > 1 ? ` (imagen ${i + 1} de ${total})` : ""}`}
                className="h-[42dvh] md:h-[min(86dvh,760px)]"
              />
            </a>
            {total > 1 && (
              <>
                {[
                  [-1, "left-3", "Imagen anterior", "m15 18-6-6 6-6"],
                  [1, "right-3", "Imagen siguiente", "m9 18 6-6-6-6"],
                ].map(([d, lado, etiqueta, ruta]) => (
                  <button
                    key={d}
                    onClick={() => mover(d)}
                    aria-label={etiqueta}
                    className={cn(
                      "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-marca-900 shadow-md transition hover:bg-white",
                      lado,
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                      aria-hidden
                    >
                      <path d={ruta} />
                    </svg>
                  </button>
                ))}
                <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5 backdrop-blur">
                  {imagenes.map((u, k) => (
                    <button
                      key={u}
                      onClick={() => setI(k)}
                      aria-label={`Ver imagen ${k + 1}`}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        k === i
                          ? "w-5 bg-white"
                          : "w-2 bg-white/50 hover:bg-white/80",
                      )}
                    />
                  ))}
                </span>
              </>
            )}
          </div>
        )}

        <div className="scroll-fino flex min-h-0 flex-1 flex-col overflow-y-auto p-6 sm:p-8">
          <ChipsNoticia n={noticia} />
          <h2 className="mt-3 pr-10 font-heading text-2xl leading-tight md:text-[1.75rem]">
            {noticia.titulo}
          </h2>
          <FechaNoticia n={noticia} className="mt-2 text-[#8A93A6]" />
          {noticia.mensaje && (
            <p className="mt-5 whitespace-pre-line border-t border-[#EEF2F7] pt-5 leading-relaxed text-[#2E3A52]">
              {noticia.mensaje}
            </p>
          )}
          <div className="mt-auto flex flex-wrap gap-2 pt-8">
            <a
              href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola, tengo una consulta sobre: ${noticia.titulo}`)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-11 items-center rounded-full bg-oro-500 px-5 text-sm font-bold text-marca-900 transition hover:bg-oro-300"
            >
              Consultar por WhatsApp
            </a>
            <button
              onClick={onCerrar}
              className="inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold text-marca-900 ring-1 ring-[#DCE3EE] transition hover:bg-[#F4F7FB]"
            >
              Cerrar
            </button>
          </div>
        </div>
      </article>
    </div>,
    document.body,
  );
}

/** En el Resumen: las tres últimas, con acceso a todas. */
function NovedadesResumen({ sb, noticias, irA }) {
  return (
    <Panel
      titulo="Novedades"
      accion={
        <BotonChico onClick={() => irA("noticias")}>Ver todas</BotonChico>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-3">
        {noticias.slice(0, 3).map((n) => {
          const img = imagenesDe(sb, n)[0];
          return (
            <li key={n.id}>
              <button
                onClick={() => irA("noticias")}
                className="flex w-full items-center gap-3 rounded-2xl bg-[#F4F7FB] p-2.5 text-left ring-1 ring-[#E3E9F2] transition hover:bg-[#EEF2F8]"
              >
                <span className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-[#0B1426]">
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">
                    {n.titulo}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-chico text-[#8A93A6]">
                    {esNueva(n) && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                        aria-label="Nueva"
                      />
                    )}
                    {tipoNoticia(n).etiqueta} · {fecha(n.fecha_inicio)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── Resumen ── */

/**
 * Para quien aún no opera: los pasos que le faltan y el botón del
 * siguiente, en un solo lugar. Desaparece con su primera solicitud.
 */
function PrimerosPasos({ tarjetas, cuentas }) {
  const aprobada = tarjetas.some((t) => t.estado === "aprobado");
  const enRevision = tarjetas.some((t) => t.estado === "pendiente");
  const lista = bancosDelCliente(tarjetas, cuentas).some(
    (b) => estadoBanco(b, tarjetas, cuentas) === "listo",
  );
  const bancoTarjeta = tarjetas.find((t) => t.estado === "aprobado")?.banco;
  const pasos = [
    { t: "Cuenta verificada", hecho: true },
    {
      t: "Tarjeta verificada",
      hecho: aprobada,
      detalle: aprobada
        ? null
        : enRevision
          ? "La está revisando nuestro equipo. Te avisamos."
          : "Registra tu tarjeta de crédito a tu nombre.",
      href: aprobada || enRevision ? null : "/cuenta/tarjeta-nueva",
      boton: "Agregar tarjeta",
    },
    {
      t: "Cuenta de ahorros",
      hecho: lista,
      detalle: lista ? null : "La cuenta a tu nombre donde te depositamos.",
      href:
        lista || !aprobada
          ? null
          : `/cuenta/cuenta-nueva?tipo=ahorros${BANCOS_PRINCIPALES.includes(bancoTarjeta) ? `&banco=${bancoTarjeta}` : ""}`,
      boton: "Agregar cuenta",
    },
    {
      t: "Primera solicitud",
      hecho: false,
      detalle: lista ? "Paga con tu tarjeta y adjunta el comprobante." : null,
      href: lista ? "/cuenta/solicitud-nueva" : null,
      boton: "Nueva solicitud",
    },
  ];
  const hechos = pasos.filter((p) => p.hecho).length;
  const siguiente = pasos.find((p) => !p.hecho);

  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-[#0B1426] p-5 text-white sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-oro-500/20 blur-3xl"
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-chico font-semibold uppercase tracking-[0.14em] text-oro-500">
            Empieza a operar
          </p>
          <h2 className="mt-1 font-heading text-xl sm:text-2xl">
            {siguiente?.t === "Primera solicitud"
              ? "Todo listo: envía tu primera solicitud"
              : `Te falta: ${siguiente?.t.toLowerCase()}`}
          </h2>
        </div>
        <p className="cifras text-sm text-white/60">
          {hechos} de {pasos.length} pasos
        </p>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-oro-500 transition-[width] duration-700"
          style={{ width: `${(hechos / pasos.length) * 100}%` }}
        />
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-4">
        {pasos.map((p, i) => {
          const actual = p === siguiente;
          return (
            <li
              key={p.t}
              className={cn(
                "rounded-2xl p-3 ring-1",
                actual ? "bg-white/10 ring-oro-500/50" : "bg-white/[0.04] ring-white/10",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "cifras flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    p.hecho
                      ? "bg-emerald-500 text-white"
                      : actual
                        ? "bg-oro-500 text-marca-900"
                        : "bg-white/10 text-white/50",
                  )}
                >
                  {p.hecho ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    p.hecho || actual ? "text-white" : "text-white/50",
                  )}
                >
                  {p.t}
                </span>
              </span>
              {actual && p.detalle && (
                <span className="mt-2 block text-chico leading-snug text-white/70">
                  {p.detalle}
                </span>
              )}
              {actual && p.href && (
                <Link
                  href={p.href}
                  className="mt-3 inline-flex h-9 items-center rounded-full bg-oro-500 px-4 text-sm font-bold text-marca-900 transition hover:bg-oro-300"
                >
                  {p.boton}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Resumen({
  solicitudes,
  tarjetas,
  cuentas,
  comisiones,
  noticias,
  sb,
  irA,
}) {
  const bancos = bancosDelCliente(tarjetas, cuentas);
  const rechazadas = tarjetas.filter((t) => t.estado === "rechazado");
  const ultimas = solicitudes.slice(0, 4);
  const pct = Object.fromEntries(
    (comisiones.bancos || []).map((b) => [b.banco, b]),
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
      {solicitudes.length === 0 && (
        <div className="lg:col-span-2">
          <PrimerosPasos tarjetas={tarjetas} cuentas={cuentas} />
        </div>
      )}
      {comisiones.cupon && (
        <div className="lg:col-span-2">
          <CuponVigente cupon={comisiones.cupon} />
        </div>
      )}
      <Panel
        titulo="Mis bancos"
        accion={
          <BotonChico onClick={() => irA("bancos")}>Ver detalle</BotonChico>
        }
      >
        {bancos.length === 0 ? (
          <Vacio
            titulo="Empieza registrando tu tarjeta"
            texto="Y la cuenta de ahorros donde te depositamos. Una persona del equipo verifica la tarjeta antes de que puedas operar."
            accion={
              <Link
                href="/cuenta/tarjeta-nueva"
                className="inline-flex h-11 items-center rounded-full bg-marca-900 px-6 font-semibold text-white hover:bg-marca-700"
              >
                Agregar tarjeta
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {bancos.map((b) => {
              const st = estadoBanco(b, tarjetas, cuentas);
              const e = ESTADO_BANCO[st];
              const vivas = tarjetas.filter(
                (t) => t.banco === b && t.estado !== "rechazado",
              );
              return (
                <li
                  key={b}
                  className="flex items-center gap-3 rounded-2xl bg-[#F4F7FB] p-3 ring-1 ring-[#E3E9F2]"
                >
                  <SiglaBanco banco={b} grande />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{nombreBanco(b)}</p>
                    <p className="cifras text-chico text-[#6B7690]">
                      {vivas.length
                        ? vivas.map((t) => `•••• ${t.ultimos_4}`).join("  ")
                        : "Sin tarjeta"}
                      {pct[b] &&
                        ` · ${porcentaje(pct[b].porcentaje)}% comisión${pct[b].porcentaje_hoy != null ? ` (${porcentaje(pct[b].porcentaje_hoy)}% para hoy)` : ""}${pct[b].minimo ? ` · mín. ${soles(pct[b].minimo)}` : ""}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Chip clase={e.chip}>{e.texto}</Chip>
                    {st === "falta_cuenta" && (
                      <Link
                        href={`/cuenta/cuenta-nueva?tipo=ahorros${BANCOS_PRINCIPALES.includes(b) ? `&banco=${b}` : ""}`}
                        className="text-chico font-semibold text-marca-700 underline underline-offset-2"
                      >
                        Agregar cuenta
                      </Link>
                    )}
                    {st === "falta_tarjeta" && (
                      <Link
                        href={`/cuenta/tarjeta-nueva?banco=${b}`}
                        className="text-chico font-semibold text-marca-700 underline underline-offset-2"
                      >
                        Agregar tarjeta
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {rechazadas.length > 0 && (
          <div className="mt-4 rounded-2xl bg-[#FBDADA]/60 p-4 text-sm text-[#7F1D1D]">
            <p className="font-semibold">Requiere tu atención</p>
            <ul className="mt-1 space-y-1">
              {rechazadas.map((t) => (
                <li key={t.id}>
                  Tarjeta {nombreBanco(t.banco)} •••• {t.ultimos_4} rechazada
                  {t.motivo_rechazo ? `: ${t.motivo_rechazo}` : "."}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel
        titulo="Últimas solicitudes"
        accion={
          solicitudes.length > 0 && (
            <BotonChico onClick={() => irA("solicitudes")}>
              Ver todas
            </BotonChico>
          )
        }
      >
        {ultimas.length === 0 ? (
          <Vacio
            titulo="Aún no tienes solicitudes"
            texto="Cuando envíes una, aquí verás en qué va."
          />
        ) : (
          <ul className="space-y-2">
            {ultimas.map((x) => (
              <FilaSolicitud key={x.id} x={x} />
            ))}
          </ul>
        )}
      </Panel>
      {noticias.length > 0 && (
        <div className="lg:col-span-2">
          <NovedadesResumen sb={sb} noticias={noticias} irA={irA} />
        </div>
      )}
    </div>
  );
}

/* ── Solicitudes ── */

const FILTROS = [
  { k: "todas", t: "Todas" },
  { k: "pendiente", t: "En revisión" },
  { k: "aprobado", t: "Por pagar" },
  { k: "pagado", t: "Pagadas" },
  { k: "rechazado", t: "Rechazadas" },
];

function Solicitudes({ sb, solicitudes }) {
  const [filtro, setFiltro] = useState("todas");
  const [abierta, setAbierta] = useState(null);
  const lista =
    filtro === "todas"
      ? solicitudes
      : solicitudes.filter((x) => x.estado === filtro);
  const cuenta = (k) =>
    k === "todas"
      ? solicitudes.length
      : solicitudes.filter((x) => x.estado === k).length;

  return (
    <Panel>
      <div
        className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Filtrar solicitudes"
      >
        {FILTROS.map((f) => (
          <button
            key={f.k}
            role="tab"
            aria-selected={filtro === f.k}
            onClick={() => setFiltro(f.k)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition",
              filtro === f.k
                ? "bg-marca-900 text-white"
                : "bg-[#E6ECF5] text-[#3D4A63] hover:bg-[#D8E0EC]",
            )}
          >
            {f.t}{" "}
            <span
              className={cn(
                "cifras ml-1",
                filtro === f.k ? "text-oro-500" : "text-[#8A93A6]",
              )}
            >
              {cuenta(f.k)}
            </span>
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <Vacio
          titulo={
            filtro === "todas"
              ? "Aún no tienes solicitudes"
              : "No hay solicitudes en este estado"
          }
          accion={
            filtro === "todas" && (
              <Link
                href="/cuenta/solicitud-nueva"
                className="inline-flex h-11 items-center rounded-full bg-oro-500 px-6 font-bold text-marca-900 hover:bg-oro-300"
              >
                Nueva solicitud
              </Link>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {lista.map((x) => (
            <FilaSolicitud
              key={x.id}
              x={x}
              abierta={abierta === x.id}
              onAbrir={() => setAbierta(abierta === x.id ? null : x.id)}
            >
              <DetalleSolicitud sb={sb} x={x} />
            </FilaSolicitud>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DetalleSolicitud({ sb, x }) {
  const [url, setUrl] = useState(null);
  const [viendo, setViendo] = useState(false);
  useEffect(() => {
    if (!x.comprobante_url) return;
    sb.storage
      .from("comprobantes")
      .createSignedUrl(x.comprobante_url, 300)
      .then(({ data }) => setUrl(data?.signedUrl || null));
  }, [sb, x.comprobante_url]);

  const enCurso = x.estado === "pendiente" || x.estado === "aprobado";
  const filas = [
    ["Enviada", fecha(x.created_at, true)],
    x.modalidad && [
      "Depósito",
      `${x.modalidad === "siguiente" ? "Al día siguiente" : "El mismo día"}${
        x.porcentaje_comision != null
          ? ` · comisión ${porcentaje(x.porcentaje_comision)}%`
          : ""
      }`,
    ],
    enCurso && x.fecha_deposito && ["Te depositamos", cuandoDeposito(x)],
    x.fecha_revision && ["Revisada", fecha(x.fecha_revision, true)],
    x.pagado_en && ["Depositada", fecha(x.pagado_en, true)],
    x.deposito_banco && [
      "Depositado en",
      `${x.deposito_tipo === "interbancaria" ? "CCI" : "Cuenta de ahorros"} ${nombreBanco(x.deposito_banco)} •••• ${x.deposito_ultimos4}`,
    ],
    x.nota_cliente && ["Tu nota", x.nota_cliente],
  ].filter(Boolean);

  return (
    <div className="grid gap-4 border-t border-[#E3E9F2] bg-white px-4 py-4 sm:grid-cols-[1fr_160px]">
      <div className="space-y-3">
        {x.estado === "rechazado" && x.motivo_rechazo && (
          <p className="rounded-xl bg-[#FBDADA]/60 px-3 py-2 text-sm text-[#7F1D1D]">
            <strong>Motivo:</strong> {x.motivo_rechazo}
          </p>
        )}
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {filas.map(([k, v]) => (
            <div key={k}>
              <dt className="text-chico text-[#8A93A6]">{k}</dt>
              <dd className="break-words font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {x.comprobante_url && (
        <button
          type="button"
          onClick={() => url && setViendo(true)}
          disabled={!url}
          aria-label={`Ampliar comprobante ${x.codigo}`}
          className="group relative block w-full overflow-hidden rounded-xl bg-[#0B1426] ring-1 ring-[#E3E9F2] transition hover:ring-marca-600"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`Comprobante ${x.codigo}`}
              className="h-36 w-full object-contain"
            />
          ) : (
            <span className="flex h-36 items-center justify-center text-chico text-white/60">
              Cargando comprobante...
            </span>
          )}
          {url && (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B1426]/85 to-transparent pb-1.5 pt-5 text-center text-[0.7rem] font-semibold text-white">
              Toca para ampliar
            </span>
          )}
        </button>
      )}
      <VisorImagen
        src={url}
        alt={`Comprobante ${x.codigo}`}
        abierto={viendo}
        onCerrar={() => setViendo(false)}
      />
    </div>
  );
}

/* ── Tarjetas y cuentas ── */

function TarjetasYCuentas({ tarjetas, cuentas }) {
  const porBanco = BANCOS_PRINCIPALES.map((b) => ({
    banco: b,
    ahorros: cuentas.find((c) => c.banco === b && c.tipo !== "interbancaria"),
    cci: cuentas.find((c) => c.banco === b && c.tipo === "interbancaria"),
  })).filter((x) => x.ahorros || x.cci);

  return (
    <div className="space-y-6">
      <Panel
        titulo="Mis tarjetas"
        accion={
          <BotonChico href="/cuenta/tarjeta-nueva">
            + Agregar tarjeta
          </BotonChico>
        }
      >
        {tarjetas.length === 0 ? (
          <Vacio
            titulo="Aún no registras tarjetas"
            texto="Solo tarjetas de crédito a tu nombre."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tarjetas.map((t) => (
              <li key={t.id}>
                <TarjetaDibujada t={t} />
                {t.estado === "rechazado" && t.motivo_rechazo && (
                  <p className="mt-2 text-chico text-red-700">
                    {t.motivo_rechazo}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-chico text-[#6B7690]">
          Una tarjeta registrada no se edita ni se elimina. Para darla de baja,
          escríbenos.
        </p>
      </Panel>

      <Panel
        titulo="Cuentas para depósito"
        accion={
          <BotonChico href="/cuenta/cuenta-nueva">+ Agregar cuenta</BotonChico>
        }
      >
        {porBanco.length === 0 ? (
          <Vacio
            titulo="Aún no registras cuentas"
            texto="La cuenta de ahorros es la que recibe tu dinero. El CCI es opcional."
          />
        ) : (
          <ul className="space-y-2.5">
            {porBanco.map(({ banco, ahorros, cci }) => (
              <li
                key={banco}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#F4F7FB] p-3 ring-1 ring-[#E3E9F2]"
              >
                <SiglaBanco banco={banco} grande />
                <p className="min-w-[90px] flex-1 font-semibold">{banco}</p>
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div>
                    <dt className="text-chico text-[#8A93A6]">Ahorros</dt>
                    <dd className="cifras font-medium">
                      {ahorros ? (
                        <NumeroEditable cuenta={ahorros} />
                      ) : (
                        <Link
                          href={`/cuenta/cuenta-nueva?banco=${banco}&tipo=ahorros`}
                          className="font-semibold text-marca-700 underline underline-offset-2"
                        >
                          Agregar
                        </Link>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-chico text-[#8A93A6]">CCI</dt>
                    <dd className="cifras font-medium">
                      {cci ? (
                        <NumeroEditable cuenta={cci} />
                      ) : (
                        <Link
                          href={`/cuenta/cuenta-nueva?banco=${banco}&tipo=interbancaria`}
                          className="font-semibold text-marca-700 underline underline-offset-2"
                        >
                          Agregar
                        </Link>
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Número de cuenta oculto, con su enlace para corregirlo. */
function NumeroEditable({ cuenta }) {
  return (
    <span className="inline-flex items-center gap-2">
      {ocultar(cuenta.numero_cuenta)}
      <Link
        href={`/cuenta/cuenta-nueva?editar=${cuenta.id}`}
        aria-label={`Editar ${cuenta.tipo === "interbancaria" ? "CCI" : "cuenta de ahorros"} ${cuenta.banco}`}
        className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-sans text-chico font-semibold text-marca-700 ring-1 ring-[#DCE3EE] transition hover:bg-[#EFF3F9] hover:text-marca-900"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden
        >
          <path d="M4 20h4L19 9l-4-4L4 16z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
        Editar
      </Link>
    </span>
  );
}

/** La tarjeta dibujada en el color de su banco. */
function TarjetaDibujada({ t }) {
  const c = colorBanco(t.banco);
  const estado =
    t.estado === "aprobado"
      ? { texto: "Verificada", clase: "bg-emerald-500 text-white" }
      : t.estado === "rechazado"
        ? { texto: "Rechazada", clase: "bg-red-600 text-white" }
        : { texto: "En revisión", clase: "bg-white/90 text-marca-900" };
  return (
    <div
      className={cn(
        "relative flex aspect-[1.586] max-w-full flex-col justify-between overflow-hidden rounded-2xl p-5 shadow-[0_14px_30px_-16px_rgba(15,27,51,0.6)]",
        t.estado === "rechazado" && "opacity-60 grayscale",
      )}
      style={{
        background: `linear-gradient(135deg, ${c.fondo} 0%, ${c.fondo}cc 55%, #0B1426 140%)`,
        color: c.texto,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15"
      />
      <div className="flex items-start justify-between">
        <span className="text-lg font-bold">{nombreBanco(t.banco)}</span>
        <Chip clase={estado.clase}>{estado.texto}</Chip>
      </div>
      <span
        aria-hidden
        className="h-7 w-10 rounded-md bg-gradient-to-br from-[#F5D976] to-[#C49B00]"
      />
      <span className="cifras text-lg tracking-[0.18em]">
        •••• •••• •••• {t.ultimos_4}
      </span>
    </div>
  );
}

/* ── Mi perfil ── */

function Perfil({ sb, perfil, usuario, comisiones, onSalir }) {
  const [promos, setPromos] = useState(Boolean(perfil.acepta_promociones));
  const [guardandoPromos, setGuardandoPromos] = useState(false);
  const bancos = [...(comisiones.bancos || [])].sort(
    (a, b) => Number(Boolean(b.con_tarjeta)) - Number(Boolean(a.con_tarjeta)),
  );

  async function cambiarPromos(v) {
    setPromos(v);
    setGuardandoPromos(true);
    const { error } = await sb.rpc("fijar_promociones", { p_acepta: v });
    if (error) setPromos(!v);
    setGuardandoPromos(false);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
      <MisDatos perfil={perfil} usuario={usuario} />
      <div className="space-y-6">
        <Panel titulo="Mis comisiones">
          {comisiones.cupon && (
            <div className="mb-3">
              <CuponVigente cupon={comisiones.cupon} />
            </div>
          )}
          {bancos.length === 0 ? (
            <p className="text-sm text-[#4F5B74]">
              Cuando verifiquemos tu tarjeta verás aquí tu porcentaje.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {bancos.map((b) => (
                <li
                  key={b.banco}
                  className="flex items-center gap-2.5 rounded-xl bg-[#F4F7FB] p-2.5 ring-1 ring-[#E3E9F2]"
                >
                  <SiglaBanco banco={b.banco} />
                  <span className="min-w-0">
                    <span className="block truncate text-chico text-[#6B7690]">
                      {nombreBanco(b.banco)}
                    </span>
                    <span className="cifras block font-heading text-lg leading-tight">
                      {porcentaje(b.porcentaje)}%
                      {b.especial && (
                        <span className="ml-1 align-middle text-[0.65rem] font-bold uppercase text-[#6E5300]">
                          especial
                        </span>
                      )}
                    </span>
                    {b.porcentaje_hoy != null && (
                      <span className="block text-[0.7rem] leading-tight text-[#6B7690]">
                        Al día siguiente ·{" "}
                        <span className="cifras font-semibold text-marca-900">
                          {porcentaje(b.porcentaje_hoy)}%
                        </span>{" "}
                        para hoy
                      </span>
                    )}
                    {b.minimo && b.limite && (
                      <span className="block text-[0.7rem] leading-tight text-[#6B7690]">
                        Mín. {soles(b.minimo)} si operas menos de{" "}
                        {soles(b.limite)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel titulo="Preferencias">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block font-semibold">
                Promociones y novedades
              </span>
              <span className="block text-sm text-[#6B7690]">
                Por correo y en la app. Puedes cambiarlo cuando quieras.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={promos}
              disabled={guardandoPromos}
              onChange={(e) => cambiarPromos(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "relative mt-1 h-6 w-11 shrink-0 rounded-full transition peer-focus-visible:ring-4 peer-focus-visible:ring-marca-600/20",
                promos ? "bg-emerald-500" : "bg-[#CBD5E3]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                  promos ? "left-[22px]" : "left-0.5",
                )}
              />
            </span>
          </label>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#EEF2F7] pt-4 text-sm">
            <a
              href="/terminos"
              target="_blank"
              rel="noopener"
              className="font-semibold text-marca-700 underline underline-offset-4"
            >
              Términos
            </a>
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener"
              className="font-semibold text-marca-700 underline underline-offset-4"
            >
              Privacidad
            </a>
            <a
              href="/libro-reclamaciones"
              target="_blank"
              rel="noopener"
              className="font-semibold text-marca-700 underline underline-offset-4"
            >
              Libro de reclamaciones
            </a>
          </div>
        </Panel>
        <Boton tono="neutro" className="w-full" onClick={onSalir}>
          Cerrar sesión
        </Boton>
      </div>
    </div>
  );
}

function MisDatos({ perfil, usuario }) {
  const filas = [
    ["Nombre", `${perfil.nombres} ${perfil.apellidos}`],
    ["Correo", usuario?.email],
    [
      perfil.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI",
      perfil.dni,
    ],
    ["Celular", perfil.telefono],
    ["Dirección", perfil.direccion],
    ["Cliente desde", fecha(perfil.created_at)],
  ];
  return (
    <Panel titulo="Mis datos">
      <dl className="divide-y divide-[#EEF2F7]">
        {filas.map(([k, v]) => (
          <div
            key={k}
            className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2.5 text-sm"
          >
            <dt className="text-[#6B7690]">{k}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 rounded-xl bg-[#E9EEF6] px-3 py-2 text-chico text-[#4F5B74]">
        ¿Algún dato cambió?{" "}
        <a
          href={`https://wa.me/${WHATSAPP}`}
          target="_blank"
          rel="noopener"
          className="font-semibold underline"
        >
          Escríbenos
        </a>{" "}
        para actualizarlo.
      </p>
    </Panel>
  );
}

/* ───────── Documentos legales nuevos ───────── */

const RUTA_LEGAL = {
  terminos: "/terminos",
  privacidad: "/privacidad",
  biometria: "/autorizacion-fotos",
};

/** Igual que en la app: si se publicó una versión nueva, se acepta antes de seguir. */
function AceptarLegales({ lista, onListo, onSalir }) {
  const [marcados, setMarcados] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const todos = lista.every((d) => marcados[d.id]);
  const actualizacion = lista.some((d) => d.actualizacion);

  async function confirmar() {
    setGuardando(true);
    setError("");
    try {
      await aceptarDocumentos(lista.map((d) => d.id));
      onListo();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0B1426]/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legales-titulo"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8">
        <h2 id="legales-titulo" className="font-heading text-xl">
          {actualizacion
            ? "Actualizamos nuestras condiciones"
            : "Antes de seguir"}
        </h2>
        <p className="mt-2 text-sm text-[#4F5B74]">
          Léelas y acéptalas para continuar usando tu cuenta.
        </p>
        {error && <Aviso>{error}</Aviso>}
        <div className="mt-5 space-y-2.5">
          {lista.map((d) => (
            <Casilla
              key={d.id}
              id={`legal-${d.id}`}
              marcada={Boolean(marcados[d.id])}
              onCambio={(v) => setMarcados((m) => ({ ...m, [d.id]: v }))}
            >
              Acepto{" "}
              <a
                href={RUTA_LEGAL[d.tipo] || "/terminos"}
                target="_blank"
                rel="noopener"
                className="font-semibold text-marca-900 underline"
              >
                {d.titulo}
              </a>{" "}
              <span className="text-[#8A93A6]">(versión {d.version})</span>
            </Casilla>
          ))}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
          <Boton tono="neutro" className="flex-1" onClick={onSalir}>
            Cerrar sesión
          </Boton>
          <Boton
            className="flex-1"
            disabled={!todos}
            cargando={guardando}
            onClick={confirmar}
          >
            Aceptar y continuar
          </Boton>
        </div>
      </div>
    </div>
  );
}
