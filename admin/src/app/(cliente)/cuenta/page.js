"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  supabaseCliente,
  tiempoRestante,
  cerrarSesionCliente,
  motivoDelBloqueo,
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
import {
  Encabezado,
  Boton,
  Aviso,
  Cargando,
  Casilla,
} from "@/components/cliente/piezas";
import SubidaFotos, { fotosCompletas } from "@/components/cliente/fotos";
import { WHATSAPP } from "@/components/sitio/datos";

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

const PESTANAS = [
  { k: "resumen", t: "Resumen" },
  { k: "solicitudes", t: "Solicitudes" },
  { k: "bancos", t: "Tarjetas y cuentas", corto: "Tarjetas" },
  { k: "perfil", t: "Mi perfil" },
];

const fecha = (f, conHora) =>
  f
    ? new Date(f).toLocaleString("es-PE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(conHora ? { hour: "numeric", minute: "2-digit" } : {}),
      })
    : "";
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
  const sb = supabaseCliente();
  const router = useRouter();
  const params = useSearchParams();
  const bienvenida = params.get("bienvenida") === "1";
  const guardado = {
    tarjeta: "Tarjeta enviada a verificación. Te avisaremos cuando esté lista.",
    cuenta: "Cuenta agregada.",
  }[params.get("aviso")];
  const [estado, setEstado] = useState(null); // pendiente | observado | activo
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [legales, setLegales] = useState([]);
  const [bloqueo, setBloqueo] = useState(null);
  const [error, setError] = useState("");

  const salir = useCallback(
    async (motivo) => {
      await cerrarSesionCliente();
      router.replace(motivo ? `/ingresar?${motivo}=1` : "/ingresar");
    },
    [router],
  );

  const cargar = useCallback(async () => {
    setError("");
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) return router.replace("/ingresar");
      // Dos horas desde que se escribió la contraseña, como en la app.
      if (tiempoRestante() <= 0) return salir("expirada");

      const user = session.user;
      const [{ data: u }, { data: p }] = await Promise.all([
        sb.from("users").select("rol, estado").eq("id", user.id).maybeSingle(),
        sb
          .from("perfiles_cliente")
          .select(
            "id, nombres, apellidos, tipo_documento, dni, telefono, direccion, motivo_observacion, created_at, acepta_promociones",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (u && u.rol !== "cliente") return salir();
      // Verificó el correo pero no terminó: se retoma el registro.
      if (!p) return router.replace("/registro");
      if (u?.estado === "bloqueado") {
        const motivo = await motivoDelBloqueo(user.id);
        await cerrarSesionCliente();
        return setBloqueo({ motivo });
      }
      setUsuario(user);
      setPerfil(p);
      setEstado(u?.estado || "pendiente");
      const { data: pend } = await sb.rpc("consentimientos_pendientes");
      setLegales(pend || []);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [sb, router, salir]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Cierre automático al cumplirse las dos horas.
  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(
      () => salir("expirada"),
      Math.max(0, tiempoRestante()),
    );
    return () => clearTimeout(t);
  }, [estado, salir]);

  const derecha = estado && (
    <button
      onClick={() => salir()}
      className="rounded-full px-4 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 hover:text-white"
    >
      Cerrar sesión
    </button>
  );

  if (bloqueo)
    return (
      <>
        <Encabezado />
        <Franja>
          <span className="inline-flex rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-red-300">
            Cuenta bloqueada
          </span>
          <h1 className="mt-4 font-heading text-3xl font-normal">
            No puedes operar por ahora
          </h1>
          <p className="mt-3 max-w-xl text-white/70">
            {bloqueo.motivo
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
      </>
    );

  if (error)
    return (
      <>
        <Encabezado />
        <main className="mx-auto max-w-lg px-4 py-14">
          <Aviso>{error}</Aviso>
          <Boton onClick={cargar}>Reintentar</Boton>
        </main>
      </>
    );

  if (!estado) return <Cargando texto="Abriendo tu cuenta..." />;

  return (
    <>
      <Encabezado derecha={derecha} />
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
          guardado={guardado}
          onSalir={() => salir()}
        />
      ) : (
        <EnRevision
          sb={sb}
          estado={estado}
          perfil={perfil}
          usuario={usuario}
          bienvenida={bienvenida}
          onEnviado={cargar}
        />
      )}
    </>
  );
}

/** Franja azul noche bajo el encabezado: el saludo y lo principal. */
function Franja({ children, pie }) {
  return (
    <section className="relative isolate overflow-hidden bg-[#0B1426] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-40 -z-10 h-96 w-96 rounded-full bg-oro-500/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-24 -z-10 h-96 w-96 rounded-full bg-[#2B4C9B]/35 blur-3xl"
      />
      <div className="mx-auto max-w-5xl px-4 pb-8 pt-9 sm:px-5">{children}</div>
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
        <p className="text-sm text-white/60">Hola, {perfil.nombres}</p>
        <h1 className="mt-1 font-heading text-[2rem] font-normal leading-tight tracking-[-0.02em]">
          {observado
            ? "Necesitamos una corrección"
            : bienvenida
              ? "¡Listo! Recibimos tus documentos."
              : "Estamos verificando tu identidad"}
        </h1>
        <ol className="mt-8 grid gap-3 sm:grid-cols-4">
          {pasos.map((p, i) => (
            <li
              key={p.t}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 ring-1",
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
                      ? "bg-oro-500 text-marca-900"
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

      <main className="mx-auto grid max-w-5xl items-start gap-6 px-4 py-8 sm:px-5 lg:grid-cols-[1fr_340px]">
        <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,27,51,0.05)] sm:p-8">
          {observado ? (
            <>
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
            </>
          ) : (
            <>
              <h2 className="font-heading text-xl">¿Qué sigue?</h2>
              <p className="mt-3 max-w-prose text-[#4F5B74]">
                Una persona de nuestro equipo revisa tus datos y tus fotos,
                normalmente en unas horas dentro del horario de atención. Cuando
                tu cuenta esté aprobada podrás registrar tus tarjetas y cuentas
                y enviar solicitudes, aquí o en la app.
              </p>
              {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
              <Boton tono="primario" className="mt-6" onClick={onEnviado}>
                Ver si ya está lista
              </Boton>
            </>
          )}
        </section>
        <MisDatos perfil={perfil} usuario={usuario} />
      </main>
    </>
  );
}

/* ───────── Cuenta activa ───────── */

function Activo({ sb, perfil, usuario, guardado, onSalir }) {
  const params = useSearchParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  // Tras agregar una tarjeta o cuenta se vuelve a su pestaña.
  const [pestana, setPestana] = useState(() =>
    params.get("aviso") ? "bancos" : "resumen",
  );

  useEffect(() => {
    const leer = () => {
      const h = window.location.hash.slice(1);
      if (PESTANAS.some((p) => p.k === h)) setPestana(h);
    };
    leer();
    window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, []);

  function irA(k) {
    setPestana(k);
    window.history.replaceState(null, "", `/cuenta#${k}`);
  }

  const cargar = useCallback(async () => {
    try {
      const [s, t, c, com, alertas, avisos] = await Promise.all([
        sb
          .from("solicitudes")
          .select(
            "id, codigo, banco, estado, nota_cliente, motivo_rechazo, comprobante_url, created_at, fecha_revision, pagado_en, tarjetas(banco, ultimos_4)",
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
      ]);
      const fallo = s.error || t.error || c.error || com.error;
      if (fallo) throw fallo;
      setDatos({
        solicitudes: s.data || [],
        tarjetas: t.data || [],
        cuentas: c.data || [],
        comisiones: com.data || { bancos: [] },
        alertas,
        avisos: avisos.data || [],
      });
      setError("");
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [sb, perfil.id, usuario.id]);

  // Al volver a la pestaña del navegador se actualiza: el equipo pudo
  // aprobar o pagar algo mientras tanto.
  useEffect(() => {
    cargar();
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  const solicitudes = useMemo(() => datos?.solicitudes || [], [datos]);
  const tarjetas = useMemo(() => datos?.tarjetas || [], [datos]);
  const cuentas = useMemo(() => datos?.cuentas || [], [datos]);
  const enCurso = solicitudes.filter(
    (x) => x.estado === "pendiente" || x.estado === "aprobado",
  ).length;
  const pagadas = solicitudes.filter((x) => x.estado === "pagado").length;
  const listos = bancosDelCliente(tarjetas, cuentas).filter(
    (b) => estadoBanco(b, tarjetas, cuentas) === "listo",
  ).length;

  const pie = (
    <nav
      aria-label="Secciones de Mi cuenta"
      className="mx-auto max-w-5xl overflow-x-auto px-4 sm:px-5"
    >
      <ul className="flex min-w-max gap-1">
        {PESTANAS.map((p) => {
          const activa = pestana === p.k;
          return (
            <li key={p.k}>
              <button
                onClick={() => irA(p.k)}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "relative px-3 pb-4 pt-2 text-sm font-semibold transition sm:px-4",
                  activa ? "text-white" : "text-white/55 hover:text-white/85",
                )}
              >
                {p.corto ? (
                  <>
                    <span className="sm:hidden">{p.corto}</span>
                    <span className="hidden sm:inline">{p.t}</span>
                  </>
                ) : (
                  p.t
                )}
                {p.k === "solicitudes" && enCurso > 0 && (
                  <span className="cifras ml-1.5 rounded-full bg-oro-500 px-1.5 py-0.5 text-[0.7rem] text-marca-900">
                    {enCurso}
                  </span>
                )}
                <span
                  className={cn(
                    "absolute inset-x-3 bottom-0 h-[3px] rounded-t-full transition",
                    activa ? "bg-oro-500" : "bg-transparent",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <>
      <Franja pie={pie}>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-white/60">Hola,</p>
            <h1 className="font-heading text-[2rem] font-normal leading-tight tracking-[-0.02em]">
              {perfil.nombres} {perfil.apellidos}
            </h1>
          </div>
          <div className="flex items-center gap-3 self-start md:self-auto">
            <MisAvisos sb={sb} avisos={datos?.avisos || []} />
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
              <dd className={cn("cifras mt-0.5 font-heading text-3xl", color)}>
                {datos ? v : "–"}
              </dd>
            </div>
          ))}
        </dl>
      </Franja>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
        {guardado && <Aviso tono="exito">{guardado}</Aviso>}
        {datos?.alertas?.length > 0 && (
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
            irA={irA}
          />
        ) : pestana === "solicitudes" ? (
          <Solicitudes sb={sb} solicitudes={solicitudes} />
        ) : pestana === "bancos" ? (
          <TarjetasYCuentas tarjetas={tarjetas} cuentas={cuentas} />
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

/* ── Mis avisos (notificaciones personales) ── */

/** Color e ícono del aviso, con la misma regla que la app (notificaciones.js). */
function estiloAviso(a) {
  const t = `${a.titulo || ""} ${a.cuerpo || ""}`.toLowerCase();
  if (/rechaz|observ|bloque/.test(t))
    return {
      icono: "M18 6 6 18M6 6l12 12",
      clase: "bg-[#FBDADA] text-red-700",
    };
  if (/pag|deposit/.test(t))
    return {
      icono: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
      clase: "bg-[#D5F2E3] text-emerald-700",
    };
  if (/aprob|verificad|activ/.test(t))
    return { icono: "M20 6 9 17l-5-5", clase: "bg-[#FCEFC7] text-[#6E5300]" };
  return {
    icono: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    clase: "bg-[#DCE6F7] text-[#1E3A8A]",
  };
}

const haceCuanto = (iso) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "Ahora";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  if (h < 48) return "Ayer";
  return fecha(iso);
};

/**
 * Campana con lo que el equipo le respondió al cliente (identidad,
 * tarjetas, solicitudes, pagos). Cada aviso se marca como leído al
 * abrirlo, como en la app: abrir la lista no basta para decir que se
 * leyó todo.
 */
function MisAvisos({ sb, avisos }) {
  const [abierto, setAbierto] = useState(false);
  const [expandido, setExpandido] = useState(null);
  const [leidos, setLeidos] = useState([]);
  const lista = avisos.map((a) =>
    leidos.includes(a.id) ? { ...a, leida: true } : a,
  );
  const sinLeer = lista.filter((a) => !a.leida).length;

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [abierto]);

  async function leer(a) {
    setExpandido(expandido === a.id ? null : a.id);
    if (a.leida) return;
    setLeidos((l) => [...l, a.id]);
    await sb.from("notificaciones").update({ leida: true }).eq("id", a.id);
  }

  async function leerTodos() {
    const ids = lista.filter((a) => !a.leida).map((a) => a.id);
    if (!ids.length) return;
    setLeidos((l) => [...l, ...ids]);
    await sb.from("notificaciones").update({ leida: true }).in("id", ids);
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        aria-label={sinLeer ? `Mis avisos, ${sinLeer} sin leer` : "Mis avisos"}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/15"
      >
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
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {sinLeer > 0 && (
          <span className="cifras absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[0.7rem] font-bold text-white ring-2 ring-[#0B1426]">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      {abierto &&
        createPortal(
          <div
            className="fixed inset-0 z-[75] flex justify-end bg-[#0B1426]/60"
            onClick={() => setAbierto(false)}
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="avisos-titulo"
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-md flex-col bg-[#EEF2F8] text-marca-900 shadow-2xl"
            >
              <header className="flex items-center gap-3 bg-[#0B1426] px-5 py-4 text-white">
                <h2 id="avisos-titulo" className="font-heading text-lg">
                  Mis avisos
                </h2>
                {sinLeer > 0 && (
                  <span className="cifras rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold">
                    {sinLeer} sin leer
                  </span>
                )}
                <button
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
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
              </header>
              {sinLeer > 0 && (
                <div className="flex justify-end px-5 pt-3">
                  <BotonChico onClick={leerTodos}>
                    Marcar todo como leído
                  </BotonChico>
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {lista.length === 0 ? (
                  <Vacio
                    titulo="Sin avisos por ahora"
                    texto="Aquí te contamos cuando revisemos tu identidad, tus tarjetas o tus solicitudes."
                  />
                ) : (
                  <ul className="space-y-2">
                    {lista.map((a) => {
                      const e = estiloAviso(a);
                      return (
                        <li key={a.id}>
                          <button
                            onClick={() => leer(a)}
                            aria-expanded={expandido === a.id}
                            className={cn(
                              "flex w-full gap-3 rounded-2xl p-3 text-left ring-1 transition",
                              a.leida
                                ? "bg-white/60 ring-[#E3E9F2]"
                                : "bg-white ring-[#C9D6EC]",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                                e.clase,
                              )}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                                aria-hidden
                              >
                                <path d={e.icono} />
                              </svg>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start gap-2">
                                <span
                                  className={cn(
                                    "flex-1 text-sm",
                                    a.leida
                                      ? "font-medium text-[#3D4A63]"
                                      : "font-bold",
                                  )}
                                >
                                  {a.titulo}
                                </span>
                                {!a.leida && (
                                  <span
                                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600"
                                    aria-label="Sin leer"
                                  />
                                )}
                              </span>
                              {a.cuerpo && (
                                <span
                                  className={cn(
                                    "mt-0.5 block text-sm text-[#4F5B74]",
                                    expandido !== a.id && "line-clamp-2",
                                  )}
                                >
                                  {a.cuerpo}
                                </span>
                              )}
                              <span className="mt-1 block text-chico text-[#8A93A6]">
                                {haceCuanto(a.created_at)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>
          </div>,
          // Fuera de la franja: dentro de ella el encabezado lo tapaba.
          document.body,
        )}
    </>
  );
}

/* ── Alertas del servicio ── */

const TONO_ALERTA = {
  critico: {
    etiqueta: "Urgente",
    caja: "bg-[#FDE4E4] ring-[#F5B5B5]",
    barra: "bg-red-600",
    chip: "bg-red-600 text-white",
    texto: "text-[#7F1D1D]",
  },
  advertencia: {
    etiqueta: "Atención",
    caja: "bg-[#FDF1CF] ring-[#F0D78A]",
    barra: "bg-oro-500",
    chip: "bg-oro-500 text-marca-900",
    texto: "text-[#5C4600]",
  },
  info: {
    etiqueta: "Aviso",
    caja: "bg-[#E0E9FA] ring-[#B9CBF0]",
    barra: "bg-[#3B6FD8]",
    chip: "bg-[#3B6FD8] text-white",
    texto: "text-[#1E3A8A]",
  },
};

/**
 * Avisos del equipo sobre el servicio ("el BCP no procesa hoy"). Las
 * nuevas se ven completas arriba de todo; las ya vistas quedan plegadas
 * pero a mano, como en la app. "Entendido" las marca como vistas en la
 * base, así la app tampoco las vuelve a resaltar.
 */
function AlertasServicio({ alertas, userId }) {
  const [vistas, setVistas] = useState(
    () => new Set(alertas.filter((a) => a.vista).map((a) => a.id)),
  );
  const [verVistas, setVerVistas] = useState(false);
  const orden = { critico: 0, advertencia: 1, info: 2 };
  const lista = [...alertas].sort(
    (a, b) => (orden[a.tipo] ?? 3) - (orden[b.tipo] ?? 3),
  );
  const nuevas = lista.filter((a) => !vistas.has(a.id));
  const leidas = lista.filter((a) => vistas.has(a.id));

  function entendido() {
    const ids = nuevas.map((a) => a.id);
    setVistas((v) => new Set([...v, ...ids]));
    marcarAlertasVistas(userId, ids);
  }

  return (
    <section aria-label="Alertas del servicio" className="mb-6 space-y-2">
      {nuevas.length > 0 && (
        <>
          <ul className="space-y-2" role="alert">
            {nuevas.map((a) => (
              <FilaAlerta key={a.id} a={a} />
            ))}
          </ul>
          <div className="flex justify-end">
            <BotonChico onClick={entendido}>Entendido</BotonChico>
          </div>
        </>
      )}
      {leidas.length > 0 && (
        <div>
          <button
            onClick={() => setVerVistas((v) => !v)}
            aria-expanded={verVistas}
            className="flex w-full items-center gap-2 rounded-2xl bg-white/70 px-4 py-2.5 text-left text-sm font-semibold text-[#3D4A63] ring-1 ring-[#D8E0EC] transition hover:bg-white"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                leidas.some((a) => a.tipo === "critico")
                  ? "bg-red-600"
                  : "bg-oro-500",
              )}
              aria-hidden
            />
            {leidas.length === 1
              ? "1 alerta del servicio activa"
              : `${leidas.length} alertas del servicio activas`}
            <span className="ml-auto text-chico font-normal text-[#6B7690]">
              {verVistas ? "Ocultar" : "Ver"}
            </span>
          </button>
          {verVistas && (
            <ul className="mt-2 space-y-2">
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
    <li className={cn("flex overflow-hidden rounded-2xl ring-1", t.caja)}>
      <span className={cn("w-1.5 shrink-0", t.barra)} aria-hidden />
      <div className="min-w-0 flex-1 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip clase={t.chip}>{t.etiqueta}</Chip>
          <p className={cn("font-semibold", t.texto)}>{a.titulo}</p>
        </div>
        {a.mensaje && (
          <p className={cn("mt-1 whitespace-pre-line text-sm", t.texto)}>
            {a.mensaje}
          </p>
        )}
        <p className={cn("mt-1 text-chico opacity-70", t.texto)}>
          Desde {fecha(a.fecha_inicio, true)}
          {a.fecha_fin && ` · hasta ${fecha(a.fecha_fin, true)}`}
        </p>
      </div>
    </li>
  );
}

/* ── Resumen ── */

function Resumen({ solicitudes, tarjetas, cuentas, comisiones, irA }) {
  const bancos = bancosDelCliente(tarjetas, cuentas);
  const rechazadas = tarjetas.filter((t) => t.estado === "rechazado");
  const ultimas = solicitudes.slice(0, 4);
  const pct = Object.fromEntries(
    (comisiones.bancos || []).map((b) => [b.banco, b]),
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
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
                        ` · ${porcentaje(pct[b].porcentaje)}% comisión${pct[b].minimo ? ` (mín. ${soles(pct[b].minimo)})` : ""}`}
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
  useEffect(() => {
    if (!x.comprobante_url) return;
    sb.storage
      .from("comprobantes")
      .createSignedUrl(x.comprobante_url, 300)
      .then(({ data }) => setUrl(data?.signedUrl || null));
  }, [sb, x.comprobante_url]);

  const filas = [
    ["Enviada", fecha(x.created_at, true)],
    x.fecha_revision && ["Revisada", fecha(x.fecha_revision, true)],
    x.pagado_en && ["Depositada", fecha(x.pagado_en, true)],
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
        <a
          href={url || undefined}
          target="_blank"
          rel="noopener"
          className="block overflow-hidden rounded-xl bg-[#0B1426] ring-1 ring-[#E3E9F2]"
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
        </a>
      )}
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
                        ocultar(ahorros.numero_cuenta)
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
                        ocultar(cci.numero_cuenta)
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
            className="grid grid-cols-[130px_1fr] gap-3 py-2.5 text-sm"
          >
            <dt className="text-[#6B7690]">{k}</dt>
            <dd className="break-words font-medium">{v || "—"}</dd>
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
