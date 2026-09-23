"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { urlsFirmadas, extraerPath } from "@/lib/storage";
import { actualizar, registrarAuditoria } from "@/lib/acciones";
import { resolverCaso, tomarCaso } from "@/lib/casos";
import { tomarSiguiente } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Check, Cruz } from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import { Estado, Dato, Aviso } from "@/components/marca";

const BUCKET = "kyc-documentos";
const MIN_MOTIVO = 10;

const DOCUMENTOS = [
  { campo: "foto_dni_frontal", titulo: "DNI · Frente", pista: "Foto y datos" },
  { campo: "foto_dni_posterior", titulo: "DNI · Reverso", pista: "Código de barras" },
  { campo: "foto_selfie", titulo: "Selfie con DNI", pista: "Rostro y documento" },
];

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

export default function KYCDetallePage() {
  const [session, setSession] = useState(sesionEnCache);
  const [cliente, setCliente] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [documento, setDocumento] = useState(DOCUMENTOS[0].campo);
  const [motivo, setMotivo] = useState("");
  const [modoObservar, setModoObservar] = useState(false);
  // Bloques de comisión creados por el administrador. El gestor elige
  // uno; ya no escribe un porcentaje suelto que no se conectaba con
  // ninguna tarifa del sistema.
  const [bloques, setBloques] = useState([]);
  const [bloqueId, setBloqueId] = useState(null);
  const [conflicto, setConflicto] = useState(null);
  // Quien la tiene, cuando la abre alguien que no es su dueño.
  const [ajeno, setAjeno] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  const router = useRouter();
  const params = useParams();

  const cargar = useCallback(async () => {
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (!user) {
      router.push("/kyc");
      return;
    }
    setCliente(user);

    // Abrir una ficha libre la toma, igual que en solicitudes: hasta
    // ahora se podía estar revisando a un cliente y, para el resto del
    // equipo, la identidad seguía libre en la cola.
    if (user.estado === "pendiente" || user.estado === "observado") {
      const r = await tomarCaso("kyc", params.id);
      if (!r.ok && r.motivo === "TOMADO") setAjeno(r);
    }

    // Bloques de comision para elegir al aprobar. Los crea el admin.
    const { data: bloquesData } = await supabase.rpc("listar_bloques");
    const lista = bloquesData || [];
    setBloques(lista);
    // Si el cliente no tiene bloque, se propone el predeterminado.
    setBloqueId((actual) => actual || lista.find((b) => b.es_default)?.id || null);

    const { data: perfilData } = await supabase
      .from("perfiles_cliente")
      .select("*")
      .eq("user_id", params.id)
      .maybeSingle();

    // Se firma el path guardado en la columna en vez de reconstruirlo a
    // mano. Antes se asumia el nombre "<uid>/<campo>.jpg", asi que una
    // foto reenviada con otro nombre se veia rota.
    if (perfilData) {
      const { urls, fallos } = await urlsFirmadas(
        BUCKET,
        DOCUMENTOS.map((d) => perfilData[d.campo]),
      );
      for (const d of DOCUMENTOS) {
        const path = extraerPath(BUCKET, perfilData[d.campo]);
        perfilData[`${d.campo}_url`] = path ? urls[path] || null : null;
        perfilData[`${d.campo}_path`] = path;
        perfilData[`${d.campo}_error`] = path
          ? urls[path]
            ? null
            : fallos[path] || "No se pudo firmar el archivo."
          : null;
      }
      setBloqueId(perfilData.bloque_id || null);
    }

    setPerfil(perfilData);
    setLoading(false);
  }, [params.id, router]);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "supervisor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargar();
    });
  }, [router, cargar]);

  async function aprobar() {
    if (!perfil) {
      setError("Este cliente aún no subió sus documentos, así que no se puede aprobar.");
      return;
    }
    if (!bloqueId) {
      setError("Elige el bloque de comisiones que le corresponde.");
      return;
    }

    setAccion("aprobando");
    setError("");

    // El bloque primero: si el estado cambiara antes y esto fallara, el
    // cliente quedaria activo sin tarifa asignada.
    const rBloque = await actualizar(
      "perfiles_cliente",
      { user_id: params.id },
      { bloque_id: bloqueId },
    );
    if (!rBloque.ok) {
      setAccion(null);
      setError("No se pudo asignar el bloque: " + rBloque.error);
      return;
    }

    // resolver_caso comprueba que nadie más lo esté revisando, activa la
    // cuenta, marca quién validó y avisa al cliente, todo de una vez.
    const r = await resolverCaso({ tipo: "kyc", id: params.id, aprobar: true });
    setAccion(null);

    if (!r.ok) {
      if (r.motivo === "TOMADO" || r.motivo === "RESUELTO") setConflicto(r);
      else setError(r.mensaje);
      return;
    }

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "ASIGNAR_BLOQUE",
      entidad: "perfiles_cliente",
      entidad_id: perfil.id,
      datos_despues: { bloque_id: bloqueId },
    });

    await siguienteOSalir();
  }

  async function observar() {
    const texto = motivo.trim();
    // El cliente lee este texto en la app y es lo unico que le dice que
    // corregir, asi que no puede ser una palabra suelta.
    if (texto.length < MIN_MOTIVO) {
      setError(
        `Explica la observación con al menos ${MIN_MOTIVO} caracteres: el cliente la va a leer en su app.`,
      );
      return;
    }
    if (!perfil) {
      setError("Este cliente aún no tiene perfil que observar.");
      return;
    }

    setAccion("observando");
    setError("");

    const r = await resolverCaso({
      tipo: "kyc",
      id: params.id,
      aprobar: false,
      motivo: texto,
    });
    setAccion(null);

    if (!r.ok) {
      if (r.motivo === "TOMADO" || r.motivo === "RESUELTO") setConflicto(r);
      else setError(r.mensaje);
      return;
    }

    // Historial de observaciones, aparte de la auditoría.
    const { error: obsError } = await supabase.from("observaciones").insert({
      entidad: "perfiles_cliente",
      entidad_id: perfil.id,
      motivo: texto,
      creado_por: session.user.id,
    });
    if (obsError) console.warn("Observaciones:", obsError.message);

    await siguienteOSalir();
  }

  /**
   * Terminada una ficha, se abre la siguiente sin volver a la lista. Si
   * no queda ninguna, la lista lo dice con una ventana.
   */
  async function siguienteOSalir() {
    if (session?.rol !== "gestor") return router.push("/kyc");
    const { id, vacia } = await tomarSiguiente("kyc");
    if (!vacia && id) return router.push(`/kyc/${id}`);
    router.push("/kyc?vacia=1");
  }

  if (loading || !session)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Cargando...
      </div>
    );

  const nombre = perfil
    ? `${perfil.nombres} ${perfil.apellidos}`
    : "Registro sin completar";
  const docActual = DOCUMENTOS.find((d) => d.campo === documento);
  const puedeResolver = ["gestor", "admin"].includes(session?.rol);
  const resoluble =
    puedeResolver &&
    (cliente?.estado === "pendiente" || cliente?.estado === "observado");

  return (
    <Shell
      session={session}
      titulo={nombre}
      descripcion={cliente?.email}
      acciones={
        <Link
          href="/kyc"
          className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-muted"
        >
          Volver a la lista
        </Link>
      }
    >
      {error && (
        <div className="mb-5">
          <Aviso titulo="No se pudo completar" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        </div>
      )}

      {!perfil && (
        <div className="mb-5">
          <Aviso tono="espera" titulo="Este cliente no subió sus documentos">
            Creó la cuenta pero no completó el paso de verificación. Desde la
            app puede terminarlo en la pantalla de cuenta en revisión.
          </Aviso>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_400px]">
        {/* ── Documentos ── */}
        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1">
            {DOCUMENTOS.map((d) => {
              const activo = documento === d.campo;
              const falta = perfil && !perfil[`${d.campo}_url`];
              return (
                <button
                  key={d.campo}
                  onClick={() => setDocumento(d.campo)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[13px] font-medium transition",
                    activo
                      ? "bg-card text-foreground shadow-panel"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="truncate">{d.titulo}</span>
                  {falta && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  )}
                </button>
              );
            })}
          </div>

          <Visor
            url={perfil?.[`${documento}_url`]}
            error={perfil?.[`${documento}_error`]}
            path={perfil?.[`${documento}_path`]}
            titulo={docActual?.titulo}
            alto="h-[520px]"
          />

          <div className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Qué comprobar
            </p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-foreground">
              <li>
                El DNI del documento coincide con{" "}
                <span className="cifras font-mono font-semibold">
                  {perfil?.dni || "—"}
                </span>
                .
              </li>
              <li>El nombre del documento coincide con {nombre}.</li>
              <li>El rostro de la selfie es el mismo que el del DNI.</li>
              <li>El documento está vigente y se lee con claridad.</li>
            </ul>
          </div>
        </section>

        {/* ── Datos y resolución ── */}
        <section className="min-w-0 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">Datos declarados</h3>
              <Estado valor={cliente?.estado} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato etiqueta="Nombres">{perfil?.nombres}</Dato>
              <Dato etiqueta="Apellidos">{perfil?.apellidos}</Dato>
              <Dato etiqueta="DNI" mono>
                {perfil?.dni}
              </Dato>
              <Dato etiqueta="Teléfono" mono>
                {perfil?.telefono}
              </Dato>
              <Dato etiqueta="Dirección" className="col-span-2">
                {perfil?.direccion}
              </Dato>
              <Dato etiqueta="Código promocional">{perfil?.codigo_promo}</Dato>
              <Dato etiqueta="Registrado">
                {fechaLarga(cliente?.created_at)}
              </Dato>
            </dl>
          </div>

          {perfil?.motivo_observacion && cliente?.estado === "observado" && (
            <div className="rounded-xl border-l-[3px] border-red-500 bg-red-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
                Observación vigente
              </p>
              <p className="mt-1 text-sm text-red-900">
                {perfil.motivo_observacion}
              </p>
            </div>
          )}

          {cliente?.estado === "activo" && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
              <h3 className="mb-3 text-[13px] font-semibold">Verificación</h3>
              <dl className="space-y-3">
                <Dato etiqueta="Validado el">
                  {fechaLarga(perfil?.fecha_validacion)}
                </Dato>
                <Dato etiqueta="Bloque de comisiones">
                  {bloques.find((b) => b.id === perfil?.bloque_id)?.nombre}
                </Dato>
              </dl>
            </div>
          )}

          {ajeno && (
            <div className="flex items-start gap-3 rounded-xl border border-oro-300/60 bg-oro-50 p-4">
              <span className="text-lg leading-none">👀</span>
              <p className="text-[0.8667rem] leading-relaxed text-oro-700">
                <strong>{ajeno.quien}</strong> está revisando a este cliente.
                Puedes mirar sus documentos, pero resolverlo es suyo hasta que
                pasen {ajeno.libre_en} min sin que lo haga.
              </p>
            </div>
          )}

          {resoluble && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
              {!modoObservar ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[13px] font-semibold">
                      Bloque de comisiones
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Define su tarifa en cada banco. Las crea el
                      administrador; aquí solo eliges cuál le toca.
                    </p>

                    <div className="mt-2 space-y-1.5">
                      {bloques.length === 0 ? (
                        <p className="rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                          Todavía no hay bloques creados. Pídele al
                          administrador que cree al menos uno.
                        </p>
                      ) : (
                        bloques.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => setBloqueId(b.id)}
                            className={cn(
                              "pulsable w-full rounded-lg border p-2.5 text-left",
                              bloqueId === b.id
                                ? "border-marca-400 bg-marca-50"
                                : "border-border hover:bg-muted",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-[0.8667rem] font-semibold text-foreground">
                                {b.nombre}
                              </span>
                              {b.es_default && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  por defecto
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                              {(b.bancos || [])
                                .map((x) => `${x.banco} ${x.porcentaje}%`)
                                .join(" · ") || "Sin tarifas cargadas"}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border pt-4">
                    <button
                      onClick={aprobar}
                      disabled={accion !== null || !perfil || !bloqueId || Boolean(ajeno)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                      {accion === "aprobando"
                        ? "Aprobando..."
                        : "Aprobar y activar cuenta"}
                    </button>
                    <button
                      onClick={() => setModoObservar(true)}
                      disabled={accion !== null || !perfil || Boolean(ajeno)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    >
                      <Cruz className="h-4 w-4" />
                      Observar documentos
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-[13px] font-semibold">
                      Qué debe corregir
                    </label>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      El cliente lo lee en su app y puede volver a subir las
                      fotos desde ahí.
                    </p>
                  </div>
                  <textarea
                    autoFocus
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={4}
                    placeholder="Ej: La selfie no deja ver el DNI completo. Tómala sosteniendo el documento junto a tu rostro."
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
                        setModoObservar(false);
                        setMotivo("");
                      }}
                      className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={observar}
                      disabled={
                        accion !== null || motivo.trim().length < MIN_MOTIVO
                      }
                      className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
                    >
                      {accion === "observando"
                        ? "Enviando..."
                        : "Enviar observación"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      {/* Al cerrar se vuelve a la cola: esta ficha ya no es suya. */}
      <Conflicto
        mensaje={conflicto?.mensaje}
        titulo={conflicto?.titulo}
        onCerrar={() => {
          setConflicto(null);
          router.push("/kyc");
        }}
      />
    </Shell>
  );
}
