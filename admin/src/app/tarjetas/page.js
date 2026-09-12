"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firmarCampo } from "@/lib/storage";
import { cambiarEstado, registrarAuditoria, notificar } from "@/lib/acciones";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Tarjeta as IconoTarjeta, Check, Cruz } from "@/components/shell";
import Visor from "@/components/visor";
import { Estado, Dato, Vacio, Aviso } from "@/components/marca";

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
  const [session, setSession] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [seleccionada, setSeleccionada] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [modoRechazo, setModoRechazo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  const [contadores, setContadores] = useState({});
  const router = useRouter();

  const cargar = useCallback(async (estado) => {
    setLoading(true);
    setError("");
    setFiltro(estado);
    setSeleccionada(null);
    setModoRechazo(false);
    setMotivo("");

    const { data, error: consultaError } = await supabase
      .from("tarjetas")
      .select(
        `id, banco, ultimos_4, estado, foto_tarjeta, motivo_rechazo,
         created_at, fecha_revision,
         perfiles_cliente (nombres, apellidos, dni, telefono, user_id)`,
      )
      .eq("estado", estado)
      .eq("activa", true)
      .order("created_at", { ascending: true });

    if (consultaError) {
      setError("No se pudieron cargar las tarjetas: " + consultaError.message);
      setTarjetas([]);
      setLoading(false);
      return;
    }

    const firmadas = await firmarCampo(BUCKET, data || [], "foto_tarjeta", "foto");
    setTarjetas(firmadas);
    setLoading(false);
    if (firmadas.length > 0) abrir(firmadas[0]);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargar("pendiente");
      contarPendientes();
    });
  }, [router, cargar]);

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

  function abrir(t) {
    setSeleccionada(t);
    setMotivo("");
    setModoRechazo(false);
  }

  async function aprobar(t) {
    setAccion("aprobando");
    setError("");
    const r = await cambiarEstado({
      tabla: "tarjetas",
      id: t.id,
      estadoActual: "pendiente",
      estadoNuevo: "aprobado",
      campos: {
        revisado_por: session.user.id,
        fecha_revision: new Date().toISOString(),
      },
    });
    if (!r.ok) {
      setAccion(null);
      setError(r.error);
      cargar(filtro);
      return;
    }
    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "APROBAR_TARJETA",
      entidad: "tarjetas",
      entidad_id: t.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "aprobado", banco: t.banco, ultimos_4: t.ultimos_4 },
    });
    await notificar({
      userId: t.perfiles_cliente?.user_id,
      tipo: "tarjeta_aprobada",
      titulo: "Tarjeta verificada",
      cuerpo: `Tu tarjeta ${t.banco} terminada en ${t.ultimos_4} quedó verificada. Ya puedes enviar comprobantes con ella.`,
    });
    setAccion(null);
    cargar(filtro);
    contarPendientes();
  }

  async function rechazar(t) {
    const texto = motivo.trim();
    if (texto.length < MIN_MOTIVO) {
      setError(
        `Explica el motivo con al menos ${MIN_MOTIVO} caracteres: el cliente lo va a leer en su app.`,
      );
      return;
    }
    setAccion("rechazando");
    setError("");
    const r = await cambiarEstado({
      tabla: "tarjetas",
      id: t.id,
      estadoActual: "pendiente",
      estadoNuevo: "rechazado",
      campos: {
        motivo_rechazo: texto,
        revisado_por: session.user.id,
        fecha_revision: new Date().toISOString(),
      },
    });
    if (!r.ok) {
      setAccion(null);
      setError(r.error);
      cargar(filtro);
      return;
    }
    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "RECHAZAR_TARJETA",
      entidad: "tarjetas",
      entidad_id: t.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "rechazado", motivo: texto },
    });
    await notificar({
      userId: t.perfiles_cliente?.user_id,
      tipo: "tarjeta_rechazada",
      titulo: "Tarjeta rechazada",
      cuerpo: `Tu tarjeta ${t.banco} terminada en ${t.ultimos_4} fue rechazada. Motivo: ${texto}`,
    });
    setAccion(null);
    cargar(filtro);
    contarPendientes();
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
        <div className="hidden items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 sm:flex">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              onClick={() => cargar(f.clave)}
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
            onClick={() => cargar(f.clave)}
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
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[84px] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
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
                      {!t.foto && (
                        <span className="ml-auto text-[11px] text-red-600">
                          sin imagen
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-[13px] text-muted-foreground">
                      {t.perfiles_cliente
                        ? `${t.perfiles_cliente.nombres} ${t.perfiles_cliente.apellidos}`
                        : "Cliente sin perfil"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Detalle */}
        <section className="min-w-0">
          {!seleccionada ? (
            <Vacio
              icono={<IconoTarjeta className="h-5 w-5" />}
              titulo="Elige una tarjeta"
              detalle="Selecciona un elemento de la cola para ver la foto y resolverla."
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
                  <Visor
                    url={seleccionada.foto}
                    error={seleccionada.foto_error}
                    path={seleccionada.foto_path}
                    titulo="Foto de la tarjeta"
                    alto="h-[440px]"
                  />
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

                  {seleccionada.estado === "pendiente" ? (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
                      {!modoRechazo ? (
                        <div className="space-y-2">
                          <button
                            onClick={() => aprobar(seleccionada)}
                            disabled={accion !== null}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" />
                            {accion === "aprobando"
                              ? "Verificando..."
                              : "Verificar tarjeta"}
                          </button>
                          <button
                            onClick={() => setModoRechazo(true)}
                            disabled={accion !== null}
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
    </Shell>
  );
}
