"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import { subirImagenes, borrarImagenes, urlPublica, TIPOS_ACEPTADOS } from "@/lib/imagenes";
import { cn } from "@/lib/utils";
import Shell, { Libro, Mas, Lapiz, Basura, Imagen } from "@/components/shell";
import { Aviso, Vacio } from "@/components/marca";
import { Rueda, BotonAccion, Esqueleto, CargaPantalla } from "@/components/carga";
import { Campo, Panel, Tostada, MensajeError, useConfirmar } from "@/components/piezas";
import Pista from "@/components/pista";

const BANCOS_DEFAULT = ["BCP", "BBVA", "Interbank", "Scotiabank", "BanBif"];

// Público (migración 50): la app usa la URL directa y la guarda con la
// guía en el teléfono. Solo el administrador puede subir.
const BUCKET = "guias-bancos";
const PREFIJO_PUBLICO = `/storage/v1/object/public/${BUCKET}/`;

/** Ruta del objeto a partir de su URL pública; null si es de otro sitio. */
function pathDeUrl(url) {
  if (!url) return null;
  const i = url.indexOf(PREFIJO_PUBLICO);
  return i === -1 ? null : decodeURIComponent(url.slice(i + PREFIJO_PUBLICO.length).split("?")[0]);
}

/**
 * Imágenes de una guía que viven en nuestro bucket. Solo las de los
 * pasos: la app no muestra portada.
 */
function pathsDe(guia) {
  if (!guia) return [];
  return (guia.pasos || []).map((p) => p.imagen_url).map(pathDeUrl).filter(Boolean);
}

const carpetaDe = (banco) =>
  String(banco || "otros")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-");

/** Paso con algo escrito o una imagen. Los vacíos se descartan al guardar. */
const conContenido = (p) => p.titulo.trim() || p.descripcion.trim() || p.imagen_url;

/**
 * Elegir una imagen y subirla. Muestra la que hay (o el hueco punteado)
 * y deja cambiarla o quitarla.
 */
function SubirImagen({ url, onSubir, onQuitar, subiendo }) {
  const archivo = useRef(null);
  return (
    <div className="space-y-2">
      {url ? (
        <div className="group relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-muted/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-contain" />
          {subiendo && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/70">
              <Rueda />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => archivo.current?.click()}
          disabled={subiendo}
          className="pulsable flex aspect-[9/16] w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-marca-200 px-3 text-center text-muted-foreground transition hover:border-marca-400 hover:text-marca-700 disabled:opacity-50"
        >
          {subiendo ? (
            <Rueda />
          ) : (
            <>
              <Imagen className="h-6 w-6" />
              <span className="text-chico font-bold">Subir captura</span>
              <span className="text-xs">Vertical, como la pantalla del celular</span>
            </>
          )}
        </button>
      )}

      {url && (
        <div className="flex gap-1">
          <BotonAccion tono="neutro" tamano="chico" className="flex-1" onClick={() => archivo.current?.click()} disabled={subiendo}>
            Cambiar
          </BotonAccion>
          <BotonAccion tono="peligroSuave" tamano="chico" onClick={onQuitar} disabled={subiendo}>
            Quitar
          </BotonAccion>
        </div>
      )}

      <input
        ref={archivo}
        type="file"
        accept={TIPOS_ACEPTADOS.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onSubir(f);
        }}
      />
    </div>
  );
}

/** Cómo se ve la guía en el teléfono del cliente, mientras se edita. */
function VistaPrevia({ guia }) {
  const pasos = guia.pasos.filter(conContenido);
  return (
    <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[30px] border-[8px] border-marca-950 bg-[#EFF3F9] shadow-alzado">
      <div className="bg-marca-900 px-4 pb-5 pt-6">
        <p className="text-xs font-bold uppercase tracking-wider text-white/60">Guía</p>
        <p className="font-heading text-lg font-semibold text-white">{guia.banco}</p>
      </div>
      <div className="scroll-fino max-h-[560px] space-y-2.5 overflow-y-auto p-3">
        {pasos.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-chico text-[#626D82]">Aún no tiene pasos configurados.</p>
        ) : (
          pasos.map((p, i) => (
            <div key={i} className="flex gap-2.5 rounded-2xl border border-[#E3E9F2] bg-white p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marca-700 text-xs font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-bold text-marca-700">{p.titulo || "Sin título"}</p>
                {p.descripcion && <p className="text-chico leading-snug text-[#4F5B74]">{p.descripcion}</p>}
                {p.imagen_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagen_url} alt="" className="max-h-60 w-full rounded-lg bg-slate-50 object-contain" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function GuiasPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [guias, setGuias] = useState([]);
  const [editando, setEditando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(null); // índice del paso
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [nuevoBanco, setNuevoBanco] = useState("");
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [confirmar, ventanaConfirmar] = useConfirmar();
  // La guía tal como estaba al abrirla, y lo subido en esta edición:
  // sirven para borrar las imágenes que quedan sin usar.
  const original = useRef(null);
  const subidas = useRef([]);
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargarGuias();
    });
  }, [router]);

  async function cargarGuias() {
    setLoading(true);
    const { data, error: e } = await supabase.from("guias_banco").select("*").order("banco");
    if (e) setError(explicarError(e));
    setGuias(data || []);
    setLoading(false);
  }

  const nombreNuevo = nuevoBanco.trim();
  const fallaBanco = !nombreNuevo
    ? null
    : nombreNuevo.length < 2
      ? "Escribe el nombre del banco."
      : guias.some((g) => g.banco.trim().toLowerCase() === nombreNuevo.toLowerCase())
        ? "Ese banco ya tiene guía."
        : null;

  async function crearGuia(banco) {
    const nombre = banco.trim();
    if (!nombre || guias.some((g) => g.banco.trim().toLowerCase() === nombre.toLowerCase())) return;
    const { error: e } = await supabase.from("guias_banco").insert({
      banco: nombre,
      activa: true,
      pasos: [],
      actualizado_por: session.user.id,
    });
    if (e) return setError(explicarError(e));

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "CREAR_GUIA_BANCO",
      entidad: "guias_banco",
      datos_despues: { banco: nombre },
    });

    setNuevoBanco("");
    setOk(`Guía de ${nombre} creada. Ábrela para agregar sus pasos.`);
    cargarGuias();
  }

  async function toggleGuia(guia) {
    if (guia.activa) {
      const si = await confirmar({
        titulo: `¿Ocultar la guía de ${guia.banco}?`,
        texto: "Los clientes dejan de verla en la app. Sus pasos se conservan y puedes volver a activarla.",
        boton: "Ocultar",
        tono: "atencion",
      });
      if (!si) return;
    }
    const { error: e } = await supabase
      .from("guias_banco")
      .update({ activa: !guia.activa, actualizado_por: session.user.id })
      .eq("id", guia.id);
    if (e) return setError(explicarError(e));
    setOk(`Guía de ${guia.banco} ${guia.activa ? "oculta" : "visible en la app"}.`);
    cargarGuias();
  }

  function editarGuia(guia) {
    const copia = {
      ...guia,
      pasos: (guia.pasos || []).map((p) => ({ ...p, descripcion: p.descripcion || "", imagen_url: p.imagen_url || null })),
    };
    original.current = copia;
    subidas.current = [];
    setError("");
    setIntentoGuardar(false);
    setEditando(copia);
  }

  const hayCambios = editando && JSON.stringify(editando) !== JSON.stringify(original.current);

  async function salirDeEdicion() {
    if (hayCambios) {
      const si = await confirmar({
        titulo: "¿Salir sin guardar?",
        texto: "Tienes cambios sin guardar en esta guía. Si sales, se pierden.",
        boton: "Descartar cambios",
        cancelar: "Seguir editando",
        tono: "peligro",
      });
      if (!si) return;
    }
    // Lo subido en esta edición y nunca guardado queda huérfano.
    await borrarImagenes(BUCKET, subidas.current);
    subidas.current = [];
    setEditando(null);
  }

  /** Sube una imagen y devuelve su URL pública, o null si falló. */
  async function subir(file, cual) {
    setError("");
    setSubiendo(cual);
    const { paths, error: e } = await subirImagenes(BUCKET, [file], carpetaDe(editando.banco));
    setSubiendo(null);
    if (e) {
      setError(e);
      return null;
    }
    subidas.current.push(paths[0]);
    return urlPublica(BUCKET, paths[0]);
  }

  async function subirImagenPaso(index, file) {
    const url = await subir(file, index);
    if (url) actualizarPaso(index, "imagen_url", url);
  }

  function agregarPaso() {
    setEditando((g) => ({
      ...g,
      pasos: [...g.pasos, { orden: g.pasos.length + 1, titulo: "", descripcion: "", imagen_url: null }],
    }));
  }

  function actualizarPaso(index, campo, valor) {
    setEditando((g) => {
      const nuevos = [...g.pasos];
      nuevos[index] = { ...nuevos[index], [campo]: valor };
      return { ...g, pasos: nuevos };
    });
  }

  async function eliminarPaso(index) {
    const paso = editando.pasos[index];
    if (conContenido(paso)) {
      const si = await confirmar({
        titulo: `¿Eliminar el paso ${paso.orden}?`,
        texto: paso.titulo ? `«${paso.titulo}» y su captura se quitan de la guía.` : "Se quita de la guía.",
        boton: "Eliminar paso",
        tono: "peligro",
      });
      if (!si) return;
    }
    setEditando((g) => ({
      ...g,
      pasos: g.pasos.filter((_, i) => i !== index).map((p, i) => ({ ...p, orden: i + 1 })),
    }));
  }

  function moverPaso(index, direccion) {
    setEditando((g) => {
      const nuevos = [...g.pasos];
      const target = index + direccion;
      if (target < 0 || target >= nuevos.length) return g;
      [nuevos[index], nuevos[target]] = [nuevos[target], nuevos[index]];
      return { ...g, pasos: nuevos.map((p, i) => ({ ...p, orden: i + 1 })) };
    });
  }

  async function guardarGuia() {
    setIntentoGuardar(true);
    // Un paso del todo vacío se descarta; uno con contenido pero sin
    // título se marca en rojo: antes se perdía sin decir nada.
    const llenos = editando.pasos.filter(conContenido);
    const sinTitulo = llenos.find((p) => !p.titulo.trim());
    if (sinTitulo) return setError(`El paso ${sinTitulo.orden} no tiene título. Escríbelo o elimina el paso.`);

    const pasosLimpios = llenos.map((p, i) => ({
      orden: i + 1,
      titulo: p.titulo.trim(),
      descripcion: p.descripcion.trim(),
      imagen_url: p.imagen_url || null,
    }));

    setGuardando(true);
    setError("");
    const { error: e } = await supabase
      .from("guias_banco")
      .update({ pasos: pasosLimpios, actualizado_por: session.user.id })
      .eq("id", editando.id);

    if (e) {
      setGuardando(false);
      return setError(explicarError(e));
    }

    // Imágenes que ya no usa la guía: las reemplazadas o quitadas, y las
    // subidas en esta edición que se cambiaron antes de guardar.
    const enUso = new Set(pathsDe({ ...editando, pasos: pasosLimpios }));
    const sobran = [...pathsDe(original.current), ...subidas.current].filter((p) => !enUso.has(p));
    await borrarImagenes(BUCKET, [...new Set(sobran)]);
    subidas.current = [];

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "EDITAR_GUIA_BANCO",
      entidad: "guias_banco",
      entidad_id: editando.id,
      datos_despues: {
        banco: editando.banco,
        total_pasos: pasosLimpios.length,
        pasos_con_imagen: pasosLimpios.filter((p) => p.imagen_url).length,
      },
    });

    setGuardando(false);
    setOk(`Guía de ${editando.banco} guardada: ${pasosLimpios.length} paso${pasosLimpios.length === 1 ? "" : "s"}.`);
    setEditando(null);
    cargarGuias();
  }

  if (!session) return <CargaPantalla />;

  // ── Edición de una guía ──
  if (editando) {
    return (
      <Shell
        session={session}
        titulo={`Guía de ${editando.banco}`}
        descripcion="Lo que el cliente ve al tocar la guía de su banco"
        volver={{ onClick: salirDeEdicion, texto: "Volver a la lista" }}
        acciones={
          <>
            <BotonAccion tono="neutro" onClick={agregarPaso} icono={<Mas className="h-4 w-4" />} className="hidden sm:inline-flex">
              Agregar paso
            </BotonAccion>
            <BotonAccion onClick={guardarGuia} cargando={guardando} disabled={subiendo !== null || !hayCambios}>
              {hayCambios ? "Guardar cambios" : "Sin cambios"}
            </BotonAccion>
          </>
        }
      >
        {error && (
          <Aviso className="mb-4" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            {editando.pasos.length === 0 ? (
              <Vacio
                icono={<Libro />}
                titulo="Esta guía no tiene pasos"
                detalle="Una captura por paso ayuda mucho: el cliente ve exactamente qué tocar en la app de su banco."
                accion={
                  <BotonAccion onClick={agregarPaso} icono={<Mas className="h-4 w-4" />}>
                    Agregar el primer paso
                  </BotonAccion>
                }
              />
            ) : (
              editando.pasos.map((paso, index) => {
                const faltaTitulo = intentoGuardar && conContenido(paso) && !paso.titulo.trim();
                return (
                  <Panel
                    key={index}
                    tono={faltaTitulo ? "peligro" : undefined}
                    titulo={
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-marca-700 text-xs font-bold text-white">{paso.orden}</span>
                        Paso {paso.orden}
                      </span>
                    }
                    acciones={
                      <>
                        <BotonMover texto="Subir el paso" onClick={() => moverPaso(index, -1)} disabled={index === 0}>
                          ↑
                        </BotonMover>
                        <BotonMover texto="Bajar el paso" onClick={() => moverPaso(index, 1)} disabled={index === editando.pasos.length - 1}>
                          ↓
                        </BotonMover>
                        <Pista texto="Eliminar el paso">
                          <button
                            type="button"
                            onClick={() => eliminarPaso(index)}
                            aria-label="Eliminar el paso"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          >
                            <Basura className="h-4 w-4" />
                          </button>
                        </Pista>
                      </>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_170px]">
                      <div className="space-y-3">
                        <Campo etiqueta="Título del paso" htmlFor={`titulo-${index}`} requerido>
                          <input
                            id={`titulo-${index}`}
                            value={paso.titulo}
                            maxLength={80}
                            onChange={(e) => actualizarPaso(index, "titulo", e.target.value)}
                            aria-invalid={faltaTitulo}
                            placeholder={`Ej: Abre tu app ${editando.banco}`}
                            className="campo"
                          />
                          {faltaTitulo && <MensajeError>Escribe el título o elimina el paso.</MensajeError>}
                        </Campo>
                        <Campo etiqueta="Descripción" htmlFor={`desc-${index}`} opcional>
                          <textarea
                            id={`desc-${index}`}
                            value={paso.descripcion}
                            maxLength={300}
                            onChange={(e) => actualizarPaso(index, "descripcion", e.target.value)}
                            placeholder="Ej: Ve a Transferencias > A otros bancos"
                            rows={4}
                            className="campo"
                          />
                        </Campo>
                      </div>
                      <Campo etiqueta="Captura" opcional>
                        <SubirImagen
                          url={paso.imagen_url}
                          subiendo={subiendo === index}
                          onSubir={(f) => subirImagenPaso(index, f)}
                          onQuitar={() => actualizarPaso(index, "imagen_url", null)}
                        />
                      </Campo>
                    </div>
                  </Panel>
                );
              })
            )}

            {editando.pasos.length > 0 && (
              <button
                type="button"
                onClick={agregarPaso}
                className="pulsable flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-marca-200 py-4 text-sm font-bold text-muted-foreground hover:border-marca-400 hover:text-marca-700"
              >
                <Mas className="h-4 w-4" />
                Agregar otro paso
              </button>
            )}
          </div>

          {/* Vista previa, fija al bajar */}
          <div className="lg:sticky lg:top-[76px] lg:self-start">
            <p className="mb-3 text-center t-etiqueta">Así lo ve el cliente</p>
            <VistaPrevia guia={editando} />
          </div>
        </div>
        {ventanaConfirmar}
      </Shell>
    );
  }

  // ── Lista de guías ──
  const faltantes = BANCOS_DEFAULT.filter((b) => !guias.find((g) => g.banco === b));

  return (
    <Shell
      session={session}
      titulo="Guías de banco"
      descripcion={`${guias.filter((g) => g.activa).length} visibles en la app`}
      ayuda="Pasos para operar en la app de cada banco. El cliente solo ve la guía de los bancos donde tiene una tarjeta verificada."
    >
      {error && (
        <Aviso className="mb-4" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Esqueleto key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : guias.length === 0 ? (
            <Vacio icono={<Libro />} titulo="No hay guías creadas" detalle="Agrega un banco en el panel de la derecha." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {guias.map((guia) => {
                const pasos = guia.pasos || [];
                const conImagen = pasos.filter((p) => p.imagen_url).length;
                const muestra = pasos.find((p) => p.imagen_url)?.imagen_url;
                return (
                  <div key={guia.id} className={cn("flex overflow-hidden rounded-xl border border-border bg-card shadow-panel", !guia.activa && "opacity-70")}>
                    <button onClick={() => editarGuia(guia)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-muted/30">
                      <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                        {muestra ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={muestra} alt="" className="h-full w-full object-cover object-top" />
                        ) : (
                          <Libro className="h-6 w-6" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-heading text-md font-semibold">{guia.banco}</p>
                        <p className="text-sm text-muted-foreground">
                          {pasos.length} {pasos.length === 1 ? "paso" : "pasos"}
                          {pasos.length ? ` · ${conImagen} con captura` : ""}
                        </p>
                        {pasos.length === 0 && <p className="mt-0.5 text-chico font-bold text-oro-700">Sin pasos: el cliente la ve vacía</p>}
                        {guia.updated_at && (
                          <p className="text-xs text-muted-foreground">Editada el {new Date(guia.updated_at).toLocaleDateString("es-PE")}</p>
                        )}
                      </div>
                    </button>
                    <div className="flex flex-col items-center justify-between border-l border-border p-2">
                      <Pista texto="Editar los pasos">
                        <button
                          onClick={() => editarGuia(guia)}
                          aria-label={`Editar la guía de ${guia.banco}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Lapiz className="h-4 w-4" />
                        </button>
                      </Pista>
                      <Pista texto={guia.activa ? "Visible en la app. Pulsa para ocultarla." : "Oculta. Pulsa para mostrarla en la app."} fin>
                        <button
                          role="switch"
                          aria-checked={guia.activa}
                          aria-label={guia.activa ? "Ocultar" : "Mostrar"}
                          onClick={() => toggleGuia(guia)}
                          className={cn("relative h-6 w-11 rounded-full transition", guia.activa ? "bg-emerald-600" : "bg-marca-200")}
                        >
                          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", guia.activa ? "left-[22px]" : "left-0.5")} />
                        </button>
                      </Pista>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Panel titulo="Agregar banco" className="self-start">
          <div className="space-y-3">
            {faltantes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {faltantes.map((b) => (
                  <BotonAccion key={b} tono="neutro" tamano="chico" onClick={() => crearGuia(b)} icono={<Mas className="h-3.5 w-3.5" />}>
                    {b}
                  </BotonAccion>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!fallaBanco) crearGuia(nuevoBanco);
              }}
            >
              <Campo etiqueta="Otro banco" htmlFor="nuevoBanco" error={fallaBanco}>
                <div className="flex gap-2">
                  <input
                    id="nuevoBanco"
                    placeholder="Ej: Caja Arequipa"
                    maxLength={40}
                    value={nuevoBanco}
                    onChange={(e) => setNuevoBanco(e.target.value)}
                    aria-invalid={Boolean(fallaBanco)}
                    className="campo"
                  />
                  <BotonAccion type="submit" disabled={!nombreNuevo || Boolean(fallaBanco)}>
                    Agregar
                  </BotonAccion>
                </div>
              </Campo>
            </form>
          </div>
        </Panel>
      </div>

      {ventanaConfirmar}
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

function BotonMover({ texto, onClick, disabled, children }) {
  return (
    <Pista texto={texto}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={texto}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-md font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        {children}
      </button>
    </Pista>
  );
}
