"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { urlsFirmadas, extraerPath } from "@/lib/storage";
import { actualizar, registrarAuditoria } from "@/lib/acciones";
import { resolverCaso, tomarCaso } from "@/lib/casos";
import { tomarSiguiente } from "@/lib/cola";
import { puede } from "@/lib/permisos";
import { cn } from "@/lib/utils";
import Shell, { Check, Cruz, Candado } from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import { Estado, Aviso } from "@/components/marca";
import { CargaPantalla, BotonAccion } from "@/components/carga";
import { Motivo, Copiar, Dialogo, IconoAlerta } from "@/components/piezas";
import Pista from "@/components/pista";
import Desplegable from "@/components/desplegable";
import AlertasCliente from "@/components/alertasCliente";
import { rehacerRostro } from "@/lib/rostros";

/**
 * Verificación de identidad de un cliente.
 *
 * Pensada para resolverse sin bajar: a la izquierda las fotos (con
 * "Comparar rostro" para ver el documento y la selfie lado a lado); a la
 * derecha, en una sola columna, los datos, lo que hay que comprobar, la
 * tarifa y los botones, que quedan siempre abajo a la vista. Observar y
 * bloquear se escriben en una ventana, sin empujar nada.
 */

const BUCKET = "kyc-documentos";
const MIN_MOTIVO = 10;

const DOCUMENTOS = [
  { campo: "foto_dni_frontal", titulo: "Frente", pista: "Foto y datos del documento" },
  { campo: "foto_dni_posterior", titulo: "Reverso", pista: "Código de barras y dirección" },
  { campo: "foto_selfie", titulo: "Selfie", pista: "El cliente sosteniendo su documento" },
];
const COMPARAR = "comparar";

// Alto del visor: lo que queda de la pantalla bajo el encabezado (60),
// los márgenes (40), las miniaturas (58 + 12) y la barra del visor (46).
const ALTO_VISOR = "h-[55vh] xl:h-[calc(100dvh-220px)] xl:min-h-[340px]";

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

/** "16 nov 2026, 14:30": cabe en media columna. */
function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
  const hora = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  return `${dia}, ${hora}`;
}

const tarifasDe = (b) =>
  (b?.bancos || []).map((x) => `${x.banco === "Otros" ? "Otro" : x.banco} ${Number(x.porcentaje)}%`).join(" · ") ||
  "Sin tarifas cargadas";

export default function KYCDetallePage() {
  const [session, setSession] = useState(sesionEnCache);
  const [cliente, setCliente] = useState(null);
  const [perfil, setPerfil] = useState(null);
  // Lo que aceptó el cliente (términos, privacidad, fotos): la
  // constancia ante un reclamo.
  const [aceptaciones, setAceptaciones] = useState([]);
  const [vista, setVista] = useState(DOCUMENTOS[0].campo);
  const [motivo, setMotivo] = useState("");
  const [modoObservar, setModoObservar] = useState(false);
  // Bloques de comisión creados por el administrador. El gestor elige uno.
  const [bloques, setBloques] = useState([]);
  const [bloqueId, setBloqueId] = useState(null);
  const [conflicto, setConflicto] = useState(null);
  // Quien la tiene, cuando la abre alguien que no es su dueño.
  const [ajeno, setAjeno] = useState(null);
  const [modoBloqueo, setModoBloqueo] = useState(false);
  const [motivoBloqueo, setMotivoBloqueo] = useState("");
  const [verMas, setVerMas] = useState(false);
  // Resultado de nombre contra DNI (lo trae AlertasCliente).
  const [identidad, setIdentidad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  // Lo que el revisor confirma haber mirado. Aprobar espera a que esté todo.
  const [revisado, setRevisado] = useState({});
  const router = useRouter();
  const params = useParams();

  const cargar = useCallback(
    async (rol) => {
      // Todo lo que no depende de otra cosa se pide junto: la ficha abre en
      // un solo viaje al servidor en vez de cinco seguidos.
      const [{ data: user }, { data: bloquesData }, { data: perfilData }, { data: consentimientos }] = await Promise.all([
        supabase.from("users").select("*").eq("id", params.id).maybeSingle(),
        // Bloques de comision para elegir al aprobar. Los crea el admin.
        supabase.rpc("listar_bloques"),
        supabase.from("perfiles_cliente").select("*").eq("user_id", params.id).maybeSingle(),
        supabase
          .from("consentimientos")
          .select("id, tipo, version, aceptado_en, dispositivo")
          .eq("user_id", params.id)
          .order("aceptado_en", { ascending: false }),
      ]);

      if (!user) {
        router.push("/kyc");
        return;
      }
      setCliente(user);

      // Abrir una ficha libre la toma (gestor y administrador). El
      // supervisor entra a mirar: no se la quita a quien la tiene. El rol
      // llega por argumento porque cargar() corre antes de guardar la sesión.
      // Va a la par de la firma de las fotos.
      const puedeTomar = ["gestor", "admin"].includes(rol);
      const tomando =
        puedeTomar && (user.estado === "pendiente" || user.estado === "observado")
          ? tomarCaso("kyc", params.id).then((r) => {
              if (!r.ok && r.motivo === "TOMADO") setAjeno(r);
            })
          : null;

      const lista = bloquesData || [];
      setBloques(lista);
      // Si el cliente no tiene bloque, se propone el predeterminado.
      setBloqueId((actual) => actual || lista.find((b) => b.es_default)?.id || null);
      setAceptaciones(consentimientos || []);

      // Se firma el path guardado en la columna en vez de reconstruirlo a
      // mano: una foto reenviada con otro nombre se veía rota.
      if (perfilData) {
        const { urls, fallos } = await urlsFirmadas(
          BUCKET,
          DOCUMENTOS.map((d) => perfilData[d.campo]),
        );
        for (const d of DOCUMENTOS) {
          const path = extraerPath(BUCKET, perfilData[d.campo]);
          perfilData[`${d.campo}_url`] = path ? urls[path] || null : null;
          perfilData[`${d.campo}_path`] = path;
          perfilData[`${d.campo}_error`] = path ? (urls[path] ? null : fallos[path] || "No se pudo firmar el archivo.") : null;
        }
        if (perfilData.bloque_id) setBloqueId(perfilData.bloque_id);
      }

      // Antes de mostrar, se sabe si otra persona lo tiene (los botones no parpadean).
      await tomando;
      setPerfil(perfilData);
      setLoading(false);
    },
    [params.id, router],
  );

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "supervisor", "admin"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
      cargar(s.rol);
    });
  }, [router, cargar]);

  async function aprobar() {
    if (!perfil) {
      setError("Este cliente aún no subió sus documentos, así que no se puede aprobar.");
      return;
    }
    if (!bloqueId) {
      setError("Elige la tarifa que le corresponde.");
      return;
    }

    setAccion("aprobando");
    setError("");

    // El bloque primero: si el estado cambiara antes y esto fallara, el
    // cliente quedaría activo sin tarifa asignada.
    const rBloque = await actualizar("perfiles_cliente", { user_id: params.id }, { bloque_id: bloqueId });
    if (!rBloque.ok) {
      setAccion(null);
      setError("No se pudo asignar la tarifa: " + rBloque.error);
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

    // La foto del rostro para el chat, con la selfie que se acaba de aprobar.
    await rehacerRostro(params.id, perfil.foto_selfie_url);

    await siguienteOSalir();
  }

  async function observar() {
    const texto = motivo.trim();
    // El cliente lee este texto en la app y es lo único que le dice qué
    // corregir, así que no puede ser una palabra suelta.
    if (texto.length < MIN_MOTIVO) return;
    if (!perfil) {
      setError("Este cliente aún no tiene perfil que observar.");
      return;
    }

    setAccion("observando");
    setError("");

    const r = await resolverCaso({ tipo: "kyc", id: params.id, aprobar: false, motivo: texto });
    setAccion(null);

    if (!r.ok) {
      setModoObservar(false);
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
   * Cierra o reabre la cuenta de un cliente. Es de supervisor y
   * administrador, y sirve en cualquier estado: el motivo para cerrarla
   * suele aparecer después de haberla abierto.
   */
  async function cambiarBloqueo(bloquear) {
    const texto = motivoBloqueo.trim();
    if (bloquear && texto.length < MIN_MOTIVO) return;

    setAccion(bloquear ? "bloqueando" : "desbloqueando");
    setError("");

    const { data, error: e } = await supabase.rpc("bloquear_cliente", {
      p_id: params.id,
      p_bloquear: bloquear,
      p_motivo: bloquear ? texto : null,
    });
    setAccion(null);
    setModoBloqueo(false);

    if (e) {
      setError(e.code === "P0001" ? e.message : "No se pudo completar: " + e.message);
      return;
    }
    if (!data?.ok) setError("La cuenta ya estaba en ese estado. Se actualizó la ficha.");

    setMotivoBloqueo("");
    await cargar(session?.rol);
  }

  /** Terminada una ficha, se abre la siguiente sin volver a la lista. */
  async function siguienteOSalir() {
    if (session?.rol !== "gestor") return router.push("/kyc");
    const { id, vacia } = await tomarSiguiente("kyc");
    if (!vacia && id) return router.push(`/kyc/${id}`);
    router.push("/kyc?vacia=1");
  }

  if (loading || !session) return <CargaPantalla texto="Cargando la ficha..." />;

  const nombre = perfil ? `${perfil.nombres} ${perfil.apellidos}` : "Registro sin completar";
  const tipoDoc = perfil?.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI";
  const puedeResolver = ["gestor", "admin"].includes(session?.rol);
  // Recortes del super administrador (pantalla Accesos).
  const puedeAprobar = puede(session, "kyc.aprobar");
  const puedeObservar = puede(session, "kyc.observar");
  // Cerrar una cuenta es del supervisor y del administrador (el permiso
  // es el mismo que en Clientes).
  const puedeBloquear = ["supervisor", "admin"].includes(session?.rol) && puede(session, "clientes.bloquear");
  const resoluble = puedeResolver && (cliente?.estado === "pendiente" || cliente?.estado === "observado");

  const reniecOk = identidad?.resultado === "coincide";
  const COMPROBAR = [
    {
      clave: "numero",
      ver: "foto_dni_frontal",
      titulo: "Número del documento",
      valor: <span className="cifras font-mono">{perfil?.dni || "—"}</span>,
    },
    {
      clave: "nombre",
      ver: "foto_dni_frontal",
      titulo: "Nombre del documento",
      valor: nombre,
      sello: reniecOk ? "RENIEC ✓" : null,
    },
    {
      clave: "rostro",
      ver: COMPARAR,
      titulo: "Mismo rostro en selfie y documento",
    },
    {
      clave: "vigente",
      ver: "foto_dni_frontal",
      titulo: "Documento vigente y legible",
    },
  ];
  const listos = COMPROBAR.filter((c) => revisado[c.clave]).length;
  const todoRevisado = listos === COMPROBAR.length;
  const faltaAprobar = !perfil
    ? "El cliente aún no subió sus documentos."
    : !bloqueId
      ? "Elige la tarifa del cliente."
      : !todoRevisado
        ? `Comprueba lo que falta (${listos} de ${COMPROBAR.length}).`
        : ajeno
          ? "Otra persona tiene este caso."
          : null;

  const faltaConsentimiento = Object.keys(NOMBRES_CONSENTIMIENTO).filter((t) => !aceptaciones.some((a) => a.tipo === t));
  const bloqueElegido = bloques.find((b) => b.id === bloqueId);
  const bloqueActual = bloques.find((x) => x.id === perfil?.bloque_id);

  const docDe = (campo) => ({
    url: perfil?.[`${campo}_url`],
    error: perfil?.[`${campo}_error`],
    path: perfil?.[`${campo}_path`],
  });

  return (
    <Shell
      session={session}
      titulo={nombre}
      descripcion={cliente?.email}
      volver={{ href: "/kyc", texto: "Volver a la lista" }}
      acciones={<Estado valor={cliente?.estado} />}
    >
      <div className="grid gap-4 xl:h-[calc(100dvh-100px)] xl:min-h-[560px] xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Fotos ── */}
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label="Documentos">
            {DOCUMENTOS.map((d) => {
              const url = perfil?.[`${d.campo}_url`];
              const activo = vista === d.campo;
              return (
                <button
                  key={d.campo}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => setVista(d.campo)}
                  title={d.pista}
                  className={cn(
                    "pulsable flex shrink-0 items-center gap-2.5 rounded-xl border bg-card py-1.5 pl-1.5 pr-3.5 text-left transition",
                    activo ? "border-marca-500 ring-1 ring-marca-500" : "border-border hover:border-marca-300",
                  )}
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-red-500">
                        <Cruz className="h-4 w-4" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-bold", activo ? "text-marca-700" : "text-foreground")}>{d.titulo}</span>
                    <span className={cn("block text-xs", url ? "text-muted-foreground" : "font-semibold text-red-600")}>
                      {url ? d.pista.split(" ").slice(0, 3).join(" ") : "Falta o no carga"}
                    </span>
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              aria-selected={vista === COMPARAR}
              onClick={() => setVista(COMPARAR)}
              title="El documento y la selfie lado a lado"
              className={cn(
                "pulsable flex shrink-0 items-center gap-2.5 rounded-xl border py-1.5 pl-1.5 pr-3.5 text-left transition",
                vista === COMPARAR
                  ? "border-marca-500 bg-marca-50 ring-1 ring-marca-500"
                  : "border-dashed border-marca-300 bg-card hover:border-marca-500",
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                  <rect x="2.5" y="5" width="8" height="14" rx="1.5" />
                  <rect x="13.5" y="5" width="8" height="14" rx="1.5" />
                  <circle cx="17.5" cy="10.5" r="1.8" />
                  <path d="M15.3 15.5c.5-1.2 1.3-1.8 2.2-1.8s1.7.6 2.2 1.8" />
                </svg>
              </span>
              <span>
                <span className="block text-sm font-bold text-foreground">Comparar rostro</span>
                <span className="block text-xs text-muted-foreground">Frente y selfie juntos</span>
              </span>
            </button>
          </div>

          {vista === COMPARAR ? (
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <Visor {...docDe("foto_dni_frontal")} titulo={`${tipoDoc} · Frente`} alto={ALTO_VISOR} />
              <Visor {...docDe("foto_selfie")} titulo="Selfie" alto={ALTO_VISOR} />
            </div>
          ) : (
            <Visor
              {...docDe(vista)}
              titulo={`${tipoDoc} · ${DOCUMENTOS.find((d) => d.campo === vista)?.titulo}`}
              alto={ALTO_VISOR}
            />
          )}
        </section>

        {/* ── Decisión: todo en una columna, los botones siempre abajo ── */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
            {/* Avisos */}
            {(error || !perfil || ajeno || cliente?.estado === "bloqueado" || (perfil?.motivo_observacion && cliente?.estado === "observado")) && (
              <div className="space-y-2 border-b border-border p-3">
                {error && (
                  <Aviso titulo="No se pudo completar" onCerrar={() => setError("")}>
                    {error}
                  </Aviso>
                )}
                {!perfil && (
                  <Aviso tono="espera" titulo="No subió sus documentos">
                    Creó la cuenta pero no completó la verificación. Puede terminarla desde la app.
                  </Aviso>
                )}
                {ajeno && (
                  <Aviso tono="espera" titulo={`${ajeno.quien} está revisando a este cliente`}>
                    Puedes mirar, pero resolverlo es suyo hasta que pasen {ajeno.libre_en} min sin que lo haga.
                  </Aviso>
                )}
                {perfil?.motivo_observacion && cliente?.estado === "observado" && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
                    <p className="t-etiqueta text-red-700">Se le observó</p>
                    <p className="mt-0.5 text-sm text-red-900">{perfil.motivo_observacion}</p>
                  </div>
                )}
                {cliente?.estado === "bloqueado" && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
                    <p className="flex items-center gap-1.5 t-etiqueta text-red-700">
                      <Candado className="h-3.5 w-3.5" /> Cuenta bloqueada
                      {perfil?.bloqueado_en && <span className="font-normal normal-case">· {fechaLarga(perfil.bloqueado_en)}</span>}
                    </p>
                    {perfil?.motivo_bloqueo && <p className="mt-0.5 text-sm text-red-900">{perfil.motivo_bloqueo}</p>}
                    {puedeBloquear && (
                      <BotonAccion
                        tono="neutro"
                        tamano="chico"
                        className="mt-2"
                        onClick={() => cambiarBloqueo(false)}
                        cargando={accion === "desbloqueando"}
                        disabled={accion !== null}
                      >
                        Desbloquear cuenta
                      </BotonAccion>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Quién es */}
            <div className="space-y-3 border-b border-border p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <DatoCorto etiqueta={tipoDoc} copiar={perfil?.dni} mono>
                  {perfil?.dni}
                </DatoCorto>
                <DatoCorto etiqueta="Celular" copiar={perfil?.telefono} mono>
                  {perfil?.telefono}
                </DatoCorto>
              </dl>
              {/* Código promocional: a la vista, porque decide la tarifa. */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs font-semibold text-muted-foreground">Código promocional</span>
                {perfil?.codigo_promo ? (
                  <span className="cifras rounded-md bg-oro-50 px-2 py-0.5 font-mono text-sm font-bold text-oro-700 ring-1 ring-oro-300">
                    {perfil.codigo_promo}
                  </span>
                ) : (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">No tiene</span>
                )}
              </div>
              {/* Nombre contra DNI, lista de bloqueo y datos compartidos con otros clientes. */}
              <AlertasCliente
                id={params.id}
                onIdentidad={setIdentidad}
                puedeCorregir={["gestor", "supervisor", "admin"].includes(session.rol) && puede(session, "kyc.nombre-dni")}
                onCorregido={() => cargar()}
              />
            </div>

            {/* Qué comprobar */}
            {resoluble && (
              <div className="border-b border-border p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <p className="t-seccion">Comprueba en las fotos</p>
                  <Pista texto="Mira cada punto en la foto y márcalo. El botón de aprobar se activa con todo marcado." />
                  <span
                    className={cn(
                      "cifras ml-auto rounded-full px-2 py-0.5 text-xs font-bold",
                      todoRevisado ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {listos}/{COMPROBAR.length}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {COMPROBAR.map((c) => {
                    const hecho = Boolean(revisado[c.clave]);
                    return (
                      <li key={c.clave} className="flex items-stretch gap-1.5">
                        <label
                          className={cn(
                            "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition",
                            hecho ? "border-emerald-200 bg-emerald-50/70" : "border-border hover:bg-muted/50",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={hecho}
                            onChange={(e) => setRevisado({ ...revisado, [c.clave]: e.target.checked })}
                          />
                          <span
                            aria-hidden
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-marca-500",
                              hecho ? "border-emerald-600 bg-emerald-600 text-white" : "border-marca-200 bg-card",
                            )}
                          >
                            {hecho && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-sm leading-tight", hecho ? "text-emerald-900" : "text-foreground")}>{c.titulo}</span>
                            {c.valor && (
                              <span className="mt-0.5 flex items-center gap-1.5">
                                <span className="truncate text-sm font-bold text-foreground">{c.valor}</span>
                                {c.sello && (
                                  <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-px text-[11px] font-bold text-emerald-800">{c.sello}</span>
                                )}
                              </span>
                            )}
                          </span>
                        </label>
                        <Pista texto={c.ver === COMPARAR ? "Ver documento y selfie juntos" : "Ver el frente del documento"}>
                          <button
                            type="button"
                            onClick={() => setVista(c.ver)}
                            aria-label={`Ver la foto para: ${c.titulo}`}
                            className={cn(
                              "flex w-9 shrink-0 items-center justify-center rounded-lg border transition",
                              vista === c.ver ? "border-marca-300 bg-marca-50 text-marca-700" : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                        </Pista>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Tarifa */}
            {resoluble && (
              <div className="border-b border-border p-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <label htmlFor="tarifa" className="t-seccion">
                    Tarifa
                  </label>
                  <Pista texto="Lo normal es la tarifa estándar, la publicada en la web. Si eliges un cupón, rige desde hoy por su duración y al vencer vuelve a la estándar." />
                </div>
                {bloques.length === 0 ? (
                  <Aviso tono="espera">Todavía no hay tarifas. Pídele al administrador que cree al menos una.</Aviso>
                ) : (
                  <>
                    <Desplegable
                      id="tarifa"
                      variante="panel"
                      valor={bloqueId}
                      onCambio={setBloqueId}
                      placeholder="Elige la tarifa"
                      opciones={bloques.map((b) => ({
                        valor: b.id,
                        texto: b.es_default
                          ? "Tarifa estándar · recomendada"
                          : `${b.nombre}${b.duracion_dias ? ` · cupón ${b.duracion_dias} días` : ""}`,
                        detalle: tarifasDe(b),
                      }))}
                    />
                    {bloqueElegido && (
                      <p className="mt-1.5 truncate text-xs text-muted-foreground" title={tarifasDe(bloqueElegido)}>
                        {tarifasDe(bloqueElegido)}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Lo que se mira poco: plegado */}
            <div>
              <button
                type="button"
                onClick={() => setVerMas((v) => !v)}
                aria-expanded={verMas}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                Más datos del cliente
                {faltaConsentimiento.length > 0 && (
                  <span className="rounded bg-oro-50 px-1.5 py-px text-[11px] font-bold text-oro-700">
                    {faltaConsentimiento.length} consentimiento{faltaConsentimiento.length > 1 ? "s" : ""} sin aceptar
                  </span>
                )}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn("ml-auto h-4 w-4 transition-transform", verMas && "rotate-180")}
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {verMas && (
                <div className="animate-aparecer space-y-4 px-4 pb-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <DatoCorto etiqueta="Dirección" className="col-span-2" completo>
                      {perfil?.direccion}
                    </DatoCorto>
                    <DatoCorto etiqueta="Registrado" completo>
                      {fechaCorta(cliente?.created_at)}
                    </DatoCorto>
                    {cliente?.estado === "activo" && (
                      <>
                        <DatoCorto etiqueta="Validado el" completo>
                          {fechaCorta(perfil?.fecha_validacion)}
                        </DatoCorto>
                        <DatoCorto etiqueta="Tarifa" className="col-span-2" completo>
                          {!bloqueActual || bloqueActual.es_default ? "Tarifa estándar" : bloqueActual.nombre}
                        </DatoCorto>
                      </>
                    )}
                  </dl>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <p className="t-etiqueta">Consentimientos</p>
                      <Pista texto="La constancia de lo que aceptó el cliente: versión, fecha y teléfono. Es lo que se presenta ante un reclamo." />
                    </div>
                    <ul className="space-y-1">
                      {Object.entries(NOMBRES_CONSENTIMIENTO).map(([tipo, texto]) => {
                        const a = aceptaciones.find((x) => x.tipo === tipo);
                        const d = a?.dispositivo || {};
                        return (
                          <li key={tipo} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                                  a ? "bg-emerald-50 text-emerald-700" : "bg-oro-50 text-oro-700",
                                )}
                              >
                                {a ? <Check className="h-2.5 w-2.5" /> : <Cruz className="h-2.5 w-2.5" />}
                              </span>
                              <span className="truncate">{texto}</span>
                            </span>
                            {a ? (
                              <Pista
                                fin
                                texto={`Aceptada el ${fechaLarga(a.aceptado_en)}${d.plataforma ? ` · ${[d.modelo, d.plataforma, d.app && `app ${d.app}`].filter(Boolean).join(" · ")}` : ""}`}
                              >
                                <span className="cifras shrink-0 cursor-help text-xs font-semibold text-muted-foreground">v{a.version}</span>
                              </Pista>
                            ) : (
                              <span className="shrink-0 text-xs font-semibold text-oro-700">Sin aceptar</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Cerrar la cuenta: sirve también cuando ya está aprobada. */}
                  {puedeBloquear && cliente && cliente.estado !== "bloqueado" && (
                    <button
                      type="button"
                      onClick={() => setModoBloqueo(true)}
                      disabled={accion !== null}
                      className="flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:underline disabled:opacity-50"
                    >
                      <Candado className="h-3.5 w-3.5" /> Bloquear la cuenta
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Botones: siempre a la vista */}
          {resoluble && (puedeAprobar || puedeObservar) && (
            <div className="shrink-0 space-y-2 border-t border-border bg-muted/30 p-3">
              <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(listos / COMPROBAR.length) * 100}%` }}
                />
              </div>
              <div className="flex gap-2">
                {puedeAprobar && (
                  <Pista texto={faltaAprobar} className="block min-w-0 flex-1">
                    <BotonAccion
                      onClick={aprobar}
                      cargando={accion === "aprobando"}
                      disabled={accion !== null || Boolean(faltaAprobar)}
                      tono="exito"
                      tamano="grande"
                      className="w-full"
                      icono={<Check className="h-5 w-5" />}
                    >
                      {accion === "aprobando" ? "Aprobando..." : "Aprobar"}
                    </BotonAccion>
                  </Pista>
                )}
                {puedeObservar && (
                  <BotonAccion
                    onClick={() => setModoObservar(true)}
                    disabled={accion !== null || !perfil || Boolean(ajeno)}
                    tono="peligroSuave"
                    tamano="grande"
                    className={puedeAprobar ? "" : "w-full"}
                    icono={<Cruz className="h-4 w-4" />}
                  >
                    Observar
                  </BotonAccion>
                )}
              </div>
              {faltaAprobar && puedeAprobar && <p className="text-center text-xs text-muted-foreground">{faltaAprobar}</p>}
            </div>
          )}
        </aside>
      </div>

      {/* Observar: en una ventana, sin mover la ficha. */}
      <Dialogo
        abierto={modoObservar}
        onCerrar={() => setModoObservar(false)}
        bloqueado={accion === "observando"}
        titulo="Observar los documentos"
        descripcion="El cliente lo lee en su app y puede volver a subir las fotos desde ahí."
        tono="peligro"
        icono={<IconoAlerta />}
        ancho="max-w-lg"
        pie={
          <>
            <BotonAccion tono="neutro" disabled={accion !== null} onClick={() => setModoObservar(false)}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              tono="peligro"
              onClick={observar}
              cargando={accion === "observando"}
              disabled={accion !== null || motivo.trim().length < MIN_MOTIVO}
            >
              Enviar observación
            </BotonAccion>
          </>
        }
      >
        <Motivo
          id="motivo"
          etiqueta="Qué debe corregir"
          valor={motivo}
          onCambio={setMotivo}
          minimo={MIN_MOTIVO}
          filas={4}
          sugerencias={OBSERVACIONES_FRECUENTES}
          placeholder="Ej: La selfie no deja ver el DNI completo. Tómala sosteniendo el documento junto a tu rostro."
        />
      </Dialogo>

      {/* Bloquear: también en una ventana. */}
      <Dialogo
        abierto={modoBloqueo}
        onCerrar={() => setModoBloqueo(false)}
        bloqueado={accion === "bloqueando"}
        titulo="Bloquear la cuenta"
        descripcion="Cierra su entrada a la app y le impide enviar solicitudes. Se puede revertir y queda registrado con tu nombre."
        tono="peligro"
        icono={<Candado className="h-5 w-5" />}
        ancho="max-w-lg"
        pie={
          <>
            <BotonAccion tono="neutro" disabled={accion !== null} onClick={() => setModoBloqueo(false)}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              tono="peligro"
              onClick={() => cambiarBloqueo(true)}
              cargando={accion === "bloqueando"}
              disabled={accion !== null || motivoBloqueo.trim().length < MIN_MOTIVO}
            >
              Bloquear
            </BotonAccion>
          </>
        }
      >
        <Motivo
          id="motivoBloqueo"
          etiqueta="Motivo del bloqueo"
          ayuda="El cliente lo lee al intentar entrar."
          valor={motivoBloqueo}
          onCambio={setMotivoBloqueo}
          minimo={MIN_MOTIVO}
          placeholder="Ej: envió comprobantes que no corresponden a sus operaciones."
        />
      </Dialogo>

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

/**
 * Etiqueta y valor en poco espacio, con botón de copiar opcional.
 * completo: el texto baja de línea en vez de cortarse con "…".
 */
function DatoCorto({ etiqueta, children, mono = false, copiar, className, completo = false }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-semibold text-muted-foreground">{etiqueta}</dt>
      <dd
        className={cn(
          "mt-0.5 flex min-w-0 gap-1 font-semibold text-foreground",
          completo ? "items-start text-sm leading-snug" : "items-center text-md",
          mono && "cifras font-mono",
        )}
      >
        <span className={cn("min-w-0", completo ? "break-words" : "truncate")}>{children || <span className="font-normal text-muted-foreground">—</span>}</span>
        {copiar && <Copiar texto={copiar} soloIcono etiqueta={`Copiar ${etiqueta.toLowerCase()}`} />}
      </dd>
    </div>
  );
}
