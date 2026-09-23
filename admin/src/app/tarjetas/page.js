"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firmarCampo } from "@/lib/storage";
import { explicarError } from "@/lib/acciones";
import { resolverCaso, tomarCaso } from "@/lib/casos";
import { tomarSiguiente, minutosRestantes } from "@/lib/cola";
import { colorDe } from "@/lib/colores";
import { cn } from "@/lib/utils";
import Shell, {
  Lupa,
  Tarjeta as IconoTarjeta,
  Check,
  Cruz,
  Manos,
} from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import SinPendientes from "@/components/sinPendientes";
import Revisor from "@/components/revisor";
import BotonRefrescar from "@/components/refrescar";
import { Estado, Dato, Vacio, Aviso } from "@/components/marca";
import { EsqueletoCola, BarraCarga, Esqueleto } from "@/components/carga";

const BUCKET = "tarjetas-fotos";
const FILTROS = [
  { clave: "pendiente", etiqueta: "Por verificar" },
  { clave: "aprobado", etiqueta: "Verificadas" },
  { clave: "rechazado", etiqueta: "Rechazadas" },
];
const MIN_MOTIVO = 10;

function fechaLarga(iso) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TarjetasPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [tarjetas, setTarjetas] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [seleccionada, setSeleccionada] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [modoRechazo, setModoRechazo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  const [conflicto, setConflicto] = useState(null);
  const [contadores, setContadores] = useState({});
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [cara, setCara] = useState("frente");
  const [equipo, setEquipo] = useState({});
  const [ajeno, setAjeno] = useState(null);
  const [sinPendientes, setSinPendientes] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);
  const router = useRouter();

  // Verificar es del gestor; el supervisor mira como va el trabajo. El
  // admin conserva el mando.
  const puedeResolver = ["gestor", "admin"].includes(session?.rol);
  const esGestor = session?.rol === "gestor";

  const cargar = useCallback(async (estado, mias, yo) => {
    setLoading(true);
    setError("");
    setFiltro(estado);
    setSeleccionada(null);
    setModoRechazo(false);
    setMotivo("");

    let q = supabase
      .from("tarjetas")
      .select(
        `id, banco, ultimos_4, estado, foto_tarjeta, foto_reverso,
         motivo_rechazo, created_at, fecha_revision, asignado_a, asignado_en,
         perfiles_cliente (nombres, apellidos, dni, telefono, user_id)`,
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
  function recargar() {
    cargar(filtro, session?.rol === "gestor", session?.user.id);
    contarPendientes();
  }

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
    setContadores({
      solicitudesPendientes: await cuenta("solicitudes", { estado: "pendiente" }),
      kycPendientes: await cuenta("users", { rol: "cliente", estado: "pendiente" }),
      tarjetasPendientes: await cuenta("tarjetas", { estado: "pendiente", activa: true }),
    });
  }

  async function abrir(t) {
    setSeleccionada(t);
    setMotivo("");
    setModoRechazo(false);
    setAjeno(null);

    // Abrirla es atenderla: así el resto del equipo la ve tomada. El
    // supervisor solo mira, y tomarla se la quitaría al gestor.
    const puedeTomar = ["gestor", "admin"].includes(session?.rol);
    if (puedeTomar && t.estado === "pendiente") {
      const r = await tomarCaso("tarjeta", t.id);
      if (!r.ok && r.motivo === "TOMADO") setAjeno(r);
      recargar();
    }
    // Siempre se abre por el frente: es la cara obligatoria y la que
    // toda tarjeta tiene.
    setCara("frente");
    setCargandoDetalle(true);

    // Las dos caras se firman juntas, para que cambiar de una a otra
    // sea inmediato en vez de pedir otra firma al servidor.
    const [conFrente] = await firmarCampo(BUCKET, [t], "foto_tarjeta", "foto");
    const [conReverso] = await firmarCampo(
      BUCKET,
      [t],
      "foto_reverso",
      "reverso",
    );

    setSeleccionada((actual) =>
      actual && actual.id === t.id
        ? { ...actual, ...conFrente, ...conReverso }
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

    if (!r.ok) {
      if (r.motivo === "TOMADO" || r.motivo === "RESUELTO") {
        setConflicto(r);
        setSeleccionada(null);
        setModoRechazo(false);
        setMotivo("");
      } else {
        setError(r.mensaje);
      }
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

  async function rechazar(t) {
    const texto = motivo.trim();
    if (texto.length < MIN_MOTIVO) {
      setError(
        `Explica el motivo con al menos ${MIN_MOTIVO} caracteres: el cliente lo va a leer en su app.`,
      );
      return;
    }
    await resolver(t, false, texto);
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

  if (!session) return null;

  const cliente = seleccionada?.perfiles_cliente;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Tarjetas"
      descripcion={
        loading
          ? "Cargando..."
          : filtro === "pendiente"
            ? `${tarjetas.length} ${tarjetas.length === 1 ? "tarjeta espera" : "tarjetas esperan"} verificación`
            : `${tarjetas.length} en el historial`
      }
      acciones={
        <>
        {filtro === "pendiente" && puedeResolver && (
          <button
            onClick={() => atenderSiguiente()}
            disabled={pidiendo}
            title="Te asigna la tarjeta libre que más tiempo lleva esperando"
            className="pulsable flex items-center gap-2 rounded-lg bg-marca-700 px-3.5 py-2 text-[0.8667rem] font-semibold text-white hover:bg-marca-600 disabled:opacity-50"
          >
            <Manos className="h-4 w-4" />
            {pidiendo ? "Buscando…" : "Atender siguiente"}
          </button>
        )}
        {!puedeResolver && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[0.7333rem] font-medium text-muted-foreground">
            Solo lectura
          </span>
        )}
        <BotonRefrescar
          girando={loading}
          onClick={recargar}
          texto="Volver a pedir la lista de tarjetas"
        />
        <div className="hidden items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 sm:flex">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              onClick={() => cargar(f.clave, session?.rol === "gestor", session?.user.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition",
                filtro === f.clave
                  ? "bg-card text-foreground shadow-panel"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
        </>
      }
    >
      {error && (
        <div className="mb-5">
          <Aviso titulo="No se pudo completar" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        </div>
      )}

      <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 sm:hidden">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            onClick={() => cargar(f.clave, session?.rol === "gestor", session?.user.id)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition",
              filtro === f.clave ? "bg-card shadow-panel" : "text-muted-foreground",
            )}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* Cola */}
        <section className="flex min-w-0 flex-col">
          <div className="relative mb-3">
            <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, DNI, banco o últimos 4"
              className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
            />
          </div>

          {loading ? (
            <EsqueletoCola filas={4} />
          ) : visibles.length === 0 ? (
            <Vacio
              icono={<IconoTarjeta className="h-5 w-5" />}
              titulo={busqueda ? "Sin coincidencias" : "Cola vacía"}
              detalle={
                busqueda
                  ? "Ninguna tarjeta coincide con lo que buscas."
                  : "No queda ninguna tarjeta por verificar."
              }
            />
          ) : (
            <div className="scroll-fino -mx-1 max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto px-1">
              {visibles.map((t) => {
                const activa = seleccionada?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => abrir(t)}
                    className={cn(
                      "w-full rounded-xl border bg-card p-3.5 text-left transition",
                      t.asignado_a &&
                        minutosRestantes(t.asignado_en) > 0 &&
                        (t.asignado_a === session.user.id
                          ? "border-l-4 border-l-marca-600"
                          : `border-l-4 ${colorDe(t.asignado_a).borde}`),
                      activa
                        ? "border-marca-600 shadow-alzado ring-1 ring-marca-600"
                        : "border-border hover:border-marca-200 hover:shadow-panel",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">
                        {t.banco}
                      </span>
                      <span className="cifras font-mono text-[13px] text-muted-foreground">
                        ···· {t.ultimos_4}
                      </span>
                      {!t.foto_tarjeta ? (
                        <span className="ml-auto text-[0.7333rem] text-red-600">
                          sin adjunto
                        </span>
                      ) : t.foto_reverso ? (
                        <span className="ml-auto text-[0.7333rem] text-muted-foreground">
                          2 fotos
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                        {t.perfiles_cliente
                          ? `${t.perfiles_cliente.nombres} ${t.perfiles_cliente.apellidos}`
                          : "Cliente sin perfil"}
                      </p>
                      {t.asignado_a && minutosRestantes(t.asignado_en) > 0 && (
                        <Revisor
                          id={t.asignado_a}
                          persona={equipo[t.asignado_a]}
                          minutos={minutosRestantes(t.asignado_en)}
                          propio={t.asignado_a === session.user.id}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Detalle */}
        <section className="min-w-0 space-y-4">
          {ajeno && (
            <div className="flex items-start gap-3 rounded-xl border border-oro-300/60 bg-oro-50 p-4">
              <span className="text-lg leading-none">👀</span>
              <p className="text-[0.8667rem] leading-relaxed text-oro-700">
                <strong>{ajeno.quien}</strong> está revisando esta tarjeta.
                Puedes mirarla, pero verificarla es suyo hasta que pasen{" "}
                {ajeno.libre_en} min.
              </p>
            </div>
          )}

          {!seleccionada ? (
            <Vacio
              icono={<IconoTarjeta className="h-5 w-5" />}
              titulo="Elige una tarjeta de la lista"
              detalle="Al pulsar una se carga su foto y los datos del titular."
            />
          ) : (
            <div className="space-y-4 animate-aparecer">
              <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-panel">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-bold text-foreground">
                      {seleccionada.banco}
                    </h2>
                    <span className="cifras font-mono text-[15px] text-muted-foreground">
                      ···· {seleccionada.ultimos_4}
                    </span>
                    <Estado valor={seleccionada.estado} />
                  </div>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Registrada el {fechaLarga(seleccionada.created_at)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  {/* Selector de cara. Solo aparece si el cliente subió
                      el reverso: la mayoría de tarjetas muestra todo en
                      una sola foto y un selector de una opción confunde. */}
                  {seleccionada.foto_reverso && (
                    <div className="mb-3 flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1">
                      {[
                        { clave: "frente", texto: "Frente" },
                        { clave: "reverso", texto: "Reverso" },
                      ].map((c) => (
                        <button
                          key={c.clave}
                          onClick={() => setCara(c.clave)}
                          className={cn(
                            "pulsable flex-1 rounded-md px-3 py-1.5 text-[0.8667rem] font-medium",
                            cara === c.clave
                              ? "bg-card text-foreground shadow-panel"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {c.texto}
                        </button>
                      ))}
                    </div>
                  )}

                  {cargandoDetalle ? (
                    <Esqueleto className="h-[440px] w-full rounded-lg" />
                  ) : (
                    <Visor
                      url={
                        cara === "reverso"
                          ? seleccionada.reverso
                          : seleccionada.foto
                      }
                      error={
                        cara === "reverso"
                          ? seleccionada.reverso_error
                          : seleccionada.foto_error
                      }
                      path={
                        cara === "reverso"
                          ? seleccionada.reverso_path
                          : seleccionada.foto_path
                      }
                      titulo={
                        cara === "reverso"
                          ? "Reverso de la tarjeta"
                          : "Frente de la tarjeta"
                      }
                      alto="h-[440px]"
                    />
                  )}
                  <div className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Qué comprobar
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[13px] text-foreground">
                      <li>El nombre impreso coincide con el titular.</li>
                      <li>
                        Los últimos 4 dígitos coinciden con{" "}
                        <span className="cifras font-mono font-semibold">
                          {seleccionada.ultimos_4}
                        </span>
                        .
                      </li>
                      <li>El número completo está cubierto.</li>
                      {seleccionada.foto_reverso && (
                        <li>Revisa las dos caras antes de resolver.</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="min-w-0 space-y-4">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                    <h3 className="mb-3 text-[13px] font-semibold">Titular</h3>
                    <p className="text-base font-semibold text-foreground">
                      {cliente
                        ? `${cliente.nombres} ${cliente.apellidos}`
                        : "Cliente sin perfil"}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      <Dato etiqueta="DNI" mono>
                        {cliente?.dni}
                      </Dato>
                      <Dato etiqueta="Teléfono" mono>
                        {cliente?.telefono}
                      </Dato>
                    </dl>
                  </div>

                  {seleccionada.estado === "pendiente" && !puedeResolver ? (
                    <div className="rounded-xl border border-border bg-muted/40 p-4 text-[0.8667rem] text-muted-foreground">
                      Estás viendo la cola como supervisor: puedes revisar el
                      trabajo y saber quién atiende cada tarjeta, pero
                      verificarla es del gestor que la tiene.
                    </div>
                  ) : seleccionada.estado === "pendiente" ? (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                      {!modoRechazo ? (
                        <div className="space-y-2">
                          <button
                            onClick={() => aprobar(seleccionada)}
                            disabled={accion !== null || Boolean(ajeno)}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" />
                            {accion === "aprobando"
                              ? "Verificando..."
                              : "Verificar tarjeta"}
                          </button>
                          <button
                            onClick={() => setModoRechazo(true)}
                            disabled={accion !== null || Boolean(ajeno)}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          >
                            <Cruz className="h-4 w-4" />
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[13px] font-semibold">
                              Motivo del rechazo
                            </label>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                              El cliente lo lee en su app y puede volver a
                              registrar la tarjeta corrigiendo esto.
                            </p>
                          </div>
                          <textarea
                            autoFocus
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            rows={4}
                            placeholder="Ej: La foto no deja ver el nombre del titular."
                            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                          />
                          <span
                            className={cn(
                              "block text-[12px]",
                              motivo.trim().length >= MIN_MOTIVO
                                ? "text-emerald-600"
                                : "text-muted-foreground",
                            )}
                          >
                            {motivo.trim().length} / {MIN_MOTIVO} mínimo
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setModoRechazo(false);
                                setMotivo("");
                              }}
                              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => rechazar(seleccionada)}
                              disabled={
                                accion !== null ||
                                motivo.trim().length < MIN_MOTIVO
                              }
                              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
                            >
                              {accion === "rechazando"
                                ? "Rechazando..."
                                : "Confirmar rechazo"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                      <h3 className="mb-3 text-[13px] font-semibold">
                        Resolución
                      </h3>
                      <Dato etiqueta="Resuelta el">
                        {seleccionada.fecha_revision
                          ? fechaLarga(seleccionada.fecha_revision)
                          : null}
                      </Dato>
                      {seleccionada.motivo_rechazo && (
                        <div className="mt-3 rounded-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
                            Motivo comunicado
                          </p>
                          <p className="mt-1 text-sm text-red-900">
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
      <SinPendientes
        visible={sinPendientes}
        onCerrar={() => setSinPendientes(false)}
        texto="No hay tarjetas esperando verificación. Cuando entre una nueva, el sistema te la asigna solo."
      />

      <Conflicto
        mensaje={conflicto?.mensaje}
        titulo={conflicto?.titulo}
        onCerrar={() => setConflicto(null)}
      />
    </Shell>
  );
}
