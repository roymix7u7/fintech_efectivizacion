"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import {
  subirImagenes,
  borrarImagenes,
  urlPublica,
  TIPOS_ACEPTADOS,
} from "@/lib/imagenes";
import { cn } from "@/lib/utils";
import Shell, { Megafono, Cruz } from "@/components/shell";
import { Vacio, Aviso, Estado } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, Rueda } from "@/components/carga";

const BUCKET = "noticias-fotos";
const MAX_IMAGENES = 4;

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

/** Marco de telefono, compartido por las dos previas. */
function Telefono({ etiqueta, children }) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[26px] border-[7px] border-slate-800 bg-slate-800 shadow-panel">
      <div className="rounded-[19px] bg-[#F0F2F5] p-3">
        <p className="px-1 pb-2 pt-1 text-[11px] font-semibold text-slate-500">
          {etiqueta}
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * Como se vera. Con contenido que lleva imagen, describir el resultado
 * con palabras no alcanza: hace falta verlo antes de publicarlo a
 * treinta mil personas.
 */
function VistaPrevia({ form, urls }) {
  const t = tipoDe(form.tipo);

  if (form.categoria === "alerta") {
    return (
      <Telefono etiqueta="Al abrir el app">
        <div
          className="flex gap-2.5 rounded-xl border-l-[3px] bg-white p-2.5 shadow-lg shadow-slate-300/60"
          style={{
            borderLeftColor: t.punto.includes("red")
              ? "#D93025"
              : t.punto.includes("amber")
                ? "#E8A500"
                : "#1A73E8",
          }}
        >
          <span className={cn("h-7 w-7 shrink-0 rounded-full", t.chip)} />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[8px] font-bold uppercase tracking-wide",
                t.chip.split(" ")[1],
              )}
            >
              {t.titulo}
            </p>
            <p className="truncate text-[11px] font-bold text-slate-800">
              {form.titulo || "Título de la alerta"}
            </p>
            <p className="line-clamp-2 text-[9px] leading-[1.5] text-slate-500">
              {form.mensaje || "Qué está pasando y qué debe hacer el cliente."}
            </p>
            <p className="mt-1 text-[8px] text-slate-400">
              Toca para ver el detalle
            </p>
          </div>
          <span className="text-[10px] text-slate-400">✕</span>
        </div>

        <p className="px-1 pt-3 text-[9px] leading-relaxed text-slate-500">
          {t.valor === "critico"
            ? "Urgente: la burbuja espera a que la toquen, no se cierra sola."
            : "Se cierra sola a los 7 segundos, pero sigue marcada como nueva en la pestaña Alertas."}
        </p>
      </Telefono>
    );
  }

  const dias = form.fecha_fin
    ? Math.ceil((new Date(form.fecha_fin).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <Telefono etiqueta="Noticias">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {urls.length > 0 ? (
          <div className="relative">
            <img
              src={urls[0]}
              alt=""
              className="h-[110px] w-full object-cover"
            />
            <span
              className={cn(
                "absolute left-2 top-2 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold",
                t.chip.split(" ")[1],
              )}
            >
              {t.titulo}
            </span>
            {urls.length > 1 && (
              <span className="absolute right-2 top-2 rounded-lg bg-slate-900/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                1/{urls.length}
              </span>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "flex h-14 items-center justify-center text-[9px] font-bold",
              t.chip,
            )}
          >
            {t.titulo}
          </div>
        )}

        <div className="space-y-1 p-3">
          <p className="text-[12px] font-bold leading-tight text-slate-800">
            {form.titulo || "Título de la noticia"}
          </p>
          <p className="line-clamp-4 text-[10px] leading-[1.5] text-slate-500">
            {form.mensaje || "Aquí va el texto que leerá el cliente."}
          </p>
          <div className="flex items-center gap-1 border-t border-slate-100 pt-2 text-[9px] text-slate-400">
            <span>
              {new Date(form.fecha_inicio || Date.now()).toLocaleDateString(
                "es-PE",
                { day: "numeric", month: "short" },
              )}
            </span>
            {dias !== null && (
              <span
                className={cn(
                  "ml-auto rounded-full px-1.5 py-0.5 font-semibold",
                  dias <= 3
                    ? "bg-red-50 text-red-600"
                    : "bg-slate-100 text-slate-500",
                )}
              >
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

  const sec = SECCIONES.find((x) => x.clave === seccion);
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
    if (!form.titulo.trim()) return "Ponle un título.";
    if (!form.mensaje.trim()) return "Escribe el mensaje para el cliente.";
    if (
      form.fecha_fin &&
      form.fecha_inicio &&
      new Date(form.fecha_fin) <= new Date(form.fecha_inicio)
    )
      return "La fecha de fin tiene que ser posterior a la de inicio.";
    return null;
  }

  async function guardar() {
    const fallo = validar();
    if (fallo) return setError(fallo);

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
    if (
      !window.confirm(
        `Se borrará "${n.titulo}" y sus imágenes. Esto no se puede deshacer.`,
      )
    )
      return;

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

  if (!session) return null;

  const alAire = visibles.filter(
    (n) => vigenciaDe(n).texto === "En el app",
  ).length;

  return (
    <Shell
      session={session}
      titulo="Noticias y alertas"
      descripcion={`${alAire} ${seccion === "alerta" ? "alerta" : "noticia"}${alAire === 1 ? "" : "s"} al aire ahora mismo`}
      acciones={
        !editando && (
          <BotonAccion onClick={abrirNueva} icono={<span>+</span>}>
            {seccion === "alerta" ? "Nueva alerta" : "Nueva noticia"}
          </BotonAccion>
        )
      }
    >
      <div className="space-y-4">
        {/* Secciones */}
        <div>
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/60 p-1">
            {SECCIONES.map((x) => (
              <button
                key={x.clave}
                onClick={() => {
                  setSeccion(x.clave);
                  setEditando(null);
                }}
                className={cn(
                  "pulsable rounded-md px-4 py-1.5 text-[0.8667rem] font-medium",
                  seccion === x.clave
                    ? "bg-card text-foreground shadow-panel"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {x.titulo}
              </button>
            ))}
          </div>
          <p className="mt-2 max-w-2xl text-[0.8rem] text-muted-foreground">
            {sec.detalle}
          </p>
        </div>

        {error && (
          <Aviso titulo="Revisa esto" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        )}
        {ok && (
          <Aviso tono="info" onCerrar={() => setOk("")}>
            {ok}
          </Aviso>
        )}

        {editando && (
          <div className="grid gap-5 rounded-xl border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {editando === "nueva"
                    ? esAlerta
                      ? "Nueva alerta"
                      : "Nueva noticia"
                    : "Editar"}
                </h2>
                <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                  {esAlerta
                    ? "La verán como burbuja al abrir el app, y quedará en su pestaña de alertas."
                    : "Se publica para todos los clientes del app."}
                </p>
              </div>

              {/* Tipo */}
              <div className="space-y-2">
                <p className="text-[0.8rem] font-medium text-foreground">
                  Tono
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {TIPOS_DE[form.categoria].map((t) => (
                    <button
                      key={t.valor}
                      onClick={() => setForm({ ...form, tipo: t.valor })}
                      className={cn(
                        "pulsable flex items-center gap-2.5 rounded-lg border p-2.5 text-left",
                        form.tipo === t.valor
                          ? "border-marca-400 bg-marca-50"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          t.punto,
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-[0.8667rem] font-semibold text-foreground">
                          {t.titulo}
                        </span>
                        <span className="block text-[0.75rem] text-muted-foreground">
                          {t.detalle}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Texto */}
              <div className="space-y-2">
                <label
                  htmlFor="titulo"
                  className="text-[0.8rem] font-medium text-foreground"
                >
                  Título
                </label>
                <input
                  id="titulo"
                  value={form.titulo}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder={
                    esAlerta
                      ? "Ej: BCP con demoras hoy"
                      : "Ej: 20% menos de comisión en BCP"
                  }
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-marca-400"
                />
                <p className="text-right text-[0.7333rem] text-muted-foreground">
                  {form.titulo.length}/80
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="mensaje"
                  className="text-[0.8rem] font-medium text-foreground"
                >
                  Mensaje
                </label>
                <textarea
                  id="mensaje"
                  value={form.mensaje}
                  maxLength={500}
                  rows={esAlerta ? 3 : 4}
                  onChange={(e) =>
                    setForm({ ...form, mensaje: e.target.value })
                  }
                  placeholder={
                    esAlerta
                      ? "Qué está pasando y qué debe hacer el cliente mientras tanto."
                      : "Explica la promoción en pocas líneas. El cliente la lee en el teléfono."
                  }
                  className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-marca-400"
                />
                <p className="text-right text-[0.7333rem] text-muted-foreground">
                  {form.mensaje.length}/500
                </p>
              </div>

              {/* Imagenes: solo las noticias */}
              {!esAlerta && (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[0.8rem] font-medium text-foreground">
                      Imágenes
                    </p>
                    <p className="text-[0.75rem] text-muted-foreground">
                      {form.imagenes.length}/{MAX_IMAGENES} · la primera es la
                      portada
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {form.imagenes.map((path, i) => (
                      <div
                        key={path}
                        className="group relative overflow-hidden rounded-lg border border-border"
                      >
                        <img
                          src={urlPublica(BUCKET, path)}
                          alt=""
                          className="aspect-[4/3] w-full object-cover"
                        />
                        {i === 0 && (
                          <span className="absolute left-1 top-1 rounded bg-marca-700 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            PORTADA
                          </span>
                        )}
                        <button
                          onClick={() => quitarImagen(path)}
                          aria-label="Quitar imagen"
                          className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
                        >
                          <Cruz className="h-3 w-3" />
                        </button>
                        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-slate-900/60 py-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={() => moverImagen(i, -1)}
                            disabled={i === 0}
                            aria-label="Mover antes"
                            className="px-1.5 text-xs text-white disabled:opacity-30"
                          >
                            ←
                          </button>
                          <button
                            onClick={() => moverImagen(i, 1)}
                            disabled={i === form.imagenes.length - 1}
                            aria-label="Mover después"
                            className="px-1.5 text-xs text-white disabled:opacity-30"
                          >
                            →
                          </button>
                        </div>
                      </div>
                    ))}

                    {form.imagenes.length < MAX_IMAGENES && (
                      <button
                        onClick={() => archivoRef.current?.click()}
                        disabled={subiendo}
                        className="pulsable flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:border-marca-400 hover:text-marca-700 disabled:opacity-50"
                      >
                        {subiendo ? (
                          <Rueda />
                        ) : (
                          <>
                            <span className="text-lg leading-none">+</span>
                            <span className="text-[0.75rem]">Agregar</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <input
                    ref={archivoRef}
                    type="file"
                    accept={TIPOS_ACEPTADOS.join(",")}
                    multiple
                    onChange={agregarImagenes}
                    className="hidden"
                  />
                  <p className="text-[0.75rem] text-muted-foreground">
                    JPG, PNG o WebP. Se reducen a 1400 px al subirlas para que
                    el app no gaste datos de más.
                  </p>
                </div>
              )}

              {/* Vigencia */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3.5">
                <p className="text-[0.8rem] font-medium text-foreground">
                  Cuánto tiempo está en el app
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {DURACIONES[form.categoria].map((d) => {
                    const valor =
                      d.horas === null
                        ? ""
                        : sumarHoras(form.fecha_inicio, d.horas);
                    const elegida = form.fecha_fin === valor;
                    return (
                      <button
                        key={d.texto}
                        onClick={() => setForm({ ...form, fecha_fin: valor })}
                        className={cn(
                          "pulsable rounded-full px-3 py-1.5 text-[0.8rem] font-medium ring-1 ring-inset",
                          elegida
                            ? "bg-marca-700 text-white ring-marca-700"
                            : "bg-card text-muted-foreground ring-border hover:text-foreground",
                        )}
                      >
                        {d.texto}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="inicio"
                      className="text-[0.75rem] font-medium text-muted-foreground"
                    >
                      Empieza
                    </label>
                    <input
                      id="inicio"
                      type="datetime-local"
                      value={form.fecha_inicio}
                      onChange={(e) =>
                        setForm({ ...form, fecha_inicio: e.target.value })
                      }
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-marca-400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="fin"
                      className="text-[0.75rem] font-medium text-muted-foreground"
                    >
                      Termina
                    </label>
                    <input
                      id="fin"
                      type="datetime-local"
                      value={form.fecha_fin}
                      onChange={(e) =>
                        setForm({ ...form, fecha_fin: e.target.value })
                      }
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-marca-400"
                    />
                  </div>
                </div>

                <p className="text-[0.75rem] text-muted-foreground">
                  {form.fecha_fin
                    ? `Desaparece sola del app el ${fechaHora(form.fecha_fin)}. No hay que acordarse de apagarla.`
                    : "Sin fecha de fin: se queda hasta que la apagues a mano."}
                </p>
              </div>

              {/* Notificacion al telefono */}
              {editando === "nueva" && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3.5 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={form.notificar}
                    onChange={(e) =>
                      setForm({ ...form, notificar: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 accent-marca-700"
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.8667rem] font-semibold text-foreground">
                      Avisar al teléfono
                    </span>
                    <span className="block text-[0.75rem] leading-relaxed text-muted-foreground">
                      {esAlerta
                        ? "Llega aunque el cliente tenga el app cerrada. Es lo que la hace servir cuando pasa algo en el momento."
                        : "Para una promoción normalmente no hace falta: si suena por cada descuento, el cliente termina apagando las notificaciones y tampoco le llegan las alertas."}
                    </span>
                  </span>
                </label>
              )}

              <div className="flex gap-2">
                <BotonAccion
                  onClick={guardar}
                  cargando={guardando}
                  disabled={subiendo}
                >
                  {editando === "nueva"
                    ? esAlerta
                      ? "Enviar alerta"
                      : "Publicar"
                    : "Guardar cambios"}
                </BotonAccion>
                <BotonAccion tono="neutro" onClick={cerrar}>
                  Cancelar
                </BotonAccion>
              </div>
            </div>

            {/* Vista previa */}
            <div className="lg:border-l lg:border-border lg:pl-5">
              <p className="mb-3 text-[0.75rem] font-medium uppercase tracking-wide text-muted-foreground">
                Así lo verá el cliente
              </p>
              <VistaPrevia form={form} urls={urlsForm} />
            </div>
          </div>
        )}

        {/* Listado */}
        {loading ? (
          <EsqueletoFilas filas={4} />
        ) : visibles.length === 0 ? (
          <Vacio
            icono={<Megafono className="h-5 w-5" />}
            titulo={
              seccion === "alerta"
                ? "Ninguna alerta enviada"
                : "Todavía no hay noticias"
            }
            detalle={
              seccion === "alerta"
                ? "Las alertas son para cosas que pasan hoy: una caída de banco, una demora en los pagos."
                : "Publica una promoción o un aviso y aparecerá en el app de todos los clientes."
            }
            accion={
              <BotonAccion onClick={abrirNueva}>
                {seccion === "alerta" ? "Nueva alerta" : "Nueva noticia"}
              </BotonAccion>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visibles.map((n) => {
              const t = tipoDe(n.tipo);
              const v = vigenciaDe(n);
              const portada = n.imagenes?.[0]
                ? urlPublica(BUCKET, n.imagenes[0])
                : null;
              const leida = alcance[n.id];

              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3.5 rounded-xl border border-border bg-card p-3.5",
                    !n.activa && "opacity-60",
                  )}
                >
                  {seccion === "noticia" &&
                    (portada ? (
                      <img
                        src={portada}
                        alt=""
                        className="h-[72px] w-[96px] shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className={cn(
                          "flex h-[72px] w-[96px] shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                          t.chip,
                        )}
                      >
                        {t.titulo}
                      </div>
                    ))}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset",
                          t.chip,
                        )}
                      >
                        {t.titulo}
                      </span>
                      <Estado etiqueta={v.texto} tono={v.tono} />
                      {n.imagenes?.length > 1 && (
                        <span className="text-[0.7333rem] text-muted-foreground">
                          {n.imagenes.length} fotos
                        </span>
                      )}
                      {seccion === "alerta" && (
                        <span className="text-[0.7333rem] text-muted-foreground">
                          {leida
                            ? `Abierta por ${leida.vistas} de ${leida.clientes} clientes`
                            : "Nadie la ha abierto todavía"}
                        </span>
                      )}
                      {n.push_enviado_en && (
                        <span className="text-[0.7333rem] text-emerald-700">
                          Notificada a {n.push_alcance ?? 0} teléfonos
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 truncate text-[0.9333rem] font-semibold text-foreground">
                      {n.titulo}
                    </p>
                    <p className="line-clamp-1 text-[0.8rem] text-muted-foreground">
                      {n.mensaje}
                    </p>
                    <p className="mt-1 text-[0.7333rem] text-muted-foreground">
                      {seccion === "alerta"
                        ? fechaHora(n.fecha_inicio)
                        : fechaCorta(n.fecha_inicio)}
                      {n.fecha_fin
                        ? ` → ${seccion === "alerta" ? fechaHora(n.fecha_fin) : fechaCorta(n.fecha_fin)}`
                        : " → sin vencimiento"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      onClick={() => abrirEdicion(n)}
                      className="pulsable rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-medium text-foreground hover:bg-muted"
                    >
                      Editar
                    </button>
                    {vigenciaDe(n).texto === "En el app" && (
                      <button
                        onClick={() => notificar(n.id)}
                        disabled={notificando === n.id}
                        className="pulsable rounded-lg border border-marca-300 px-3 py-1.5 text-[0.8rem] font-medium text-marca-700 hover:bg-marca-50 disabled:opacity-50"
                      >
                        {notificando === n.id
                          ? "Enviando…"
                          : n.push_enviado_en
                            ? "Reenviar aviso"
                            : "Avisar al teléfono"}
                      </button>
                    )}
                    <button
                      onClick={() => alternar(n)}
                      className={cn(
                        "pulsable rounded-lg border px-3 py-1.5 text-[0.8rem] font-medium",
                        n.activa
                          ? "border-border text-muted-foreground hover:bg-muted"
                          : "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
                      )}
                    >
                      {n.activa ? "Apagar" : "Encender"}
                    </button>
                    <button
                      onClick={() => eliminar(n)}
                      className="pulsable rounded-lg px-3 py-1.5 text-[0.8rem] font-medium text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
