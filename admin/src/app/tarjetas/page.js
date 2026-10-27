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
import { useIrAlDetalle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Tarjeta as IconoTarjeta, Check, Cruz, Manos, Imagen } from "@/components/shell";
import Visor from "@/components/visor";
import Conflicto from "@/components/conflicto";
import SinPendientes from "@/components/sinPendientes";
import Revisor from "@/components/revisor";
import BotonRefrescar from "@/components/refrescar";
import Pista from "@/components/pista";
import { Estado, Dato, Vacio, Aviso } from "@/components/marca";
import { EsqueletoCola, Esqueleto, BotonAccion, CargaPantalla } from "@/components/carga";
import { Segmentos, Buscador, Barra, Panel, Leyenda, Motivo, Copiar, Comprobacion } from "@/components/piezas";

const RECHAZOS_FRECUENTES = [
  "La foto no deja ver el nombre del titular. Vuelve a tomarla completa.",
  "Los últimos 4 dígitos de la foto no coinciden con los que escribiste.",
  "Se ve el número completo de la tarjeta. Cúbrelo y deja solo los últimos 4.",
  "La tarjeta está a nombre de otra persona. Solo puedes registrar tarjetas tuyas.",
];

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
  // Baja de una tarjeta verificada: el cliente ya no puede hacerlo desde
  // el app ("para darla de baja, habla con un asesor").
  const [modoBaja, setModoBaja] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState("");
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
  // Lo que el revisor confirma haber mirado, por tarjeta.
  const [revisadoPor, setRevisadoPor] = useState({});
  const router = useRouter();
  const detalleRef = useIrAlDetalle(seleccionada?.id);

  // Verificar es del gestor; el supervisor mira como va el trabajo. El
  // admin conserva el mando.
  const puedeResolver = ["gestor", "admin"].includes(session?.rol);
  const esGestor = session?.rol === "gestor";

  // silencioso: solo renueva la lista, sin cerrar la ficha abierta ni
  // mostrar "cargando". Es lo que pasa al abrir una tarjeta (se toma y
  // se recarga): antes esa recarga cerraba la ficha que se acababa de
  // abrir y no había forma de aprobarla.
  const cargar = useCallback(async (estado, mias, yo, { silencioso = false } = {}) => {
    if (!silencioso) {
      setLoading(true);
      setSeleccionada(null);
      setModoRechazo(false);
      setMotivo("");
    }
    setError("");
    setFiltro(estado);

    let q = supabase
      .from("tarjetas")
      .select(
        `id, banco, ultimos_4, nombre_impreso, estado, foto_tarjeta, foto_reverso,
         motivo_rechazo, created_at, fecha_revision, asignado_a, asignado_en,
         perfiles_cliente (nombres, apellidos, tipo_documento, dni, telefono, user_id)`,
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
  function recargar(opciones) {
    cargar(filtro, session?.rol === "gestor", session?.user.id, opciones);
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
      // La lista se renueva (ahora figura tomada) sin cerrar la ficha.
      recargar({ silencioso: true });
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

  async function darDeBaja(t) {
    const texto = motivoBaja.trim();
    if (texto.length < MIN_MOTIVO) {
      setError(`Explica el motivo con al menos ${MIN_MOTIVO} caracteres: el cliente lo recibe como aviso.`);
      return;
    }
    setAccion("baja");
    setError("");
    const { data, error: e } = await supabase.rpc("dar_de_baja_tarjeta", { p_id: t.id, p_motivo: texto });
    setAccion(null);
    if (e) {
      setError(explicarError(e));
      return;
    }
    if (data && data.ok === false) {
      setError("Esa tarjeta ya estaba dada de baja.");
    }
    setModoBaja(false);
    setMotivoBaja("");
    setSeleccionada(null);
    recargar();
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

  if (!session) return <CargaPantalla />;

  const cliente = seleccionada?.perfiles_cliente;
  const titular = cliente ? `${cliente.nombres} ${cliente.apellidos}` : "Cliente sin perfil";
  const marcas = (seleccionada && revisadoPor[seleccionada.id]) || {};
  const COMPROBAR = seleccionada
    ? [
        {
          clave: "nombre",
          texto: (
            <>
              El nombre impreso{seleccionada.nombre_impreso ? <> (<strong>{seleccionada.nombre_impreso}</strong>)</> : null} coincide con{" "}
              <strong>{titular}</strong>.
            </>
          ),
        },
        {
          clave: "digitos",
          texto: (
            <>
              Los últimos 4 dígitos coinciden con <span className="cifras font-mono font-bold">{seleccionada.ultimos_4}</span>.
            </>
          ),
        },
        { clave: "cubierto", texto: "El número completo está cubierto: solo se ven los últimos 4." },
        ...(seleccionada.foto_reverso ? [{ clave: "dos", texto: "Revisé las dos fotos." }] : []),
      ]
    : [];
  const todoRevisado = COMPROBAR.every((c) => marcas[c.clave]);

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Tarjetas"
      descripcion={
        loading
          ? "Cargando..."
          : filtro === "pendiente"
            ? `${tarjetas.length} ${tarjetas.length === 1 ? "espera" : "esperan"} verificación`
            : `${tarjetas.length} en el historial`
      }
      ayuda="El cliente registra su tarjeta con una foto. Comprueba que sea suya y que el número completo esté tapado; al verificarla ya puede usarla en sus solicitudes."
      acciones={
        filtro === "pendiente" &&
        puedeResolver && (
          <BotonAccion
            onClick={() => atenderSiguiente()}
            cargando={pidiendo}
            icono={<Manos className="h-4 w-4" />}
            title="Te asigna la tarjeta libre que más tiempo lleva esperando"
          >
            <span className="hidden sm:inline">{pidiendo ? "Buscando…" : "Atender siguiente"}</span>
          </BotonAccion>
        )
      }
    >
      {error && (
        <Aviso className="mb-4" titulo="No se pudo completar" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={filtro}
          onCambio={(clave) => cargar(clave, session?.rol === "gestor", session?.user.id)}
          opciones={FILTROS.map((f) => ({
            ...f,
            cuenta: f.clave === "pendiente" ? (contadores.tarjetasPendientes ?? null) : null,
            urgente: f.clave === "pendiente",
          }))}
        />
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Nombre, DNI, banco o últimos 4" className="w-full sm:w-72" />
        <div className="ml-auto flex items-center gap-2">
          {!puedeResolver && (
            <Pista texto="Como supervisor ves toda la cola y quién atiende cada tarjeta. Verificarla es del gestor que la tiene.">
              <span className="cursor-help rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Solo lectura</span>
            </Pista>
          )}
          <BotonRefrescar girando={loading} onClick={() => recargar()} texto="Actualizar la lista de tarjetas" />
        </div>
      </Barra>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Cola */}
        <section className="flex min-w-0 flex-col xl:sticky xl:top-[76px] xl:max-h-[calc(100dvh-150px)] xl:self-start">
          {loading ? (
            <EsqueletoCola filas={4} />
          ) : visibles.length === 0 ? (
            <Vacio
              icono={<IconoTarjeta />}
              titulo={busqueda ? "Sin coincidencias" : filtro === "pendiente" ? "Cola vacía" : "Sin tarjetas"}
              detalle={
                busqueda
                  ? "Ninguna tarjeta coincide con lo que buscas."
                  : filtro === "pendiente"
                    ? esGestor
                      ? "No tienes tarjetas asignadas. Pulsa «Atender siguiente»."
                      : "No queda ninguna tarjeta por verificar."
                    : "No hay tarjetas en este estado."
              }
            />
          ) : (
            <div className="scroll-fino -mx-1 max-h-[60vh] min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-1 xl:max-h-none">
              {visibles.map((t) => {
                const activa = seleccionada?.id === t.id;
                const tomada = t.asignado_a && minutosRestantes(t.asignado_en) > 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => abrir(t)}
                    className={cn(
                      "pulsable w-full rounded-xl border bg-card px-3.5 py-3 text-left",
                      tomada &&
                        (t.asignado_a === session.user.id ? "border-l-4 border-l-marca-600" : `border-l-4 ${colorDe(t.asignado_a).borde}`),
                      activa ? "border-marca-500 shadow-alzado ring-2 ring-marca-500/30" : "border-border hover:border-marca-200 hover:shadow-panel",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-md font-bold text-foreground">{t.banco}</span>
                      <span className="cifras font-mono text-sm text-muted-foreground">···· {t.ultimos_4}</span>
                      {!t.foto_tarjeta ? (
                        <span className="ml-auto rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700">Sin foto</span>
                      ) : t.foto_reverso ? (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                          <Imagen className="h-3.5 w-3.5" />2 fotos
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {t.perfiles_cliente ? `${t.perfiles_cliente.nombres} ${t.perfiles_cliente.apellidos}` : "Cliente sin perfil"}
                      </p>
                      {tomada && (
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

          {filtro === "pendiente" && !loading && visibles.length > 0 && (
            <Leyenda
              className="mt-3"
              items={[
                {
                  texto: "Franja de color",
                  marca: <span className="h-3.5 w-1 rounded bg-marca-600" />,
                  pista: "Quién la atiende: azul oscuro eres tú; cada compañero tiene su color.",
                },
                {
                  texto: "2 fotos",
                  marca: <Imagen className="h-3.5 w-3.5" />,
                  pista: "El cliente subió una segunda foto (por ejemplo, el reverso). Revisa ambas.",
                },
              ]}
            />
          )}
        </section>

        {/* Detalle */}
        <section ref={detalleRef} className="min-w-0 scroll-mt-20 space-y-4">
          {ajeno && (
            <Aviso tono="espera" titulo={`${ajeno.quien} está revisando esta tarjeta`}>
              Puedes mirarla, pero verificarla es suyo hasta que pasen {ajeno.libre_en} min.
            </Aviso>
          )}

          {!seleccionada ? (
            <Vacio
              className="min-h-[360px]"
              icono={<IconoTarjeta />}
              titulo="Elige una tarjeta de la lista"
              detalle="Al pulsarla se carga su foto y los datos del titular."
            />
          ) : (
            <div key={seleccionada.id} className="animate-aparecer space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-panel">
                <h2 className="text-lg font-bold">{seleccionada.banco}</h2>
                <span className="cifras font-mono text-lg text-muted-foreground">···· {seleccionada.ultimos_4}</span>
                <Estado valor={seleccionada.estado} />
                <span className="text-sm text-muted-foreground">Registrada el {fechaLarga(seleccionada.created_at)}</span>
              </div>

              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)]">
                <div className="min-w-0 space-y-3">
                  {/* Solo aparece si subió una segunda foto: un selector de
                      una sola opción confunde. */}
                  {seleccionada.foto_reverso && (
                    <Segmentos
                      valor={cara}
                      onCambio={setCara}
                      opciones={[
                        { clave: "frente", etiqueta: "Foto principal" },
                        { clave: "reverso", etiqueta: "Otra foto" },
                      ]}
                    />
                  )}

                  {cargandoDetalle ? (
                    <Esqueleto className="h-[460px] w-full rounded-xl" />
                  ) : (
                    <Visor
                      url={cara === "reverso" ? seleccionada.reverso : seleccionada.foto}
                      error={cara === "reverso" ? seleccionada.reverso_error : seleccionada.foto_error}
                      path={cara === "reverso" ? seleccionada.reverso_path : seleccionada.foto_path}
                      titulo={cara === "reverso" ? "Otra foto de la tarjeta" : "Foto principal de la tarjeta"}
                      alto="h-[460px]"
                    />
                  )}

                  {seleccionada.estado === "pendiente" && puedeResolver && (
                    <Comprobacion
                      items={COMPROBAR}
                      marcados={marcas}
                      onCambio={(v) => setRevisadoPor((m) => ({ ...m, [seleccionada.id]: v }))}
                      ayuda="Marcar cada punto confirma que lo miraste. El botón de verificar se activa con todo marcado."
                    />
                  )}
                </div>

                <div className="min-w-0 space-y-4">
                  <Panel titulo="Titular">
                    <p className="text-base font-semibold">{titular}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      <Dato
                        etiqueta={cliente?.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI"}
                        mono
                        accion={<Copiar texto={cliente?.dni} soloIcono etiqueta="Copiar el número" />}
                      >
                        {cliente?.dni}
                      </Dato>
                      <Dato etiqueta="Teléfono" mono accion={<Copiar texto={cliente?.telefono} soloIcono etiqueta="Copiar teléfono" />}>
                        {cliente?.telefono}
                      </Dato>
                      <Dato etiqueta="Nombre impreso" className="col-span-2">
                        {seleccionada.nombre_impreso || "No lo indicó (registro anterior)"}
                      </Dato>
                    </dl>
                  </Panel>

                  {seleccionada.estado === "pendiente" && !puedeResolver ? (
                    <Aviso tono="info">Estás viendo la cola como supervisor: verificar la tarjeta es del gestor que la tiene.</Aviso>
                  ) : seleccionada.estado === "pendiente" ? (
                    <Panel titulo={modoRechazo ? "Rechazar la tarjeta" : "Resolver"} tono={modoRechazo ? "peligro" : undefined}>
                      {!modoRechazo ? (
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <Pista
                            className="block w-full"
                            texto={ajeno ? "Otra persona tiene esta tarjeta." : !todoRevisado ? "Marca todo lo de la lista de comprobación." : null}
                          >
                            <BotonAccion
                              onClick={() => aprobar(seleccionada)}
                              cargando={accion === "aprobando"}
                              disabled={accion !== null || Boolean(ajeno) || !todoRevisado}
                              tono="exito"
                              tamano="grande"
                              className="w-full"
                              icono={<Check className="h-5 w-5" />}
                            >
                              {accion === "aprobando" ? "Verificando..." : "Verificar tarjeta"}
                            </BotonAccion>
                          </Pista>
                          <BotonAccion
                            onClick={() => setModoRechazo(true)}
                            disabled={accion !== null || Boolean(ajeno)}
                            tono="peligroSuave"
                            tamano="grande"
                            icono={<Cruz className="h-4 w-4" />}
                          >
                            Rechazar
                          </BotonAccion>
                        </div>
                      ) : (
                        <div className="animate-aparecer space-y-3">
                          <Motivo
                            id="motivo"
                            etiqueta="Motivo"
                            ayuda="El cliente lo lee en su app y puede volver a registrar la tarjeta corrigiendo esto."
                            valor={motivo}
                            onCambio={setMotivo}
                            minimo={MIN_MOTIVO}
                            sugerencias={RECHAZOS_FRECUENTES}
                            placeholder="Ej: La foto no deja ver el nombre del titular."
                          />
                          <div className="flex justify-end gap-2">
                            <BotonAccion
                              tono="neutro"
                              onClick={() => {
                                setModoRechazo(false);
                                setMotivo("");
                              }}
                            >
                              Cancelar
                            </BotonAccion>
                            <BotonAccion
                              tono="peligro"
                              onClick={() => rechazar(seleccionada)}
                              cargando={accion === "rechazando"}
                              disabled={accion !== null || motivo.trim().length < MIN_MOTIVO}
                            >
                              Confirmar rechazo
                            </BotonAccion>
                          </div>
                        </div>
                      )}
                    </Panel>
                  ) : (
                    <Panel titulo="Resolución" tono={modoBaja ? "peligro" : undefined}>
                      <Dato etiqueta="Resuelta el">{seleccionada.fecha_revision ? fechaLarga(seleccionada.fecha_revision) : null}</Dato>
                      {seleccionada.motivo_rechazo && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                          <p className="t-etiqueta text-red-700">Motivo comunicado</p>
                          <p className="mt-1 text-md text-red-900">{seleccionada.motivo_rechazo}</p>
                        </div>
                      )}
                      {seleccionada.estado === "aprobado" && ["gestor", "supervisor", "admin"].includes(session?.rol) && (
                        <div className="mt-4 border-t border-border pt-4">
                          {!modoBaja ? (
                            <div className="flex items-center gap-2">
                              <BotonAccion tono="peligroSuave" onClick={() => setModoBaja(true)} icono={<Cruz className="h-4 w-4" />}>
                                Dar de baja
                              </BotonAccion>
                              <Pista texto="El cliente no puede darla de baja desde la app: lo pide a un asesor. La tarjeta deja de aparecer en su app y recibe el motivo como aviso." />
                            </div>
                          ) : (
                            <div className="animate-aparecer space-y-3">
                              <Motivo
                                id="motivoBaja"
                                etiqueta="Motivo de la baja"
                                ayuda="El cliente lo recibe en Mis avisos. La tarjeta deja de aparecer en su app."
                                valor={motivoBaja}
                                onCambio={setMotivoBaja}
                                minimo={MIN_MOTIVO}
                                placeholder="Ej: El cliente pidió retirarla por teléfono."
                              />
                              <div className="flex justify-end gap-2">
                                <BotonAccion
                                  tono="neutro"
                                  onClick={() => {
                                    setModoBaja(false);
                                    setMotivoBaja("");
                                  }}
                                >
                                  Cancelar
                                </BotonAccion>
                                <BotonAccion
                                  tono="peligro"
                                  onClick={() => darDeBaja(seleccionada)}
                                  cargando={accion === "baja"}
                                  disabled={accion !== null || motivoBaja.trim().length < MIN_MOTIVO}
                                >
                                  Confirmar baja
                                </BotonAccion>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Panel>
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
        texto="No hay tarjetas esperando verificación. Cuando entre una nueva, el sistema te la asigna sola."
      />

      <Conflicto mensaje={conflicto?.mensaje} titulo={conflicto?.titulo} onCerrar={() => setConflicto(null)} />
    </Shell>
  );
}
