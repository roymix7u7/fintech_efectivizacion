"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import { subirImagenes, borrarImagenes, urlPublica, TIPOS_ACEPTADOS } from "@/lib/imagenes";
import { cn } from "@/lib/utils";
import Shell, { Megafono, Cruz, Mas, Lapiz, Basura, Campana } from "@/components/shell";
import { Vacio, Aviso, Estado } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, Rueda, CargaPantalla } from "@/components/carga";
import { Segmentos, Barra, Campo, Tostada, Leyenda, Panel, useConfirmar } from "@/components/piezas";
import Pista from "@/components/pista";

const BUCKET = "noticias-fotos";
const MAX_IMAGENES = 4;

/** Qué falta o está mal en el formulario, campo por campo. */
function erroresDe(form) {
  const e = {};
  if (form.titulo.trim().length < 5) e.titulo = "Ponle un título de al menos 5 letras.";
  if (form.mensaje.trim().length < 10) e.mensaje = "Escribe el mensaje para el cliente (al menos 10 letras).";
  if (form.fecha_fin && form.fecha_inicio && new Date(form.fecha_fin) <= new Date(form.fecha_inicio))
    e.fecha_fin = "Tiene que terminar después de empezar.";
  if (form.fecha_fin && new Date(form.fecha_fin) <= new Date()) e.fecha_fin = e.fecha_fin || "Esa fecha ya pasó: no se vería nunca.";
  return e;
}


/**
 * Dos cosas distintas que antes vivian mezcladas.
 *
 * Una noticia se navega: promociones, feriados, descuentos. El cliente
 * la lee cuando quiere y no pasa nada si la ve manana.
 *
 * Una alerta interrumpe: aparece como burbuja al abrir el app. "El BCP
 * no esta procesando hoy" leido pasado manana no es informacion, es
 * historia.
 */
const SECCIONES = [
  {
    clave: "noticia",
    titulo: "Noticias",
    detalle: "Promociones, feriados y novedades. Se navegan en el app.",
  },
  {
    clave: "alerta",
    titulo: "Alertas",
    detalle:
      "Avisos urgentes. Salen como burbuja al abrir el app y se quedan en su lista hasta que el cliente las abre.",
  },
];

const TIPOS = {
  promocion: {
    valor: "promocion",
    titulo: "Promoción",
    detalle: "Ofertas y campañas",
    chip: "bg-oro-100 text-oro-700 ring-oro-200",
    punto: "bg-oro-500",
  },
  info: {
    valor: "info",
    titulo: "Aviso",
    detalle: "Información general",
    chip: "bg-blue-50 text-blue-700 ring-blue-200",
    punto: "bg-blue-500",
  },
  advertencia: {
    valor: "advertencia",
    titulo: "Importante",
    detalle: "Algo que debe saber hoy",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    punto: "bg-amber-500",
  },
  critico: {
    valor: "critico",
    titulo: "Urgente",
    detalle: "La burbuja no se cierra sola",
    chip: "bg-red-50 text-red-700 ring-red-200",
    punto: "bg-red-500",
  },
};

// Una promocion no es una alerta, y una caida de banco no es una
// noticia. Cada seccion ofrece solo los tonos que tienen sentido en ella.
const TIPOS_DE = {
  noticia: [TIPOS.promocion, TIPOS.info, TIPOS.advertencia],
  alerta: [TIPOS.advertencia, TIPOS.critico, TIPOS.info],
};

const tipoDe = (v) => TIPOS[v] || TIPOS.info;

/**
 * Duraciones de un clic. Una promocion dura semanas; una alerta, horas:
 * ofrecer "1 mes" para una caida de banco invita a dejarla puesta
 * mucho despues de que el problema se arreglo.
 */
const DURACIONES = {
  noticia: [
    { horas: 24 * 7, texto: "1 semana" },
    { horas: 24 * 15, texto: "15 días" },
    { horas: 24 * 30, texto: "1 mes" },
    { horas: null, texto: "Sin vencimiento" },
  ],
  alerta: [
    { horas: 6, texto: "6 horas" },
    { horas: 24, texto: "1 día" },
    { horas: 24 * 3, texto: "3 días" },
    { horas: null, texto: "Hasta que la apague" },
  ],
};

const vacio = (categoria) => ({
  categoria,
  tipo: categoria === "alerta" ? "advertencia" : "promocion",
  titulo: "",
  mensaje: "",
  imagenes: [],
  fecha_inicio: "",
  fecha_fin: "",
  // Una alerta existe para interrumpir, asi que se notifica salvo que
  // se diga lo contrario. Una promocion no: mandar un aviso al telefono
  // por cada descuento es la forma mas rapida de que el cliente apague
  // las notificaciones del app entero, y entonces tampoco le llegan las
  // que si importan.
  notificar: categoria === "alerta",
});

// ── Fechas ────────────────────────────────────────────────────
// Los <input type="datetime-local"> hablan en hora local sin zona y la
// base guarda timestamptz. Estas funciones son la unica frontera entre
// los dos formatos.

function aInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

const aISO = (valor) => (valor ? new Date(valor).toISOString() : null);

function sumarHoras(desde, horas) {
  const base = desde ? new Date(desde) : new Date();
  return aInput(new Date(base.getTime() + horas * 3600000).toISOString());
}

const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const fechaHora = (iso) =>
  new Date(iso).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * En que punto de su vida esta un aviso.
 *
 * Es lo primero que se necesita saber al abrir la pantalla, y antes no
 * se podia: la lista solo decia activa o inactiva, asi que algo vencido
 * en marzo se veia igual que algo que sigue al aire.
 */
function vigenciaDe(n) {
  if (!n.activa) return { texto: "Apagada", tono: "neutro" };
  const ahora = Date.now();
  if (n.fecha_inicio && new Date(n.fecha_inicio).getTime() > ahora)
    return { texto: "Programada", tono: "info" };
  if (n.fecha_fin && new Date(n.fecha_fin).getTime() <= ahora)
    return { texto: "Vencida", tono: "neutro" };
  return { texto: "En el app", tono: "exito" };
}

// ── Vistas previas ────────────────────────────────────────────

const COLOR_ALERTA = { critico: "#D93025", advertencia: "#E8B800", info: "#2C4270" };

/** Marco de teléfono, compartido por las dos previas. */
function Telefono({ etiqueta, children }) {
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[30px] border-[8px] border-marca-950 bg-marca-950 shadow-alzado">
      <div className="min-h-[360px] rounded-[22px] bg-[#EFF3F9] p-3">
        <p className="px-1 pb-2 pt-1 text-xs font-bold text-marca-600">{etiqueta}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Cómo se verá. Con contenido que lleva imagen, describir el resultado
 * con palabras no alcanza: hace falta verlo antes de publicarlo a
 * treinta mil personas.
 */
function VistaPrevia({ form, urls }) {
  const t = tipoDe(form.tipo);

  if (form.categoria === "alerta") {
    const color = COLOR_ALERTA[t.valor] || COLOR_ALERTA.info;
    return (
      <Telefono etiqueta="Al abrir la app">
        <div className="flex gap-2.5 rounded-2xl border-l-4 bg-white p-3 shadow-lg shadow-marca-200/60" style={{ borderLeftColor: color }}>
          <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: color + "22" }} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: t.valor === "advertencia" ? "#8C6A00" : color }}>
              {t.titulo}
            </p>
            <p className="text-sm font-bold leading-snug text-marca-700">{form.titulo || "Título de la alerta"}</p>
            <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-[#4F5B74]">
              {form.mensaje || "Qué está pasando y qué debe hacer el cliente."}
            </p>
            <p className="mt-1.5 text-xs font-semibold text-[#626D82]">Toca para ver el detalle</p>
          </div>
          <Cruz className="h-4 w-4 shrink-0 text-[#8A93A6]" />
        </div>
        <p className="px-1 pt-3 text-xs leading-relaxed text-[#4F5B74]">
          {t.valor === "critico"
            ? "Urgente: la burbuja espera a que la toquen, no se cierra sola."
            : "Se cierra sola a los 7 segundos, pero sigue marcada como nueva en la pestaña Alertas."}
        </p>
      </Telefono>
    );
  }

  const dias = form.fecha_fin ? Math.ceil((new Date(form.fecha_fin).getTime() - Date.now()) / 86400000) : null;

  return (
    <Telefono etiqueta="Noticias">
      <div className="overflow-hidden rounded-2xl border border-[#E3E9F2] bg-white">
        {urls.length > 0 ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[0]} alt="" className="h-[140px] w-full object-cover" />
            <span className={cn("absolute left-2 top-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold", t.chip.split(" ")[1])}>
              {t.titulo}
            </span>
            {urls.length > 1 && (
              <span className="absolute right-2 top-2 rounded-lg bg-marca-950/60 px-1.5 py-0.5 text-xs font-bold text-white">
                1/{urls.length}
              </span>
            )}
          </div>
        ) : (
          <div className={cn("flex h-14 items-center justify-center text-xs font-bold", t.chip)}>{t.titulo}</div>
        )}

        <div className="space-y-1 p-3">
          <p className="text-md font-bold leading-snug text-marca-700">{form.titulo || "Título de la noticia"}</p>
          <p className="line-clamp-4 text-chico leading-relaxed text-[#4F5B74]">{form.mensaje || "Aquí va el texto que leerá el cliente."}</p>
          <div className="flex items-center gap-1 border-t border-[#E8EDF5] pt-2 text-xs text-[#626D82]">
            <span>{new Date(form.fecha_inicio || Date.now()).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span>
            {dias !== null && (
              <span className={cn("ml-auto rounded-full px-2 py-0.5 font-bold", dias <= 3 ? "bg-red-50 text-red-600" : "bg-[#E8EDF5] text-[#4F5B74]")}>
                {dias <= 0
                  ? "Último día"
                  : dias === 1
                    ? "Queda 1 día"
                    : dias <= 7
                      ? `Quedan ${dias} días`
                      : `Hasta el ${new Date(form.fecha_fin).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </Telefono>
  );
}

// ── Pantalla ──────────────────────────────────────────────────

export default function NoticiasPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [filas, setFilas] = useState([]);
  const [alcance, setAlcance] = useState({});
  const [loading, setLoading] = useState(true);
  const [seccion, setSeccion] = useState("noticia");
  const [editando, setEditando] = useState(null); // null | "nueva" | id
  const [form, setForm] = useState(vacio("noticia"));
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [notificando, setNotificando] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const archivoRef = useRef(null);
  const [filtroVig, setFiltroVig] = useState("todas");
  const [tocado, setTocado] = useState(false);
  const [confirmar, ventanaConfirmar] = useConfirmar();
  const router = useRouter();

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase
      .from("alertas_sistema")
      .select("*")
      .order("fecha_inicio", { ascending: false });
    if (e) setError(explicarError(e, "No se pudieron cargar los avisos."));
    setFilas(data || []);

    // Cuantos clientes abrieron cada alerta. Sin este numero no hay
    // forma de saber si el mensaje llego.
    const { data: alc } = await supabase.rpc("alertas_alcance");
    const mapa = {};
    for (const fila of alc || [])
      mapa[fila.alerta_id] = { vistas: fila.vistas, clientes: fila.clientes };
    setAlcance(mapa);

    setLoading(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargar();
    });
  }, [router, cargar]);

  const visibles = useMemo(
    () => filas.filter((f) => (f.categoria || "noticia") === seccion),
    [filas, seccion],
  );

  const urlsForm = useMemo(
    () => form.imagenes.map((p) => urlPublica(BUCKET, p)).filter(Boolean),
    [form.imagenes],
  );

  const esAlerta = form.categoria === "alerta";

  function abrirNueva() {
    setForm({
      ...vacio(seccion),
      fecha_inicio: aInput(new Date().toISOString()),
      // Una alerta sin fecha de fin se queda puesta despues de que el
      // problema se resolvio. Se propone un dia por defecto.
      fecha_fin: seccion === "alerta" ? sumarHoras(null, 24) : "",
    });
    setEditando("nueva");
    setTocado(false);
    setError("");
    setOk("");
  }

  function abrirEdicion(n) {
    setForm({
      categoria: n.categoria || "noticia",
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      imagenes: n.imagenes || [],
      fecha_inicio: aInput(n.fecha_inicio),
      fecha_fin: aInput(n.fecha_fin),
      // Editar una coma no deberia volver a sonar en treinta mil
      // telefonos. Si hace falta reenviar, esta el boton de la lista.
      notificar: false,
    });
    setEditando(n.id);
    setTocado(false);
    setError("");
    setOk("");
  }

  function cerrar() {
    setEditando(null);
    setForm(vacio(seccion));
  }

  /**
   * Las imagenes se suben al elegirlas, no al guardar. Asi se ve
   * enseguida si una falla, en vez de perder el texto escrito cuando el
   * guardado se cae al final.
   */
  async function agregarImagenes(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const hueco = MAX_IMAGENES - form.imagenes.length;
    if (hueco <= 0) {
      setError(`Ya tienes el máximo de ${MAX_IMAGENES} imágenes.`);
      return;
    }

    setSubiendo(true);
    setError("");
    const { paths, error: e2 } = await subirImagenes(
      BUCKET,
      files.slice(0, hueco),
      "noticias",
    );
    setSubiendo(false);

    if (e2) return setError(e2);
    setForm((f) => ({ ...f, imagenes: [...f.imagenes, ...paths] }));
    if (files.length > hueco)
      setOk(`Se subieron ${hueco}: es el máximo por noticia.`);
  }

  /** Quita una imagen del formulario y del bucket, para que no quede
   *  ocupando espacio sin que nadie sepa de quién era. */
  async function quitarImagen(path) {
    setForm((f) => ({ ...f, imagenes: f.imagenes.filter((p) => p !== path) }));
    await borrarImagenes(BUCKET, [path]);
  }

  /** Mueve una imagen. La primera es la portada, por eso importa. */
  function moverImagen(indice, salto) {
    const destino = indice + salto;
    if (destino < 0 || destino >= form.imagenes.length) return;
    const lista = [...form.imagenes];
    [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
    setForm((f) => ({ ...f, imagenes: lista }));
  }

  function validar() {
    return Object.values(erroresDe(form))[0] || null;
  }

  async function guardar() {
    const fallo = validar();
    if (fallo) {
      setTocado(true);
      return;
    }

    setGuardando(true);
    setError("");

    const campos = {
      categoria: form.categoria,
      titulo: form.titulo.trim(),
      mensaje: form.mensaje.trim(),
      tipo: form.tipo,
      // Una alerta no lleva imagenes: se lee de un vistazo y una foto
      // solo retrasaria el aviso.
      imagenes: esAlerta ? [] : form.imagenes,
      fecha_inicio: aISO(form.fecha_inicio) || new Date().toISOString(),
      fecha_fin: aISO(form.fecha_fin),
    };

    const nombre = esAlerta ? "alerta" : "noticia";

    if (editando === "nueva") {
      const { data: creada, error: e } = await supabase
        .from("alertas_sistema")
        .insert({ ...campos, activa: true, creada_por: session.user.id })
        .select("id")
        .single();
      if (e) {
        setGuardando(false);
        return setError(explicarError(e, "No se pudo publicar."));
      }
      await registrarAuditoria({
        usuario_id: session.user.id,
        accion: "CREAR_ALERTA",
        entidad: "alertas_sistema",
        datos_despues: {
          titulo: campos.titulo,
          tipo: campos.tipo,
          categoria: campos.categoria,
        },
      });
      setOk(
        esAlerta
          ? "Alerta publicada. A quien tenga el app abierta le aparece ya mismo."
          : "Noticia publicada. Ya se ve en el app.",
      );

      // Despues de guardar, no antes: si el guardado falla, no puede
      // haber sonado ya un aviso de algo que no existe.
      if (form.notificar && creada?.id) await notificar(creada.id, true);
    } else {
      const { error: e } = await supabase
        .from("alertas_sistema")
        .update(campos)
        .eq("id", editando);
      if (e) {
        setGuardando(false);
        return setError(explicarError(e, "No se pudo guardar."));
      }
      await registrarAuditoria({
        usuario_id: session.user.id,
        accion: "EDITAR_ALERTA",
        entidad: "alertas_sistema",
        entidad_id: editando,
        datos_despues: { titulo: campos.titulo, categoria: campos.categoria },
      });
      setOk(`Cambios guardados en la ${nombre}.`);
    }

    setGuardando(false);
    cerrar();
    cargar();
  }

  /**
   * Manda la alerta a los telefonos.
   *
   * El envio va por una funcion del servidor: leer los tokens de todos
   * los clientes desde el navegador obligaria a abrir esa tabla a
   * cualquiera con sesion.
   */
  async function notificar(id, silencioso = false) {
    setNotificando(id);
    const { data, error: e } = await supabase.functions.invoke(
      "enviar-alerta-push",
      { body: { alerta_id: id } },
    );
    setNotificando(null);

    if (e) {
      // El mensaje de arriba solo dice que la funcion devolvio un
      // codigo distinto de 200. El motivo real viene en el cuerpo.
      let mensaje = e.message;
      try {
        const cuerpo = await e.context?.json?.();
        if (cuerpo?.error) mensaje = cuerpo.error;
      } catch {}
      setError("No se pudo notificar: " + mensaje);
      return false;
    }

    if (data?.aviso) setOk(data.aviso);
    else
      setOk(
        `Notificación enviada a ${data?.enviados ?? 0} teléfono${data?.enviados === 1 ? "" : "s"}.` +
          (data?.invalidos
            ? ` ${data.invalidos} ya no tenían el app instalada.`
            : ""),
      );
    if (!silencioso) cargar();
    return true;
  }

  async function alternar(n) {
    const activa = !n.activa;
    const { error: e } = await supabase
      .from("alertas_sistema")
      .update({ activa })
      .eq("id", n.id);
    if (e) return setError(explicarError(e, "No se pudo cambiar el estado."));

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: activa ? "ACTIVAR_ALERTA" : "DESACTIVAR_ALERTA",
      entidad: "alertas_sistema",
      entidad_id: n.id,
      datos_antes: { activa: n.activa },
      datos_despues: { activa },
    });
    cargar();
  }

  async function eliminar(n) {
    const si = await confirmar({
      titulo: `¿Eliminar "${n.titulo}"?`,
      texto: "Se borran el aviso y sus imágenes. Si solo quieres que deje de verse, apágalo. Esto no se puede deshacer.",
      boton: "Eliminar",
      tono: "peligro",
    });
    if (!si) return;

    const { error: e } = await supabase
      .from("alertas_sistema")
      .delete()
      .eq("id", n.id);
    if (e) return setError(explicarError(e, "No se pudo eliminar."));

    // Las imagenes despues de la fila: si se borran antes y el delete
    // falla, queda un aviso apuntando a archivos que ya no existen.
    await borrarImagenes(BUCKET, n.imagenes);
    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "ELIMINAR_ALERTA",
      entidad: "alertas_sistema",
      entidad_id: n.id,
      datos_antes: { titulo: n.titulo },
    });
    setOk("Eliminado.");
    cargar();
  }

  if (!session) return <CargaPantalla />;

  const deSeccion = visibles;
  const cuentaVig = (texto) => deSeccion.filter((n) => vigenciaDe(n).texto === texto).length;
  const alAire = cuentaVig("En el app");
  const lista = deSeccion.filter((n) => {
    const v = vigenciaDe(n).texto;
    if (filtroVig === "aire") return v === "En el app";
    if (filtroVig === "programadas") return v === "Programada";
    if (filtroVig === "fuera") return v === "Apagada" || v === "Vencida";
    return true;
  });
  const errores = editando ? erroresDe(form) : {};
  const err = (k) => (tocado ? errores[k] : null);
  const nombreSec = seccion === "alerta" ? "alerta" : "noticia";

  // ── Edición: ocupa la pantalla, con la vista previa al lado ──
  if (editando) {
    return (
      <Shell
        session={session}
        titulo={editando === "nueva" ? (esAlerta ? "Nueva alerta" : "Nueva noticia") : `Editar ${esAlerta ? "alerta" : "noticia"}`}
        descripcion={esAlerta ? "Sale como burbuja al abrir la app y queda en su pestaña de alertas" : "Se publica para todos los clientes de la app"}
        volver={{ onClick: cerrar, texto: "Volver a la lista sin guardar" }}
        acciones={
          <>
            <BotonAccion tono="neutro" onClick={cerrar} className="hidden sm:inline-flex">
              Cancelar
            </BotonAccion>
            <BotonAccion onClick={guardar} cargando={guardando} disabled={subiendo || (tocado && Object.keys(errores).length > 0)}>
              {editando === "nueva" ? (esAlerta ? "Enviar alerta" : "Publicar") : "Guardar cambios"}
            </BotonAccion>
          </>
        }
      >
        {error && (
          <Aviso className="mb-4" titulo="Revisa esto" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <Panel titulo="Contenido">
              <div className="space-y-4">
                <Campo etiqueta="Tono" ayuda="Decide el color y la etiqueta con que aparece en la app.">
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tono">
                    {TIPOS_DE[form.categoria].map((t) => (
                      <button
                        key={t.valor}
                        type="button"
                        role="radio"
                        aria-checked={form.tipo === t.valor}
                        onClick={() => setForm({ ...form, tipo: t.valor })}
                        className={cn(
                          "pulsable flex items-center gap-2.5 rounded-lg border p-2.5 text-left",
                          form.tipo === t.valor ? "border-marca-500 bg-marca-50 ring-1 ring-marca-500" : "border-border hover:bg-muted/60",
                        )}
                      >
                        <span className={cn("h-3 w-3 shrink-0 rounded-full", t.punto)} />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-foreground">{t.titulo}</span>
                          <span className="block text-xs text-muted-foreground">{t.detalle}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Campo>

                <Campo etiqueta="Título" htmlFor="titulo" requerido error={err("titulo")} extra={`${form.titulo.length}/80`}>
                  <input
                    id="titulo"
                    value={form.titulo}
                    maxLength={80}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    aria-invalid={Boolean(err("titulo"))}
                    placeholder={esAlerta ? "Ej: BCP con demoras hoy" : "Ej: 20% menos de comisión en BCP"}
                    className="campo"
                  />
                </Campo>

                <Campo etiqueta="Mensaje" htmlFor="mensaje" requerido error={err("mensaje")} extra={`${form.mensaje.length}/500`}>
                  <textarea
                    id="mensaje"
                    value={form.mensaje}
                    maxLength={500}
                    rows={esAlerta ? 3 : 5}
                    onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
                    aria-invalid={Boolean(err("mensaje"))}
                    placeholder={
                      esAlerta
                        ? "Qué está pasando y qué debe hacer el cliente mientras tanto."
                        : "Explica la promoción en pocas líneas. El cliente la lee en el teléfono."
                    }
                    className="campo"
                  />
                </Campo>
              </div>
            </Panel>

            {/* Imágenes: solo las noticias */}
            {!esAlerta && (
              <Panel
                titulo="Imágenes"
                ayuda="JPG, PNG o WebP. Se reducen a 1400 px al subirlas para que la app no gaste datos de más. La primera es la portada."
                acciones={
                  <span className="cifras text-chico font-semibold text-muted-foreground">
                    {form.imagenes.length}/{MAX_IMAGENES}
                  </span>
                }
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {form.imagenes.map((path, i) => (
                    <div key={path} className="group relative overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urlPublica(BUCKET, path)} alt="" className="aspect-[4/3] w-full object-cover" />
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-marca-700 px-1.5 py-0.5 text-xs font-bold text-white">Portada</span>
                      )}
                      <button
                        type="button"
                        onClick={() => quitarImagen(path)}
                        aria-label="Quitar imagen"
                        className="absolute right-1.5 top-1.5 rounded-full bg-marca-950/70 p-1 text-white opacity-0 transition focus:opacity-100 group-hover:opacity-100"
                      >
                        <Cruz className="h-3.5 w-3.5" />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-marca-950/60 py-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => moverImagen(i, -1)}
                          disabled={i === 0}
                          aria-label="Mover antes"
                          className="px-2 text-sm font-bold text-white disabled:opacity-30"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => moverImagen(i, 1)}
                          disabled={i === form.imagenes.length - 1}
                          aria-label="Mover después"
                          className="px-2 text-sm font-bold text-white disabled:opacity-30"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  ))}

                  {form.imagenes.length < MAX_IMAGENES && (
                    <button
                      type="button"
                      onClick={() => archivoRef.current?.click()}
                      disabled={subiendo}
                      className="pulsable flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-marca-200 text-muted-foreground hover:border-marca-400 hover:text-marca-700 disabled:opacity-50"
                    >
                      {subiendo ? (
                        <Rueda />
                      ) : (
                        <>
                          <Mas className="h-5 w-5" />
                          <span className="text-chico font-semibold">Agregar</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <input ref={archivoRef} type="file" accept={TIPOS_ACEPTADOS.join(",")} multiple onChange={agregarImagenes} className="hidden" />
              </Panel>
            )}

            <Panel titulo="Cuánto tiempo está en la app">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {DURACIONES[form.categoria].map((d) => {
                    const valor = d.horas === null ? "" : sumarHoras(form.fecha_inicio, d.horas);
                    const elegida = form.fecha_fin === valor;
                    return (
                      <button
                        key={d.texto}
                        type="button"
                        onClick={() => setForm({ ...form, fecha_fin: valor })}
                        className={cn(
                          "pulsable rounded-full px-3 py-1.5 text-chico font-bold ring-1 ring-inset",
                          elegida ? "bg-marca-700 text-white ring-marca-700" : "bg-card text-muted-foreground ring-border hover:text-foreground",
                        )}
                      >
                        {d.texto}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Empieza" htmlFor="inicio">
                    <input
                      id="inicio"
                      type="datetime-local"
                      value={form.fecha_inicio}
                      onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                      className="campo cifras"
                    />
                  </Campo>
                  <Campo etiqueta="Termina" htmlFor="fin" opcional error={err("fecha_fin")}>
                    <input
                      id="fin"
                      type="datetime-local"
                      value={form.fecha_fin}
                      onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                      aria-invalid={Boolean(err("fecha_fin"))}
                      className="campo cifras"
                    />
                  </Campo>
                </div>

                <p className="text-chico text-muted-foreground">
                  {form.fecha_fin
                    ? `Desaparece sola de la app el ${fechaHora(form.fecha_fin)}. No hay que acordarse de apagarla.`
                    : "Sin fecha de fin: se queda hasta que la apagues a mano."}
                </p>
              </div>
            </Panel>

            {/* Notificación al teléfono */}
            {editando === "nueva" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-panel hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={form.notificar}
                  onChange={(e) => setForm({ ...form, notificar: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-marca-700"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Campana className="h-4 w-4" />
                    Avisar al teléfono
                  </span>
                  <span className="mt-0.5 block text-chico leading-relaxed text-muted-foreground">
                    {esAlerta
                      ? "Llega aunque el cliente tenga la app cerrada. Es lo que la hace servir cuando pasa algo en el momento."
                      : form.tipo === "promocion"
                        ? "Solo llega a quienes aceptaron recibir promociones. Úsalo con medida: si suena por cada descuento, el cliente apaga las notificaciones."
                        : "Para una noticia normalmente no hace falta: si suena seguido, el cliente apaga las notificaciones y tampoco le llegan las alertas."}
                  </span>
                </span>
              </label>
            )}
          </div>

          {/* Vista previa */}
          <div className="lg:sticky lg:top-[76px] lg:self-start">
            <p className="mb-3 text-center t-etiqueta">Así lo verá el cliente</p>
            <VistaPrevia form={form} urls={urlsForm} />
          </div>
        </div>
        <Tostada mensaje={ok} onCerrar={() => setOk("")} tono="info" />
      </Shell>
    );
  }

  // ── Lista ──
  return (
    <Shell
      session={session}
      titulo="Noticias y alertas"
      descripcion={`${alAire} ${nombreSec}${alAire === 1 ? "" : "s"} visible${alAire === 1 ? "" : "s"} en la app ahora`}
      ayuda="Una noticia se navega: promociones, feriados, novedades. Una alerta interrumpe: sale como burbuja al abrir la app, para lo que pasa hoy (una caída de banco, una demora)."
      acciones={
        <BotonAccion onClick={abrirNueva} icono={<Mas className="h-4 w-4" />}>
          <span className="hidden sm:inline">{seccion === "alerta" ? "Nueva alerta" : "Nueva noticia"}</span>
        </BotonAccion>
      }
    >
      {error && (
        <Aviso className="mb-4" titulo="Revisa esto" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={seccion}
          onCambio={(v) => {
            setSeccion(v);
            setFiltroVig("todas");
          }}
          opciones={SECCIONES.map((x) => ({
            clave: x.clave,
            etiqueta: x.titulo,
            pista: x.detalle,
            cuenta: filas.filter((f) => (f.categoria || "noticia") === x.clave).length,
          }))}
        />
        <Segmentos
          valor={filtroVig}
          onCambio={setFiltroVig}
          tamano="chico"
          opciones={[
            { clave: "todas", etiqueta: "Todas" },
            { clave: "aire", etiqueta: "En la app", cuenta: alAire },
            { clave: "programadas", etiqueta: "Programadas", cuenta: cuentaVig("Programada") },
            { clave: "fuera", etiqueta: "Apagadas o vencidas", cuenta: cuentaVig("Apagada") + cuentaVig("Vencida") },
          ]}
        />
      </Barra>

      {loading ? (
        <EsqueletoFilas filas={4} />
      ) : lista.length === 0 ? (
        <Vacio
          icono={<Megafono />}
          titulo={
            deSeccion.length > 0
              ? "Nada con este filtro"
              : seccion === "alerta"
                ? "Ninguna alerta enviada"
                : "Todavía no hay noticias"
          }
          detalle={
            deSeccion.length > 0
              ? "Prueba con «Todas»."
              : seccion === "alerta"
                ? "Las alertas son para cosas que pasan hoy: una caída de banco, una demora en los pagos."
                : "Publica una promoción o un aviso y aparecerá en la app de todos los clientes."
          }
          accion={
            deSeccion.length === 0 && (
              <BotonAccion onClick={abrirNueva} icono={<Mas className="h-4 w-4" />}>
                {seccion === "alerta" ? "Nueva alerta" : "Nueva noticia"}
              </BotonAccion>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-3 2xl:grid-cols-2">
            {lista.map((n) => {
              const t = tipoDe(n.tipo);
              const v = vigenciaDe(n);
              const portada = n.imagenes?.[0] ? urlPublica(BUCKET, n.imagenes[0]) : null;
              const leida = alcance[n.id];

              return (
                <div key={n.id} className={cn("flex gap-3.5 rounded-xl border border-border bg-card p-3.5 shadow-panel", !n.activa && "opacity-70")}>
                  {seccion === "noticia" &&
                    (portada ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portada} alt="" className="h-[84px] w-[112px] shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className={cn("flex h-[84px] w-[112px] shrink-0 items-center justify-center rounded-lg text-xs font-bold", t.chip)}>
                        {t.titulo}
                      </div>
                    ))}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset", t.chip)}>{t.titulo}</span>
                      <Estado etiqueta={v.texto === "En el app" ? "En la app" : v.texto} tono={v.tono} />
                      {n.push_enviado_en && (
                        <Pista texto={`Aviso al teléfono enviado el ${fechaHora(n.push_enviado_en)}`}>
                          <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            <Campana className="h-3 w-3" />
                            {n.push_alcance ?? 0}
                          </span>
                        </Pista>
                      )}
                    </div>

                    <p className="mt-1.5 truncate text-md font-bold text-foreground">{n.titulo}</p>
                    <p className="line-clamp-1 text-sm text-muted-foreground">{n.mensaje}</p>
                    <p className="mt-1 text-chico text-muted-foreground">
                      {seccion === "alerta" ? fechaHora(n.fecha_inicio) : fechaCorta(n.fecha_inicio)}
                      {n.fecha_fin ? ` → ${seccion === "alerta" ? fechaHora(n.fecha_fin) : fechaCorta(n.fecha_fin)}` : " → sin vencimiento"}
                      {seccion === "alerta" &&
                        (leida ? ` · abierta por ${leida.vistas} de ${leida.clientes} clientes` : " · nadie la abrió todavía")}
                      {n.imagenes?.length > 1 && ` · ${n.imagenes.length} fotos`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-0.5">
                      <BotonIcono texto="Editar" onClick={() => abrirEdicion(n)}>
                        <Lapiz className="h-4 w-4" />
                      </BotonIcono>
                      <BotonIcono texto="Eliminar" peligro onClick={() => eliminar(n)}>
                        <Basura className="h-4 w-4" />
                      </BotonIcono>
                    </div>
                    <Pista texto={n.activa ? "Deja de verse en la app sin borrarla" : "Vuelve a verse en la app"} fin>
                      <button
                        role="switch"
                        aria-checked={n.activa}
                        aria-label={n.activa ? "Apagar" : "Encender"}
                        onClick={() => alternar(n)}
                        className={cn("relative h-6 w-11 rounded-full transition", n.activa ? "bg-emerald-600" : "bg-marca-200")}
                      >
                        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", n.activa ? "left-[22px]" : "left-0.5")} />
                      </button>
                    </Pista>
                    {v.texto === "En el app" && (
                      <BotonAccion
                        tono="neutro"
                        tamano="chico"
                        onClick={() => notificar(n.id)}
                        cargando={notificando === n.id}
                        icono={<Campana className="h-3.5 w-3.5" />}
                      >
                        {n.push_enviado_en ? "Reenviar" : "Avisar"}
                      </BotonAccion>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Leyenda
            className="mt-4"
            items={[
              { texto: "En la app", color: "bg-emerald-500", pista: "Los clientes la ven ahora mismo." },
              { texto: "Programada", color: "bg-marca-500", pista: "Empieza a verse en la fecha de inicio." },
              { texto: "Apagada o vencida", color: "bg-marca-200", pista: "No se ve en la app. Enciéndela o cambia la fecha de fin para volver a mostrarla." },
              {
                texto: "Teléfonos avisados",
                marca: <Campana className="h-3.5 w-3.5 text-emerald-700" />,
                pista: "A cuántos teléfonos llegó el aviso. Las promociones solo llegan a quien aceptó recibirlas.",
              },
            ]}
          />
        </>
      )}

      {ventanaConfirmar}
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

function BotonIcono({ texto, onClick, children, peligro }) {
  return (
    <Pista texto={texto}>
      <button
        type="button"
        onClick={onClick}
        aria-label={texto}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition",
          peligro ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-muted hover:text-foreground",
        )}
      >
        {children}
      </button>
    </Pista>
  );
}
