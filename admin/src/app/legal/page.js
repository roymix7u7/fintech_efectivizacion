"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import { cn } from "@/lib/utils";
import Shell, { Balanza, Ojo, Mas } from "@/components/shell";
import { Aviso } from "@/components/marca";
import { BotonAccion, Esqueleto, CargaPantalla } from "@/components/carga";
import { Campo, Panel, Dialogo, Tostada, useConfirmar } from "@/components/piezas";
import Pista from "@/components/pista";

/**
 * Términos, privacidad y la autorización para fotos de identidad.
 *
 * Una versión publicada no se edita: es el texto exacto que los
 * clientes aceptaron (migración 51). Para cambiar algo se publica una
 * versión nueva, y la app se la pide aceptar a todos antes de seguir.
 */
const TIPOS = [
  { tipo: "terminos", nombre: "Términos y condiciones", publica: "/terminos" },
  { tipo: "privacidad", nombre: "Política de privacidad", publica: "/privacidad" },
  { tipo: "biometria", nombre: "Autorización para fotos de identidad", publica: "/autorizacion-fotos" },
];

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "");

const partes = (v) => String(v || "0").split(".").map((n) => parseInt(n, 10) || 0);

/** "0.9" → "1.0", "1.4" → "1.5". */
function siguienteVersion(v) {
  const [a, b] = partes(v);
  const menor = b + 1;
  return menor >= 10 ? `${a + 1}.0` : `${a}.${menor}`;
}

/** true si a es mayor que b ("1.10" > "1.9"). */
function mayor(a, b) {
  const [a1, a2] = partes(a);
  const [b1, b2] = partes(b);
  return a1 > b1 || (a1 === b1 && a2 > b2);
}

/** Mismo formato que dibuja la app: "## " títulos, "- " viñetas. */
function Previa({ contenido }) {
  const bloques = [];
  let parrafo = [];
  const cerrar = () => {
    if (parrafo.length) bloques.push({ t: "p", x: parrafo.join(" ") });
    parrafo = [];
  };
  for (const l of String(contenido || "").split("\n").map((x) => x.trim())) {
    if (!l) cerrar();
    else if (l.startsWith("## ")) (cerrar(), bloques.push({ t: "h", x: l.slice(3) }));
    else if (l.startsWith("- ")) (cerrar(), bloques.push({ t: "li", x: l.slice(2) }));
    else parrafo.push(l);
  }
  cerrar();
  if (!bloques.length) return <p className="text-sm text-muted-foreground">El texto aparecerá aquí mientras escribes.</p>;
  return (
    <div className="max-w-[65ch] space-y-2.5 text-md leading-relaxed text-foreground">
      {bloques.map((b, i) =>
        b.t === "h" ? (
          <p key={i} className="pt-2 font-heading font-semibold">
            {b.x}
          </p>
        ) : b.t === "li" ? (
          <p key={i} className="flex gap-2 pl-1 text-[#4F5B74]">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-oro-500" />
            <span>{b.x}</span>
          </p>
        ) : (
          <p key={i} className="text-[#4F5B74]">
            {b.x}
          </p>
        ),
      )}
    </div>
  );
}

export default function LegalPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [documentos, setDocumentos] = useState([]);
  const [aceptaciones, setAceptaciones] = useState({});
  const [clientes, setClientes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [viendo, setViendo] = useState(null);
  const [form, setForm] = useState(null);
  const [tocado, setTocado] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [confirmar, ventanaConfirmar] = useConfirmar();
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargar();
    });
  }, [router]);

  async function cargar() {
    setLoading(true);
    const { data, error: e } = await supabase
      .from("documentos_legales")
      .select("id, tipo, version, titulo, resumen, contenido, borrador, publicado_en")
      .order("publicado_en", { ascending: false });
    if (e) {
      setError(explicarError(e));
      setLoading(false);
      return;
    }
    setDocumentos(data || []);

    // Cuántos aceptaron la versión vigente de cada uno.
    const vigentes = TIPOS.map((t) => (data || []).find((d) => d.tipo === t.tipo)).filter(Boolean);
    const conteos = await Promise.all(
      vigentes.map((d) =>
        supabase
          .from("consentimientos")
          .select("id", { count: "exact", head: true })
          .eq("documento_id", d.id)
          .then(({ count }) => [d.id, count || 0]),
      ),
    );
    setAceptaciones(Object.fromEntries(conteos));
    const { count } = await supabase.from("users").select("id", { count: "exact", head: true }).eq("rol", "cliente");
    setClientes(count || 0);
    setLoading(false);
  }

  function nuevaVersion(actual, tipo) {
    setError("");
    setTocado(false);
    setForm({
      tipo,
      version: siguienteVersion(actual?.version),
      titulo: actual?.titulo || TIPOS.find((t) => t.tipo === tipo).nombre,
      resumen: actual?.resumen || "",
      contenido: actual?.contenido || "",
      borrador: Boolean(actual?.borrador),
    });
  }

  const actualDelForm = form ? documentos.find((d) => d.tipo === form.tipo) : null;
  const errores = (() => {
    if (!form) return {};
    const e = {};
    const v = form.version.trim();
    if (!/^\d+\.\d+$/.test(v)) e.version = "Usa el formato número.número, como 1.1.";
    else if (documentos.some((d) => d.tipo === form.tipo && d.version === v)) e.version = `Ya existe la versión ${v}.`;
    else if (actualDelForm && !mayor(v, actualDelForm.version)) e.version = `Tiene que ser mayor que la vigente (${actualDelForm.version}).`;
    if (form.titulo.trim().length < 5) e.titulo = "Escribe el título del documento.";
    if (form.contenido.trim().length < 50) e.contenido = "El texto es demasiado corto.";
    else if (actualDelForm && actualDelForm.contenido.trim() === form.contenido.trim() && actualDelForm.titulo === form.titulo.trim())
      e.contenido = "No hay cambios en el texto respecto de la versión vigente.";
    return e;
  })();
  const err = (k) => (tocado ? errores[k] : null);

  async function publicar() {
    setTocado(true);
    if (Object.keys(errores).length) return;
    const version = form.version.trim();
    const si = await confirmar({
      titulo: `¿Publicar la versión ${version}?`,
      texto: form.borrador
        ? "Se publica como borrador: la app la muestra con la marca «Versión preliminar» y todos los clientes deberán aceptarla."
        : "Todos los clientes deberán aceptarla antes de seguir usando la app. Lo que aceptaron antes queda guardado tal cual.",
      boton: "Publicar",
      tono: "atencion",
    });
    if (!si) return;

    setPublicando(true);
    setError("");
    const { data, error: e } = await supabase
      .from("documentos_legales")
      .insert({
        tipo: form.tipo,
        version,
        titulo: form.titulo.trim(),
        resumen: form.resumen.trim() || null,
        contenido: form.contenido.trim(),
        borrador: form.borrador,
        publicado_por: session.user.id,
      })
      .select("id")
      .single();
    setPublicando(false);
    if (e) return setError(explicarError(e));

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "PUBLICAR_DOCUMENTO_LEGAL",
      entidad: "documentos_legales",
      entidad_id: data.id,
      datos_despues: { tipo: form.tipo, version, borrador: form.borrador },
    });
    setOk(`Versión ${version} publicada. La app la pedirá aceptar al abrirse.`);
    setForm(null);
    cargar();
  }

  if (!session) return <CargaPantalla />;

  // ── Publicar una versión ──
  if (form) {
    const nombre = TIPOS.find((t) => t.tipo === form.tipo).nombre;
    return (
      <Shell
        session={session}
        titulo={`Nueva versión · ${nombre}`}
        descripcion={actualDelForm ? `Vigente: versión ${actualDelForm.version}` : "Primera versión"}
        volver={{ onClick: () => setForm(null), texto: "Volver sin publicar" }}
        acciones={
          <BotonAccion onClick={publicar} cargando={publicando} disabled={tocado && Object.keys(errores).length > 0}>
            Publicar versión
          </BotonAccion>
        }
      >
        {error && (
          <Aviso className="mb-4" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        )}
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel titulo="Texto">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[130px_minmax(0,1fr)]">
                <Campo etiqueta="Versión" htmlFor="version" requerido error={err("version")}>
                  <input
                    id="version"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    aria-invalid={Boolean(err("version"))}
                    className="campo cifras"
                  />
                </Campo>
                <Campo etiqueta="Título" htmlFor="titulo" requerido error={err("titulo")}>
                  <input
                    id="titulo"
                    value={form.titulo}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    aria-invalid={Boolean(err("titulo"))}
                    className="campo"
                  />
                </Campo>
              </div>
              <Campo etiqueta="Resumen" htmlFor="resumen" opcional ayuda="Una línea que la app muestra bajo el título." extra={`${form.resumen.length}/300`}>
                <input
                  id="resumen"
                  value={form.resumen}
                  maxLength={300}
                  onChange={(e) => setForm({ ...form, resumen: e.target.value })}
                  className="campo"
                />
              </Campo>
              <Campo
                etiqueta="Contenido"
                htmlFor="contenido"
                requerido
                error={err("contenido")}
                ayuda="Empieza una línea con «## » para un título y con «- » para una viñeta. Deja una línea en blanco entre párrafos."
              >
                <textarea
                  id="contenido"
                  value={form.contenido}
                  onChange={(e) => setForm({ ...form, contenido: e.target.value })}
                  rows={24}
                  aria-invalid={Boolean(err("contenido"))}
                  className="campo font-mono text-sm"
                />
              </Campo>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={form.borrador}
                  onChange={(e) => setForm({ ...form, borrador: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-marca-700"
                />
                <span>
                  <span className="font-semibold">Todavía es un borrador</span>
                  <span className="block text-chico text-muted-foreground">La app muestra «Versión preliminar, en revisión legal».</span>
                </span>
              </label>
            </div>
          </Panel>
          <div className="xl:sticky xl:top-[76px] xl:self-start">
            <Panel titulo="Así se lee en la app" cuerpo="scroll-fino max-h-[calc(100dvh-170px)] overflow-y-auto p-5">
              <p className="mb-1 font-heading text-xl font-semibold">{form.titulo}</p>
              {form.resumen && <p className="mb-4 text-sm text-muted-foreground">{form.resumen}</p>}
              <Previa contenido={form.contenido} />
            </Panel>
          </div>
        </div>
        {ventanaConfirmar}
      </Shell>
    );
  }

  const docViendo = documentos.find((d) => d.id === viendo);

  // ── Lista ──
  return (
    <Shell
      session={session}
      titulo="Legal"
      descripcion="Términos, privacidad y autorización de fotos"
      ayuda="Cada versión publicada queda fija: es lo que los clientes aceptaron. Cada aceptación guarda la versión, la hora y el teléfono. Publicar una versión nueva hace que la app la pida aceptar antes de seguir."
    >
      {error && (
        <Aviso className="mb-4" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {TIPOS.map(({ tipo, nombre, publica }) => {
            const versiones = documentos.filter((d) => d.tipo === tipo);
            const vigente = versiones[0];
            const n = vigente ? aceptaciones[vigente.id] || 0 : 0;
            const pctAcept = clientes ? Math.min(100, Math.round((n / clientes) * 100)) : 0;
            return (
              <section key={tipo} className="flex flex-col rounded-xl border border-border bg-card shadow-panel">
                <div className="flex items-start gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
                    <Balanza className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="t-seccion">{nombre}</h2>
                    <p className="text-sm text-muted-foreground">
                      {vigente ? (
                        <>
                          Versión <span className="cifras font-bold text-foreground">{vigente.version}</span> · {fecha(vigente.publicado_en)}
                        </>
                      ) : (
                        "Sin publicar"
                      )}
                    </p>
                  </div>
                  {vigente?.borrador && <span className="rounded-full bg-oro-100 px-2 py-0.5 text-xs font-bold text-oro-700">Borrador</span>}
                </div>

                {vigente && (
                  <div className="px-4 pb-4">
                    <div className="mb-1.5 flex items-center justify-between text-chico">
                      <span className="flex items-center gap-1 font-semibold text-muted-foreground">
                        Aceptada por clientes
                        <Pista texto="Los que aún no la aceptaron la verán al abrir la app y no podrán seguir sin aceptarla." />
                      </span>
                      <span className="cifras font-bold text-foreground">
                        {n} de {clientes} · {pctAcept}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", n >= clientes ? "bg-emerald-600" : "bg-marca-500")}
                        style={{ width: `${pctAcept}%` }}
                      />
                    </div>
                  </div>
                )}

                {versiones.length > 1 && (
                  <details className="border-t border-border px-4 py-2.5 text-chico text-muted-foreground">
                    <summary className="cursor-pointer font-semibold">Versiones anteriores ({versiones.length - 1})</summary>
                    <ul className="mt-2 space-y-1">
                      {versiones.slice(1).map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2">
                          <span>
                            Versión <span className="cifras font-semibold">{v.version}</span> · {fecha(v.publicado_en)}
                            {v.borrador ? " · borrador" : ""}
                          </span>
                          <button onClick={() => setViendo(v.id)} className="font-bold text-marca-600 hover:underline">
                            Ver
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border p-3">
                  {vigente && (
                    <BotonAccion tono="neutro" tamano="chico" icono={<Ojo className="h-3.5 w-3.5" />} onClick={() => setViendo(vigente.id)}>
                      Leer
                    </BotonAccion>
                  )}
                  <Pista texto="La página pública que enlazan Google Play y el pie de la web.">
                    <a href={publica} target="_blank" rel="noopener" className="px-2 text-chico font-bold text-marca-600 hover:underline">
                      Página pública
                    </a>
                  </Pista>
                  <BotonAccion tamano="chico" className="ml-auto" icono={<Mas className="h-3.5 w-3.5" />} onClick={() => nuevaVersion(vigente, tipo)}>
                    Nueva versión
                  </BotonAccion>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialogo
        abierto={Boolean(docViendo)}
        onCerrar={() => setViendo(null)}
        titulo={docViendo?.titulo}
        descripcion={docViendo ? `Versión ${docViendo.version} · publicada el ${fecha(docViendo.publicado_en)}${docViendo.borrador ? " · borrador" : ""}` : ""}
        icono={<Balanza className="h-5 w-5" />}
        ancho="max-w-3xl"
        pie={<BotonAccion onClick={() => setViendo(null)}>Cerrar</BotonAccion>}
      >
        {docViendo?.resumen && <p className="mb-4 text-sm text-muted-foreground">{docViendo.resumen}</p>}
        <Previa contenido={docViendo?.contenido} />
      </Dialogo>

      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}
