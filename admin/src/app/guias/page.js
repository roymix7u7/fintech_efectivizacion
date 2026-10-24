"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import { subirImagenes, borrarImagenes, urlPublica, TIPOS_ACEPTADOS } from "@/lib/imagenes";
import { cn } from "@/lib/utils";
import Shell from "@/components/shell";
import { Aviso } from "@/components/marca";
import { Rueda } from "@/components/carga";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

/**
 * Elegir una imagen y subirla. Muestra la que hay (o el hueco punteado)
 * y deja cambiarla o quitarla.
 */
function SubirImagen({ url, onSubir, onQuitar, subiendo, proporcion = "aspect-video", texto, ayuda }) {
  const archivo = useRef(null);
  return (
    <div className="space-y-2">
      {url ? (
        <div className={cn("group relative overflow-hidden rounded-lg border border-border bg-muted/40", proporcion)}>
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
          className={cn(
            "pulsable flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted-foreground transition hover:border-marca-400 hover:text-marca-700 disabled:opacity-50",
            proporcion,
          )}
        >
          {subiendo ? (
            <Rueda />
          ) : (
            <>
              <span className="text-xl leading-none">+</span>
              <span className="text-[0.8rem] font-medium">{texto}</span>
              {ayuda && <span className="px-4 text-[0.72rem]">{ayuda}</span>}
            </>
          )}
        </button>
      )}

      {url && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => archivo.current?.click()}
            disabled={subiendo}
            className="pulsable rounded-md border border-border px-2.5 py-1.5 text-[0.75rem] font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cambiar imagen
          </button>
          <button
            type="button"
            onClick={onQuitar}
            disabled={subiendo}
            className="pulsable rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Quitar
          </button>
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
  const pasos = guia.pasos.filter((p) => p.titulo.trim() || p.descripcion?.trim() || p.imagen_url);
  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-[#EFF3F9] shadow-xl">
      <div className="bg-[#0F1B33] px-4 pb-5 pt-6">
        <p className="text-[0.7rem] font-medium uppercase tracking-wider text-white/60">Guía</p>
        <p className="text-lg font-semibold text-white">{guia.banco}</p>
      </div>
      <div className="max-h-[520px] space-y-2.5 overflow-y-auto p-3">
        {pasos.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-[0.75rem] text-slate-500">
            Aún no tiene pasos configurados.
          </p>
        ) : (
          pasos.map((p, i) => (
            <div key={i} className="flex gap-2.5 rounded-2xl border border-[#E3E9F2] bg-white p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1B2A4A] text-[0.7rem] font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[0.8rem] font-semibold text-slate-900">{p.titulo || "Sin título"}</p>
                {p.descripcion && <p className="text-[0.72rem] leading-snug text-slate-600">{p.descripcion}</p>}
                {p.imagen_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagen_url} alt="" className="max-h-56 w-full rounded-lg bg-slate-50 object-contain" />
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
  const [nuevoBanco, setNuevoBanco] = useState("");
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

  async function crearGuia(banco) {
    if (!banco.trim()) return;
    const { error: e } = await supabase.from("guias_banco").insert({
      banco: banco.trim(),
      activa: true,
      pasos: [],
      actualizado_por: session.user.id,
    });
    if (e) return setError(explicarError(e));

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "CREAR_GUIA_BANCO",
      entidad: "guias_banco",
      datos_despues: { banco: banco.trim() },
    });

    setNuevoBanco("");
    cargarGuias();
  }

  async function toggleGuia(guia) {
    const { error: e } = await supabase
      .from("guias_banco")
      .update({ activa: !guia.activa, actualizado_por: session.user.id })
      .eq("id", guia.id);
    if (e) return setError(explicarError(e));
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
    setEditando(copia);
  }

  const hayCambios = editando && JSON.stringify(editando) !== JSON.stringify(original.current);

  async function salirDeEdicion() {
    if (hayCambios && !window.confirm("Tienes cambios sin guardar. ¿Salir y descartarlos?")) return;
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

  function eliminarPaso(index) {
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
    // Un paso del todo vacío se descarta; uno con contenido pero sin
    // título se avisa: antes se perdía sin decir nada.
    const conContenido = editando.pasos.filter((p) => p.titulo.trim() || p.descripcion.trim() || p.imagen_url);
    const sinTitulo = conContenido.findIndex((p) => !p.titulo.trim());
    if (sinTitulo !== -1) {
      return setError(`El paso ${conContenido[sinTitulo].orden} no tiene título. Escríbelo o elimina el paso.`);
    }
    const pasosLimpios = conContenido.map((p, i) => ({
      orden: i + 1,
      titulo: p.titulo.trim(),
      descripcion: p.descripcion.trim(),
      imagen_url: p.imagen_url || null,
    }));

    setGuardando(true);
    setError("");
    const { error: e } = await supabase
      .from("guias_banco")
      .update({
        pasos: pasosLimpios,
        actualizado_por: session.user.id,
      })
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
    setEditando(null);
    cargarGuias();
  }

  if (!session) return null;

  // ── Edición de una guía ──
  if (editando) {
    return (
      <Shell
        session={session}
        titulo={`Guía de ${editando.banco}`}
        descripcion="Lo que el cliente ve en su app al tocar la guía de su banco"
        acciones={
          <div className="flex gap-2">
            <button
              onClick={salirDeEdicion}
              className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-muted"
            >
              Volver a la lista
            </button>
            <Button onClick={guardarGuia} disabled={guardando || subiendo !== null || !hayCambios}>
              {guardando ? "Guardando..." : hayCambios ? "Guardar cambios" : "Sin cambios"}
            </Button>
          </div>
        }
      >
        {error && (
          <div className="mb-4">
            <Aviso onCerrar={() => setError("")}>{error}</Aviso>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {/* Pasos */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[0.95rem] font-semibold">Pasos</h3>
                <p className="text-[0.8rem] text-muted-foreground">
                  Una captura por paso ayuda mucho: el cliente ve exactamente qué tocar en la app de su banco.
                </p>
              </div>
              <Button variant="outline" onClick={agregarPaso}>
                + Agregar paso
              </Button>
            </div>

            {editando.pasos.length === 0 ? (
              <button
                onClick={agregarPaso}
                className="pulsable w-full rounded-xl border border-dashed border-border bg-card/60 py-12 text-center text-[0.85rem] text-muted-foreground hover:border-marca-400 hover:text-marca-700"
              >
                No hay pasos. Agrega el primero.
              </button>
            ) : (
              <div className="space-y-4">
                {editando.pasos.map((paso, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-marca-700 text-xs font-bold text-white">
                            {paso.orden}
                          </span>
                          <span className="text-sm text-muted-foreground">Paso {paso.orden}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => moverPaso(index, -1)}
                            disabled={index === 0}
                            aria-label="Subir paso"
                            className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moverPaso(index, 1)}
                            disabled={index === editando.pasos.length - 1}
                            aria-label="Bajar paso"
                            className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => eliminarPaso(index)}
                            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Título del paso</Label>
                            <Input
                              value={paso.titulo}
                              onChange={(e) => actualizarPaso(index, "titulo", e.target.value)}
                              placeholder={`Ej: Abre tu app ${editando.banco}`}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Descripción</Label>
                            <Textarea
                              value={paso.descripcion}
                              onChange={(e) => actualizarPaso(index, "descripcion", e.target.value)}
                              placeholder="Ej: Ve a Transferencias > A otros bancos"
                              rows={3}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Captura (opcional)</Label>
                          <SubirImagen
                            url={paso.imagen_url}
                            subiendo={subiendo === index}
                            onSubir={(f) => subirImagenPaso(index, f)}
                            onQuitar={() => actualizarPaso(index, "imagen_url", null)}
                            proporcion="aspect-[9/16]"
                            texto="Subir captura"
                            ayuda="Vertical, como la pantalla del celular."
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Vista previa, fija al bajar */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-3 text-center text-[0.75rem] font-medium uppercase tracking-wider text-muted-foreground">
              Así lo ve el cliente
            </p>
            <VistaPrevia guia={editando} />
          </div>
        </div>
      </Shell>
    );
  }

  // ── Lista de guías ──
  return (
    <Shell session={session} titulo="Guías de banco" descripcion="Pasos para operar por entidad">
      <div className="max-w-3xl">
        {error && (
          <div className="mb-4">
            <Aviso onCerrar={() => setError("")}>{error}</Aviso>
          </div>
        )}

        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="mb-3 font-semibold">Agregar banco</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {BANCOS_DEFAULT.filter((b) => !guias.find((g) => g.banco === b)).map((b) => (
                <Button key={b} variant="outline" size="sm" onClick={() => crearGuia(b)}>
                  + {b}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Otro banco..." value={nuevoBanco} onChange={(e) => setNuevoBanco(e.target.value)} />
              <Button onClick={() => crearGuia(nuevoBanco)} disabled={!nuevoBanco.trim()}>
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : guias.length === 0 ? (
          <p className="text-muted-foreground">No hay guías creadas. Agrega un banco arriba.</p>
        ) : (
          <div className="space-y-3">
            {guias.map((guia) => {
              const pasos = guia.pasos || [];
              const conImagen = pasos.filter((p) => p.imagen_url).length;
              return (
                <Card key={guia.id} className={!guia.activa ? "opacity-60" : ""}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <button className="flex flex-1 items-center gap-3 text-left" onClick={() => editarGuia(guia)}>
                      <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {pasos.find((p) => p.imagen_url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pasos.find((p) => p.imagen_url).imagen_url} alt="" className="h-full w-full object-cover object-top" />
                        ) : (
                          <span className="text-xl">🏦</span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">{guia.banco}</p>
                        <p className="text-sm text-muted-foreground">
                          {pasos.length} {pasos.length === 1 ? "paso" : "pasos"}
                          {pasos.length ? ` · ${conImagen} con captura` : ""}
                          {guia.updated_at && ` · Editado ${new Date(guia.updated_at).toLocaleDateString("es-PE")}`}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => editarGuia(guia)}>
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleGuia(guia)}
                        className={guia.activa ? "border-red-300 text-red-600" : "border-green-300 text-green-600"}
                      >
                        {guia.activa ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
