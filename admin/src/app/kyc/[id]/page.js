"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { urlsFirmadas, extraerPath } from "@/lib/storage";
import { actualizar, registrarAuditoria, notificar } from "@/lib/acciones";
import { cn } from "@/lib/utils";
import Shell, { Check, Cruz } from "@/components/shell";
import Visor from "@/components/visor";
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
  const [session, setSession] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [documento, setDocumento] = useState(DOCUMENTOS[0].campo);
  const [motivo, setMotivo] = useState("");
  const [modoObservar, setModoObservar] = useState(false);
  const [tasa, setTasa] = useState("1.00");
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
      if (perfilData.tasa_comision) setTasa(String(perfilData.tasa_comision));
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
    // Sin esta validacion, un campo vacio mandaba NaN a la base de datos.
    const valorTasa = parseFloat(tasa);
    if (!Number.isFinite(valorTasa) || valorTasa < 0 || valorTasa > 100) {
      setError("La comisión debe ser un número entre 0 y 100.");
      return;
    }
    if (!perfil) {
      setError("Este cliente aún no subió sus documentos, así que no se puede aprobar.");
      return;
    }

    setAccion("aprobando");
    setError("");

    const rPerfil = await actualizar(
      "perfiles_cliente",
      { user_id: params.id },
      {
        validado_por: session.user.id,
        fecha_validacion: new Date().toISOString(),
        tasa_comision: valorTasa,
        motivo_observacion: null,
      },
    );
    if (!rPerfil.ok) {
      setAccion(null);
      setError("No se pudo actualizar el perfil: " + rPerfil.error);
      return;
    }

    // El estado se cambia al final: si fallara antes, el cliente
    // quedaria activo sin estar marcado como validado.
    const rUser = await actualizar("users", { id: params.id }, { estado: "activo" });
    if (!rUser.ok) {
      setAccion(null);
      setError("No se pudo activar la cuenta: " + rUser.error);
      return;
    }

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "APROBAR_KYC",
      entidad: "perfiles_cliente",
      entidad_id: perfil.id,
      datos_antes: { estado: cliente?.estado },
      datos_despues: { estado: "activo", tasa_comision: valorTasa },
    });
    await notificar({
      userId: params.id,
      tipo: "kyc_aprobado",
      titulo: "Cuenta verificada",
      cuerpo:
        "Revisamos tus documentos y tu cuenta quedó activa. Ya puedes registrar tus tarjetas y operar.",
    });

    router.push("/kyc");
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

    const rPerfil = await actualizar(
      "perfiles_cliente",
      { user_id: params.id },
      { motivo_observacion: texto },
    );
    if (!rPerfil.ok) {
      setAccion(null);
      setError("No se pudo guardar la observación: " + rPerfil.error);
      return;
    }

    const rUser = await actualizar("users", { id: params.id }, { estado: "observado" });
    if (!rUser.ok) {
      setAccion(null);
      setError("No se pudo cambiar el estado: " + rUser.error);
      return;
    }

    const { error: obsError } = await supabase.from("observaciones").insert({
      entidad: "perfiles_cliente",
      entidad_id: perfil.id,
      motivo: texto,
      creado_por: session.user.id,
    });
    if (obsError) console.warn("Observaciones:", obsError.message);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "OBSERVAR_KYC",
      entidad: "perfiles_cliente",
      entidad_id: perfil.id,
      datos_antes: { estado: cliente?.estado },
      datos_despues: { estado: "observado", motivo: texto },
    });
    await notificar({
      userId: params.id,
      tipo: "kyc_observado",
      titulo: "Necesitamos corregir tus documentos",
      cuerpo: `Revisa tus documentos y vuelve a enviarlos. Motivo: ${texto}`,
    });

    router.push("/kyc");
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
  const resoluble = cliente?.estado === "pendiente" || cliente?.estado === "observado";

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
                <Dato etiqueta="Comisión asignada" mono>
                  {perfil?.tasa_comision != null
                    ? `${perfil.tasa_comision} %`
                    : null}
                </Dato>
              </dl>
            </div>
          )}

          {resoluble && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
              {!modoObservar ? (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="tasa"
                      className="block text-[13px] font-semibold"
                    >
                      Comisión del cliente
                    </label>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Queda registrada en su perfil.
                    </p>
                    <div className="relative mt-2">
                      <input
                        id="tasa"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={tasa}
                        onChange={(e) => setTasa(e.target.value)}
                        className="cifras w-full rounded-lg border border-input bg-card px-3 py-2.5 pr-8 text-sm font-mono outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border pt-4">
                    <button
                      onClick={aprobar}
                      disabled={accion !== null || !perfil}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                      {accion === "aprobando"
                        ? "Aprobando..."
                        : "Aprobar y activar cuenta"}
                    </button>
                    <button
                      onClick={() => setModoObservar(true)}
                      disabled={accion !== null || !perfil}
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
    </Shell>
  );
}
