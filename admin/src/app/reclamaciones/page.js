"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { useIrAlDetalle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Reclamo, Reloj, Correo, Check } from "@/components/shell";
import { Aviso, Vacio, Dato } from "@/components/marca";
import { EsqueletoCola, BotonAccion, CargaPantalla } from "@/components/carga";
import { Segmentos, Buscador, Barra, Panel, Leyenda, Motivo, Dialogo, Tostada, Copiar } from "@/components/piezas";
import Pista from "@/components/pista";

/**
 * Bandeja del Libro de Reclamaciones (migración 56). Las hojas llegan de
 * la app y de la web. Plazo de respuesta: 15 días hábiles: cada hoja
 * muestra cuánto falta y se pone en rojo al vencer.
 *
 * Si el cliente tiene cuenta, la respuesta le llega a Mis avisos. Si la
 * dejó desde la web sin cuenta, hay que enviársela por correo: por eso,
 * al responder, se ofrece abrir el correo ya redactado.
 */
const MIN_RESPUESTA = 20;

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "");

function plazo(vence) {
  const dias = Math.ceil((new Date(vence).getTime() - Date.now()) / 86400000);
  if (dias < 0) return { texto: `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}`, tono: "vencido" };
  if (dias === 0) return { texto: "Vence hoy", tono: "vencido" };
  if (dias <= 3) return { texto: `Vence en ${dias} día${dias === 1 ? "" : "s"}`, tono: "pronto" };
  return { texto: `Vence el ${fecha(vence)}`, tono: "tiempo" };
}

const TONO_PLAZO = {
  vencido: "bg-red-50 text-red-700",
  pronto: "bg-oro-100 text-oro-700",
  tiempo: "bg-muted text-muted-foreground",
};

function correoRespuesta(r, respuesta) {
  const asunto = `Respuesta a su ${r.tipo} N.° ${r.codigo} - AlToque Perú WK`;
  const cuerpo = [
    `Estimado(a) ${r.nombres}:`,
    "",
    `En atención a su ${r.tipo} N.° ${r.codigo}, registrado el ${fecha(r.creado_en)}, le informamos:`,
    "",
    respuesta,
    "",
    "Atentamente,",
    "ALTOQUE PERU WK S.A.C. · RUC 20611531410",
  ].join("\n");
  return `mailto:${r.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

export default function ReclamacionesPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [hojas, setHojas] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [abiertaId, setAbiertaId] = useState(null);
  const [respuesta, setRespuesta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [porCorreo, setPorCorreo] = useState(null); // { hoja, texto }
  const [pendientes, setPendientes] = useState(null);
  const router = useRouter();
  const detalleRef = useIrAlDetalle(abiertaId);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
    });
  }, [router]);

  useEffect(() => {
    if (session) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, filtro]);

  async function cargar() {
    setLoading(true);
    const { data, error: e } = await supabase
      .from("reclamaciones")
      .select("*")
      .eq("estado", filtro)
      .order(filtro === "pendiente" ? "vence_en" : "respondido_en", { ascending: filtro === "pendiente" });
    if (e) setError(explicarError(e));
    setHojas(data || []);
    if (filtro === "pendiente") setPendientes((data || []).length);
    setLoading(false);
  }

  async function responder(r) {
    const texto = respuesta.trim();
    if (texto.length < MIN_RESPUESTA) return;
    setGuardando(true);
    setError("");
    const { data, error: e } = await supabase.rpc("responder_reclamo", { p_id: r.id, p_respuesta: texto });
    setGuardando(false);
    if (e) return setError(explicarError(e));
    if (data?.ok === false) return setError("Esa hoja ya estaba respondida.");
    // Sin cuenta en la app, la respuesta solo le llega por correo.
    if (!r.user_id) setPorCorreo({ hoja: r, texto });
    else setOk(`Respuesta guardada. ${r.nombres} la recibe en Mis avisos de la app.`);
    setAbiertaId(null);
    setRespuesta("");
    cargar();
  }

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return hojas;
    return hojas.filter((r) => [r.codigo, r.nombres, r.numero_documento, r.correo].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [hojas, busqueda]);

  if (!session) return <CargaPantalla />;

  const abierta = hojas.find((h) => h.id === abiertaId) || null;
  const vencidas = filtro === "pendiente" ? hojas.filter((h) => plazo(h.vence_en).tono === "vencido").length : 0;

  return (
    <Shell
      session={session}
      titulo="Libro de Reclamaciones"
      descripcion={vencidas > 0 ? `${vencidas} con el plazo vencido` : "Reclamos y quejas con plazo de respuesta"}
      ayuda="Las hojas llegan desde la app y desde la web. Hay que responderlas en 15 días hábiles. Si el consumidor tiene cuenta, la respuesta le llega a la app; si no, se la envías por correo."
      contadores={pendientes != null ? { reclamosPendientes: pendientes } : {}}
    >
      {error && (
        <Aviso className="mb-4" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={filtro}
          onCambio={(v) => {
            setFiltro(v);
            setAbiertaId(null);
          }}
          opciones={[
            { clave: "pendiente", etiqueta: "Por responder", cuenta: pendientes, urgente: true },
            { clave: "respondido", etiqueta: "Respondidas" },
          ]}
        />
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Código, nombre, documento o correo" className="w-full sm:w-80" />
      </Barra>

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col xl:sticky xl:top-[76px] xl:max-h-[calc(100dvh-150px)] xl:self-start">
          {loading ? (
            <EsqueletoCola filas={4} />
          ) : visibles.length === 0 ? (
            <Vacio
              icono={<Reclamo />}
              titulo={busqueda ? "Sin coincidencias" : filtro === "pendiente" ? "No hay hojas por responder" : "Todavía no hay hojas respondidas"}
            />
          ) : (
            <div className="scroll-fino -mx-1 max-h-[60vh] min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-1 xl:max-h-none">
              {visibles.map((r) => {
                const pl = plazo(r.vence_en);
                const activa = abiertaId === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setAbiertaId(r.id);
                      setRespuesta("");
                    }}
                    className={cn(
                      "pulsable w-full rounded-xl border bg-card px-3.5 py-3 text-left",
                      activa ? "border-marca-500 shadow-alzado ring-2 ring-marca-500/30" : "border-border hover:border-marca-200 hover:shadow-panel",
                      r.estado === "pendiente" && pl.tono === "vencido" && !activa && "border-l-4 border-l-red-500",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs font-bold",
                          r.tipo === "queja" ? "bg-marca-100 text-marca-700" : "bg-oro-100 text-oro-700",
                        )}
                      >
                        {r.tipo === "queja" ? "Queja" : "Reclamo"}
                      </span>
                      <span className="cifras font-mono text-chico font-bold text-marca-700">N.° {r.codigo}</span>
                      {r.estado === "pendiente" ? (
                        <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", TONO_PLAZO[pl.tono])}>
                          {pl.tono !== "tiempo" && <Reloj className="h-3 w-3" />}
                          {pl.texto}
                        </span>
                      ) : (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                          {fecha(r.respondido_en)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-md font-semibold">{r.nombres}</p>
                    <p className="truncate text-chico text-muted-foreground">
                      {r.tipo_documento?.toUpperCase()} {r.numero_documento} · {r.origen === "app" ? "desde la app" : "desde la web"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {filtro === "pendiente" && !loading && visibles.length > 0 && (
            <Leyenda
              className="mt-3"
              titulo="Plazo"
              items={[
                { texto: "Vencido u hoy", color: "bg-red-500", pista: "Ya pasó el plazo legal o vence hoy: respóndela primero." },
                { texto: "3 días o menos", color: "bg-oro-500" },
                { texto: "Con tiempo", color: "bg-marca-200" },
              ]}
            />
          )}
        </section>

        <section ref={detalleRef} className="min-w-0 scroll-mt-20">
          {!abierta ? (
            <Vacio
              className="min-h-[320px]"
              icono={<Reclamo />}
              titulo="Elige una hoja de la lista"
              detalle="Se muestra la hoja completa y, si está por responder, el espacio para la respuesta."
            />
          ) : (
            <div key={abierta.id} className="animate-aparecer space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-panel">
                <h2 className="font-heading text-lg font-semibold">
                  {abierta.tipo === "queja" ? "Queja" : "Reclamo"} <span className="cifras font-mono text-marca-700">N.° {abierta.codigo}</span>
                </h2>
                <span className="text-sm text-muted-foreground">Registrada el {fecha(abierta.creado_en)}</span>
                {abierta.estado === "pendiente" ? (
                  <span className={cn("ml-auto rounded-full px-2.5 py-1 text-xs font-bold", TONO_PLAZO[plazo(abierta.vence_en).tono])}>
                    {plazo(abierta.vence_en).texto}
                  </span>
                ) : (
                  <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    Respondida el {fecha(abierta.respondido_en)}
                  </span>
                )}
              </div>

              <div className="grid gap-4 2xl:grid-cols-2">
                <Panel titulo="Consumidor">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Dato etiqueta="Nombre" className="col-span-2">
                      {abierta.nombres}
                    </Dato>
                    <Dato etiqueta={abierta.tipo_documento?.toUpperCase() || "Documento"} mono>
                      {abierta.numero_documento}
                    </Dato>
                    <Dato etiqueta="Teléfono" mono>
                      {abierta.telefono}
                    </Dato>
                    <Dato etiqueta="Correo" className="col-span-2" accion={<Copiar texto={abierta.correo} soloIcono etiqueta="Copiar el correo" />}>
                      {abierta.correo}
                    </Dato>
                    <Dato etiqueta="Domicilio" className="col-span-2">
                      {abierta.domicilio}
                    </Dato>
                    {abierta.menor_edad && (
                      <Dato etiqueta="Menor de edad · apoderado" className="col-span-2">
                        {abierta.apoderado}
                      </Dato>
                    )}
                    <Dato etiqueta="Cuenta en la app">
                      {abierta.user_id ? "Sí: la respuesta le llega a la app" : "No: hay que responder por correo"}
                    </Dato>
                  </dl>
                </Panel>

                <Panel titulo="Lo que reclama">
                  <dl className="space-y-3 text-md">
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">Servicio</dt>
                      <dd className="mt-0.5">
                        {abierta.descripcion_bien}
                        {abierta.monto != null && (
                          <span className="cifras ml-2 rounded bg-oro-100 px-1.5 py-0.5 text-sm font-bold text-oro-700">S/ {abierta.monto}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">Detalle</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap">{abierta.detalle}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">Pedido</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap">{abierta.pedido}</dd>
                    </div>
                  </dl>
                </Panel>
              </div>

              {abierta.estado === "pendiente" ? (
                <Panel
                  titulo="Respuesta al consumidor"
                  ayuda={abierta.user_id ? "Le llega a Mis avisos en la app." : "No tiene cuenta: al guardar se abre tu correo con la respuesta ya redactada."}
                >
                  <div className="space-y-3">
                    <Motivo
                      id="respuesta"
                      etiqueta={null}
                      valor={respuesta}
                      onCambio={setRespuesta}
                      minimo={MIN_RESPUESTA}
                      maximo={2000}
                      filas={6}
                      autoFocus={false}
                      placeholder="Qué revisamos, qué encontramos y qué hicimos."
                    />
                    <div className="flex justify-end">
                      <BotonAccion
                        onClick={() => responder(abierta)}
                        cargando={guardando}
                        disabled={respuesta.trim().length < MIN_RESPUESTA}
                        icono={!abierta.user_id ? <Correo className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      >
                        Guardar respuesta
                      </BotonAccion>
                    </div>
                  </div>
                </Panel>
              ) : (
                <Panel
                  titulo="Respuesta enviada"
                  acciones={
                    !abierta.user_id && (
                      <a
                        href={correoRespuesta(abierta, abierta.respuesta)}
                        className="inline-flex items-center gap-1 text-sm font-bold text-marca-600 hover:text-marca-700"
                      >
                        <Correo className="h-4 w-4" />
                        Volver a enviar por correo
                      </a>
                    )
                  }
                >
                  <p className="whitespace-pre-wrap text-md">{abierta.respuesta}</p>
                </Panel>
              )}
            </div>
          )}
        </section>
      </div>

      <Dialogo
        abierto={Boolean(porCorreo)}
        onCerrar={() => setPorCorreo(null)}
        titulo="Respuesta guardada"
        descripcion={
          porCorreo
            ? `${porCorreo.hoja.nombres} no tiene cuenta en la app: la respuesta solo le llega si se la envías a ${porCorreo.hoja.correo}.`
            : ""
        }
        tono="atencion"
        icono={<Correo className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setPorCorreo(null)}>
              Lo envío después
            </BotonAccion>
            <BotonAccion
              icono={<Correo className="h-4 w-4" />}
              onClick={() => {
                window.location.href = correoRespuesta(porCorreo.hoja, porCorreo.texto);
                setPorCorreo(null);
              }}
            >
              Abrir el correo
            </BotonAccion>
          </>
        }
      />

      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}
