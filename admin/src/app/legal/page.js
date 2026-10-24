"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import { cn } from "@/lib/utils";
import Shell from "@/components/shell";
import { Aviso } from "@/components/marca";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Términos, privacidad y la autorización para fotos de identidad.
 *
 * Una versión publicada no se edita: es el texto exacto que los
 * clientes aceptaron (migración 51). Para cambiar algo se publica una
 * versión nueva, y la app se la pide aceptar a todos antes de seguir.
 */
const TIPOS = [
  { tipo: "terminos", nombre: "Términos y condiciones" },
  { tipo: "privacidad", nombre: "Política de privacidad" },
  { tipo: "biometria", nombre: "Autorización para fotos de identidad" },
];

const fecha = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "";

/** "0.9" → "1.0", "1.4" → "1.5". */
function siguienteVersion(v) {
  const [a, b] = String(v || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const menor = b + 1;
  return menor >= 10 ? `${a + 1}.0` : `${a}.${menor}`;
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
  return (
    <div className="space-y-2.5 text-[0.85rem] leading-relaxed text-foreground">
      {bloques.map((b, i) =>
        b.t === "h" ? (
          <p key={i} className="pt-1 font-semibold">
            {b.x}
          </p>
        ) : b.t === "li" ? (
          <p key={i} className="flex gap-2 pl-1 text-muted-foreground">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-oro-500" />
            <span>{b.x}</span>
          </p>
        ) : (
          <p key={i} className="text-muted-foreground">
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
  const [viendo, setViendo] = useState(null);
  const [form, setForm] = useState(null);
  const [publicando, setPublicando] = useState(false);
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
    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("rol", "cliente");
    setClientes(count || 0);
    setLoading(false);
  }

  function nuevaVersion(actual, tipo) {
    setError("");
    setForm({
      tipo,
      version: siguienteVersion(actual?.version),
      titulo: actual?.titulo || TIPOS.find((t) => t.tipo === tipo).nombre,
      resumen: actual?.resumen || "",
      contenido: actual?.contenido || "",
      borrador: Boolean(actual?.borrador),
    });
  }

  async function publicar() {
    const version = form.version.trim();
    if (!version) return setError("Indica el número de versión.");
    if (documentos.some((d) => d.tipo === form.tipo && d.version === version)) {
      return setError(`Ya existe la versión ${version}. Usa otro número.`);
    }
    if (form.contenido.trim().length < 50) return setError("El texto es demasiado corto.");
    const actual = documentos.find((d) => d.tipo === form.tipo);
    if (actual && actual.contenido.trim() === form.contenido.trim() && actual.titulo === form.titulo.trim()) {
      return setError("No hay cambios en el texto respecto de la versión vigente.");
    }
    if (
      !window.confirm(
        `Se publicará la versión ${version}. Todos los clientes deberán aceptarla antes de seguir usando la app. ¿Continuar?`,
      )
    )
      return;

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
    setForm(null);
    cargar();
  }

  if (!session) return null;

  // ── Publicar una versión ──
  if (form) {
    const nombre = TIPOS.find((t) => t.tipo === form.tipo).nombre;
    return (
      <Shell
        session={session}
        titulo={`Nueva versión · ${nombre}`}
        descripcion="Al publicarla, la app pedirá aceptarla a todos los clientes"
        acciones={
          <div className="flex gap-2">
            <button
              onClick={() => setForm(null)}
              className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-muted"
            >
              Cancelar
            </button>
            <Button onClick={publicar} disabled={publicando}>
              {publicando ? "Publicando..." : "Publicar versión"}
            </Button>
          </div>
        }
      >
        {error && (
          <div className="mb-4">
            <Aviso onCerrar={() => setError("")}>{error}</Aviso>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Versión</Label>
                  <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Título</Label>
                  <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Resumen (una línea, opcional)</Label>
                <Input
                  value={form.resumen}
                  maxLength={300}
                  onChange={(e) => setForm({ ...form, resumen: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Texto</Label>
                <Textarea
                  value={form.contenido}
                  onChange={(e) => setForm({ ...form, contenido: e.target.value })}
                  rows={22}
                  className="font-mono text-[0.8rem]"
                />
                <p className="text-[0.72rem] text-muted-foreground">
                  Empieza una línea con <code>## </code> para un título y con <code>- </code> para una viñeta. Deja
                  una línea en blanco entre párrafos.
                </p>
              </div>
              <label className="flex items-center gap-2 text-[0.85rem]">
                <input
                  type="checkbox"
                  checked={form.borrador}
                  onChange={(e) => setForm({ ...form, borrador: e.target.checked })}
                />
                Todavía es un borrador (la app muestra &quot;Versión preliminar, en revisión legal&quot;)
              </label>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="mb-1 text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">
                Así se lee en la app
              </p>
              <p className="mb-4 text-lg font-semibold">{form.titulo}</p>
              <Previa contenido={form.contenido} />
            </CardContent>
          </Card>
        </div>
      </Shell>
    );
  }

  // ── Lista ──
  return (
    <Shell session={session} titulo="Legal" descripcion="Términos, privacidad y autorización de fotos">
      <div className="max-w-4xl space-y-4">
        {error && <Aviso onCerrar={() => setError("")}>{error}</Aviso>}

        <p className="text-[0.85rem] text-muted-foreground">
          Cada versión publicada queda fija: es lo que los clientes aceptaron. Cada aceptación guarda la versión, la
          hora y el teléfono. Publicar una versión nueva hace que la app la pida aceptar antes de seguir.
        </p>

        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : (
          TIPOS.map(({ tipo, nombre }) => {
            const versiones = documentos.filter((d) => d.tipo === tipo);
            const vigente = versiones[0];
            const n = vigente ? aceptaciones[vigente.id] || 0 : 0;
            return (
              <Card key={tipo}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{nombre}</p>
                        {vigente?.borrador && (
                          <span className="rounded-full bg-oro-50 px-2 py-0.5 text-[0.7rem] font-semibold text-oro-700">
                            Borrador
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {vigente
                          ? `Versión ${vigente.version} · publicada el ${fecha(vigente.publicado_en)}`
                          : "Sin publicar"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {vigente && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViendo(viendo === vigente.id ? null : vigente.id)}
                        >
                          {viendo === vigente.id ? "Ocultar texto" : "Ver texto"}
                        </Button>
                      )}
                      <Button size="sm" onClick={() => nuevaVersion(vigente, tipo)}>
                        Publicar nueva versión
                      </Button>
                    </div>
                  </div>

                  {vigente && (
                    <div>
                      <div className="mb-1 flex justify-between text-[0.75rem] text-muted-foreground">
                        <span>Aceptada por clientes</span>
                        <span className="font-medium text-foreground">
                          {n} de {clientes}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", n >= clientes ? "bg-green-600" : "bg-marca-600")}
                          style={{ width: `${clientes ? Math.min(100, (n / clientes) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {viendo === vigente?.id && (
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
                      <Previa contenido={vigente.contenido} />
                    </div>
                  )}

                  {versiones.length > 1 && (
                    <details className="text-[0.8rem] text-muted-foreground">
                      <summary className="cursor-pointer">Versiones anteriores ({versiones.length - 1})</summary>
                      <ul className="mt-2 space-y-1 pl-4">
                        {versiones.slice(1).map((v) => (
                          <li key={v.id}>
                            Versión {v.version} · {fecha(v.publicado_en)}
                            {v.borrador ? " · borrador" : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </Shell>
  );
}
