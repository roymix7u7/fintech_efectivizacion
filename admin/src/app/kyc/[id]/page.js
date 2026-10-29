"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { urlsFirmadas, extraerPath } from "@/lib/storage";
import { actualizar, registrarAuditoria } from "@/lib/acciones";
import { resolverCaso, tomarCaso } from "@/lib/casos";
import { tomarSiguiente } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Check, Cruz, Candado } from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import { Estado, Dato, Aviso } from "@/components/marca";
import { CargaPantalla, BotonAccion } from "@/components/carga";
import {
  Panel,
  Segmentos,
  Motivo,
  Copiar,
  Comprobacion,
} from "@/components/piezas";
import Pista from "@/components/pista";

const BUCKET = "kyc-documentos";
const MIN_MOTIVO = 10;

const DOCUMENTOS = [
  {
    campo: "foto_dni_frontal",
    titulo: "Frente",
    pista: "Foto y datos del documento",
  },
  {
    campo: "foto_dni_posterior",
    titulo: "Reverso",
    pista: "Código de barras y dirección",
  },
  {
    campo: "foto_selfie",
    titulo: "Selfie",
    pista: "El cliente sosteniendo su documento",
  },
];

const OBSERVACIONES_FRECUENTES = [
  "La foto del documento está borrosa. Vuelve a tomarla con buena luz y sin reflejos.",
  "La selfie no deja ver el documento completo. Tómala sosteniéndolo junto a tu rostro.",
  "El documento está vencido. Sube uno vigente.",
  "Los datos que escribiste no coinciden con tu documento. Corrígelos y vuelve a enviarlos.",
];

const NOMBRES_CONSENTIMIENTO = {
  terminos: "Términos y condiciones",
  privacidad: "Política de privacidad",
  biometria: "Autorización de fotos de identidad",
};

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
  // Lo que aceptó el cliente (términos, privacidad, fotos): la
  // constancia ante un reclamo.
  const [aceptaciones, setAceptaciones] = useState([]);
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
  const [modoBloqueo, setModoBloqueo] = useState(false);
  const [motivoBloqueo, setMotivoBloqueo] = useState("");
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  // Lo que el revisor confirma haber mirado. Aprobar espera a que esté todo.
  const [revisado, setRevisado] = useState({});
  const router = useRouter();
  const params = useParams();

  const cargar = useCallback(
    async (rol) => {
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
      //
      // El supervisor no: entra a mirar cómo va el trabajo, y si abrir le
      // reservara el caso se lo quitaría al gestor que lo tiene entre
      // manos, además de aparecerle a él como "tuya".
      // El rol llega por argumento y no del estado: cargar() corre en
      // el mismo tick en que se guarda la sesión, cuando session todavía
      // es null. En las recargas posteriores no se pasa, y entonces no
      // hay nada que tomar: el caso ya está en tus manos.
      const puedeTomar = ["gestor", "admin"].includes(rol);
      if (
        puedeTomar &&
        (user.estado === "pendiente" || user.estado === "observado")
      ) {
        const r = await tomarCaso("kyc", params.id);
        if (!r.ok && r.motivo === "TOMADO") setAjeno(r);
      }

      // Bloques de comision para elegir al aprobar. Los crea el admin.
      const { data: bloquesData } = await supabase.rpc("listar_bloques");
      const lista = bloquesData || [];
      setBloques(lista);
      // Si el cliente no tiene bloque, se propone el predeterminado.
      setBloqueId(
        (actual) => actual || lista.find((b) => b.es_default)?.id || null,
      );

      const [{ data: perfilData }, { data: consentimientos }] =
        await Promise.all([
          supabase
            .from("perfiles_cliente")
            .select("*")
            .eq("user_id", params.id)
            .maybeSingle(),
          supabase
            .from("consentimientos")
            .select("id, tipo, version, aceptado_en, dispositivo")
            .eq("user_id", params.id)
            .order("aceptado_en", { ascending: false }),
        ]);
      setAceptaciones(consentimientos || []);

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
    },
    [params.id, router],
  );

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "supervisor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargar(s.rol);
    });
  }, [router, cargar]);

  async function aprobar() {
    if (!perfil) {
      setError(
        "Este cliente aún no subió sus documentos, así que no se puede aprobar.",
      );
      return;
    }
    if (!bloqueId) {
      setError("Elige la tarifa que le corresponde.");
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
      setError("No se pudo asignar el cupón: " + rBloque.error);
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
   * Cierra o reabre la cuenta de un cliente.
   *
   * Es de supervisor y administrador: el gestor revisa documentos, pero
   * cerrarle la cuenta a alguien es otra cosa. Sirve en cualquier
   * estado, también con la cuenta ya aprobada, porque el motivo para
   * cerrarla suele aparecer después de haberla abierto.
   */
  async function cambiarBloqueo(bloquear) {
    const texto = motivoBloqueo.trim();
    if (bloquear && texto.length < MIN_MOTIVO) {
      setError(
        `Explica el motivo con al menos ${MIN_MOTIVO} caracteres: el cliente lo va a leer al intentar entrar.`,
      );
      return;
    }

    setAccion(bloquear ? "bloqueando" : "desbloqueando");
    setError("");

    const { data, error: e } = await supabase.rpc("bloquear_cliente", {
      p_id: params.id,
      p_bloquear: bloquear,
      p_motivo: bloquear ? texto : null,
    });
    setAccion(null);

    if (e) {
      setError(
        e.code === "P0001" ? e.message : "No se pudo completar: " + e.message,
      );
      return;
    }
    if (!data?.ok) {
      setError("La cuenta ya estaba en ese estado. Se actualizó la ficha.");
    }

    setModoBloqueo(false);
    setMotivoBloqueo("");
    await cargar(session?.rol);
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
    return <CargaPantalla texto="Cargando la ficha..." />;

  const nombre = perfil
    ? `${perfil.nombres} ${perfil.apellidos}`
    : "Registro sin completar";
  const docActual = DOCUMENTOS.find((d) => d.campo === documento);
  const tipoDoc =
    perfil?.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI";
  const puedeResolver = ["gestor", "admin"].includes(session?.rol);
  // Cerrar una cuenta es del supervisor y del administrador.
  const puedeBloquear = ["supervisor", "admin"].includes(session?.rol);
  const resoluble =
    puedeResolver &&
    (cliente?.estado === "pendiente" || cliente?.estado === "observado");

  const COMPROBAR = [
    {
      clave: "numero",
      texto: (
        <>
          El número del documento coincide con{" "}
          <span className="cifras font-mono font-bold">
            {perfil?.dni || "—"}
          </span>
          .
        </>
      ),
    },
    {
      clave: "nombre",
      texto: (
        <>
          El nombre del documento coincide con <strong>{nombre}</strong>.
        </>
      ),
    },
    {
      clave: "rostro",
      texto:
        "El rostro de la selfie es el mismo que el de la foto del documento.",
    },
    {
      clave: "vigente",
      texto: "El documento está vigente y se lee con claridad.",
    },
  ];
  const todoRevisado = COMPROBAR.every((c) => revisado[c.clave]);
  const faltaAprobar = !perfil
    ? "El cliente aún no subió sus documentos."
    : !bloqueId
      ? "Elige la tarifa del cliente."
      : !todoRevisado
        ? "Marca todo lo de la lista de comprobación."
        : ajeno
          ? "Otra persona tiene este caso."
          : null;

  const faltaConsentimiento = Object.keys(NOMBRES_CONSENTIMIENTO).filter(
    (t) => !aceptaciones.some((a) => a.tipo === t),
  );

  return (
    <Shell
      session={session}
      titulo={nombre}
      descripcion={cliente?.email}
      volver={{ href: "/kyc", texto: "Volver a la lista" }}
      acciones={<Estado valor={cliente?.estado} />}
    >
      {error && (
        <Aviso
          className="mb-4"
          titulo="No se pudo completar"
          onCerrar={() => setError("")}
        >
          {error}
        </Aviso>
      )}

      {!perfil && (
        <Aviso
          className="mb-4"
          tono="espera"
          titulo="Este cliente no subió sus documentos"
        >
          Creó la cuenta pero no completó la verificación. Puede terminarla
          desde la app, en la pantalla de cuenta en revisión.
        </Aviso>
      )}

      {ajeno && (
        <Aviso
          className="mb-4"
          tono="espera"
          titulo={`${ajeno.quien} está revisando a este cliente`}
        >
          Puedes mirar sus documentos, pero resolverlo es suyo hasta que pasen{" "}
          {ajeno.libre_en} min sin que lo haga.
        </Aviso>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── Documentos ── */}
        <section className="min-w-0 space-y-3">
          <Segmentos
            valor={documento}
            onCambio={setDocumento}
            opciones={DOCUMENTOS.map((d) => ({
              clave: d.campo,
              etiqueta: d.titulo,
              pista:
                perfil && !perfil[`${d.campo}_url`]
                  ? `${d.pista}. No se pudo cargar o falta.`
                  : d.pista,
              icono:
                perfil && !perfil[`${d.campo}_url`] ? (
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                ) : null,
            }))}
          />

          <Visor
            url={perfil?.[`${documento}_url`]}
            error={perfil?.[`${documento}_error`]}
            path={perfil?.[`${documento}_path`]}
            titulo={`${tipoDoc} · ${docActual?.titulo}`}
            alto="h-[min(600px,62vh)]"
          />

          {resoluble && (
            <Comprobacion
              items={COMPROBAR}
              marcados={revisado}
              onCambio={setRevisado}
              ayuda="Marcar cada punto confirma que lo miraste. El botón de aprobar se activa con todo marcado."
            />
          )}
        </section>

        {/* ── Datos y resolución ── */}
        <section className="min-w-0 space-y-4">
          {resoluble && (
            <Panel
              titulo={modoObservar ? "Observar los documentos" : "Resolver"}
              tono={modoObservar ? "peligro" : undefined}
            >
              {!modoObservar ? (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <p className="text-sm font-semibold">
                        Tarifa del cliente
                      </p>
                      <Pista texto="Lo normal es la tarifa estándar, la publicada en la web. Si eliges un cupón, rige desde hoy por su duración y al vencer vuelve a la estándar." />
                    </div>
                    {bloques.length === 0 ? (
                      <Aviso tono="espera">
                        Todavía no hay cupones. Pídele al administrador que cree
                        al menos uno.
                      </Aviso>
                    ) : (
                      <div
                        className="space-y-1.5"
                        role="radiogroup"
                        aria-label="Tarifa del cliente"
                      >
                        {bloques.map((b) => (
                          <button
                            key={b.id}
                            role="radio"
                            aria-checked={bloqueId === b.id}
                            onClick={() => setBloqueId(b.id)}
                            className={cn(
                              "pulsable flex w-full items-start gap-3 rounded-lg border p-2.5 text-left",
                              bloqueId === b.id
                                ? "border-marca-500 bg-marca-50 ring-1 ring-marca-500"
                                : "border-border hover:bg-muted/60",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                                bloqueId === b.id
                                  ? "border-marca-600"
                                  : "border-marca-200",
                              )}
                            >
                              {bloqueId === b.id && (
                                <span className="h-2 w-2 rounded-full bg-marca-600" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="text-sm font-bold text-foreground">
                                  {b.es_default ? "Tarifa estándar" : b.nombre}
                                </span>
                                {b.es_default ? (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                                    recomendada
                                  </span>
                                ) : b.duracion_dias ? (
                                  <span className="rounded bg-oro-50 px-1.5 py-0.5 text-xs font-semibold text-oro-700">
                                    cupón · {b.duracion_dias} días
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block truncate text-chico text-muted-foreground">
                                {(b.bancos || [])
                                  .map(
                                    (x) =>
                                      `${x.banco === "Otros" ? "Otro" : x.banco} ${Number(x.porcentaje)}%`,
                                  )
                                  .join(" · ") || "Sin tarifas cargadas"}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-[1fr_auto] xl:grid-cols-1 2xl:grid-cols-[1fr_auto]">
                    <Pista texto={faltaAprobar} className="block w-full">
                      <BotonAccion
                        onClick={aprobar}
                        cargando={accion === "aprobando"}
                        disabled={accion !== null || Boolean(faltaAprobar)}
                        tono="exito"
                        tamano="grande"
                        className="w-full"
                        icono={<Check className="h-5 w-5" />}
                      >
                        {accion === "aprobando"
                          ? "Aprobando..."
                          : "Aprobar y activar cuenta"}
                      </BotonAccion>
                    </Pista>
                    <BotonAccion
                      onClick={() => setModoObservar(true)}
                      disabled={accion !== null || !perfil || Boolean(ajeno)}
                      tono="peligroSuave"
                      tamano="grande"
                      icono={<Cruz className="h-4 w-4" />}
                    >
                      Observar
                    </BotonAccion>
                  </div>
                </div>
              ) : (
                <div className="animate-aparecer space-y-3">
                  <Motivo
                    id="motivo"
                    etiqueta="Qué debe corregir"
                    ayuda="El cliente lo lee en su app y puede volver a subir las fotos desde ahí."
                    valor={motivo}
                    onCambio={setMotivo}
                    minimo={MIN_MOTIVO}
                    filas={4}
                    sugerencias={OBSERVACIONES_FRECUENTES}
                    placeholder="Ej: La selfie no deja ver el DNI completo. Tómala sosteniendo el documento junto a tu rostro."
                  />
                  <div className="flex justify-end gap-2">
                    <BotonAccion
                      tono="neutro"
                      onClick={() => {
                        setModoObservar(false);
                        setMotivo("");
                      }}
                    >
                      Cancelar
                    </BotonAccion>
                    <BotonAccion
                      tono="peligro"
                      onClick={observar}
                      cargando={accion === "observando"}
                      disabled={
                        accion !== null || motivo.trim().length < MIN_MOTIVO
                      }
                    >
                      Enviar observación
                    </BotonAccion>
                  </div>
                </div>
              )}
            </Panel>
          )}

          <Panel titulo="Datos declarados">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato etiqueta="Nombres">{perfil?.nombres}</Dato>
              <Dato etiqueta="Apellidos">{perfil?.apellidos}</Dato>
              <Dato
                etiqueta={tipoDoc}
                mono
                accion={
                  <Copiar
                    texto={perfil?.dni}
                    soloIcono
                    etiqueta="Copiar el número"
                  />
                }
              >
                {perfil?.dni}
              </Dato>
              <Dato
                etiqueta="Teléfono"
                mono
                accion={
                  <Copiar
                    texto={perfil?.telefono}
                    soloIcono
                    etiqueta="Copiar teléfono"
                  />
                }
              >
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
          </Panel>

          {perfil?.motivo_observacion && cliente?.estado === "observado" && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="t-etiqueta text-red-700">Observación vigente</p>
              <p className="mt-1 text-md text-red-900">
                {perfil.motivo_observacion}
              </p>
            </div>
          )}

          {cliente?.estado === "activo" && (
            <Panel titulo="Verificación">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Dato etiqueta="Validado el">
                  {fechaLarga(perfil?.fecha_validacion)}
                </Dato>
                <Dato etiqueta="Tarifa">
                  {(() => {
                    const b = bloques.find((x) => x.id === perfil?.bloque_id);
                    return !b || b.es_default ? "Tarifa estándar" : b.nombre;
                  })()}
                </Dato>
              </dl>
            </Panel>
          )}

          <Panel
            titulo="Consentimientos"
            ayuda="La constancia de lo que aceptó el cliente: versión, fecha y teléfono. Es lo que se presenta ante un reclamo."
            cuerpo="p-0"
          >
            {faltaConsentimiento.includes("biometria") && (
              <p className="border-b border-border bg-oro-50 px-4 py-2 text-chico font-medium text-oro-700">
                No consta la autorización para usar sus fotos de identidad.
              </p>
            )}
            <ul className="divide-y divide-border">
              {Object.entries(NOMBRES_CONSENTIMIENTO).map(([tipo, texto]) => {
                const a = aceptaciones.find((x) => x.tipo === tipo);
                const d = a?.dispositivo || {};
                return (
                  <li
                    key={tipo}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          a
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {a ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Cruz className="h-3 w-3" />
                        )}
                      </span>
                      <span className="truncate">{texto}</span>
                    </span>
                    {a ? (
                      <Pista
                        fin
                        texto={`Aceptada el ${fechaLarga(a.aceptado_en)}${d.plataforma ? ` · ${[d.modelo, d.plataforma, d.app && `app ${d.app}`].filter(Boolean).join(" · ")}` : ""}`}
                      >
                        <span className="cifras shrink-0 cursor-help text-chico font-semibold text-muted-foreground">
                          v{a.version}
                        </span>
                      </Pista>
                    ) : (
                      <span className="shrink-0 text-chico text-muted-foreground">
                        Sin aceptar
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* Cerrar la cuenta: fuera del bloque de revisión a propósito,
              porque sirve también cuando ya está aprobada. */}
          {puedeBloquear && cliente && (
            <Panel
              titulo={
                cliente.estado === "bloqueado"
                  ? "Cuenta bloqueada"
                  : "Acceso a la app"
              }
              icono={<Candado className="h-4 w-4" />}
              tono={
                cliente.estado === "bloqueado" || modoBloqueo
                  ? "peligro"
                  : undefined
              }
              ayuda="Bloquear cierra su entrada a la app y le impide enviar solicitudes. Se puede revertir y queda registrado con tu nombre."
            >
              {cliente.estado === "bloqueado" ? (
                <div className="space-y-3">
                  {perfil?.motivo_bloqueo && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                      {perfil.motivo_bloqueo}
                    </p>
                  )}
                  <p className="text-chico text-muted-foreground">
                    No puede entrar a la app ni enviar solicitudes.
                    {perfil?.bloqueado_en &&
                      ` Desde el ${fechaLarga(perfil.bloqueado_en)}.`}
                  </p>
                  <BotonAccion
                    tono="neutro"
                    className="w-full"
                    onClick={() => cambiarBloqueo(false)}
                    cargando={accion === "desbloqueando"}
                    disabled={accion !== null}
                  >
                    Desbloquear cuenta
                  </BotonAccion>
                </div>
              ) : !modoBloqueo ? (
                <BotonAccion
                  tono="peligroSuave"
                  className="w-full"
                  onClick={() => setModoBloqueo(true)}
                  disabled={accion !== null}
                >
                  Bloquear cuenta
                </BotonAccion>
              ) : (
                <div className="animate-aparecer space-y-3">
                  <Motivo
                    id="motivoBloqueo"
                    etiqueta="Motivo del bloqueo"
                    ayuda="El cliente lo lee al intentar entrar. Queda registrado con tu nombre."
                    valor={motivoBloqueo}
                    onCambio={setMotivoBloqueo}
                    minimo={MIN_MOTIVO}
                    placeholder="Ej: envió comprobantes que no corresponden a sus operaciones."
                  />
                  <div className="flex justify-end gap-2">
                    <BotonAccion
                      tono="neutro"
                      disabled={accion !== null}
                      onClick={() => {
                        setModoBloqueo(false);
                        setMotivoBloqueo("");
                      }}
                    >
                      Cancelar
                    </BotonAccion>
                    <BotonAccion
                      tono="peligro"
                      onClick={() => cambiarBloqueo(true)}
                      cargando={accion === "bloqueando"}
                      disabled={
                        accion !== null ||
                        motivoBloqueo.trim().length < MIN_MOTIVO
                      }
                    >
                      Bloquear
                    </BotonAccion>
                  </div>
                </div>
              )}
            </Panel>
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
