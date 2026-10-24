"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { cn } from "@/lib/utils";
import Shell from "@/components/shell";
import { Aviso } from "@/components/marca";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

/**
 * Bandeja del Libro de Reclamaciones (migración 56). Las hojas llegan de
 * la app y de la web. Plazo de respuesta: 15 días hábiles (a confirmar
 * con la asesoría): cada hoja muestra cuánto falta y se pone en rojo al
 * vencer.
 *
 * Si el cliente tiene cuenta, la respuesta le llega a Mis avisos. Si la
 * dejó desde la web sin cuenta, hay que enviársela por correo: por eso,
 * al responder, se ofrece abrir el correo ya redactado.
 */
const fecha = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "";

function plazo(vence) {
  const dias = Math.ceil((new Date(vence).getTime() - Date.now()) / 86400000);
  if (dias < 0) return { texto: `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}`, clase: "text-red-600 font-semibold" };
  if (dias === 0) return { texto: "Vence hoy", clase: "text-red-600 font-semibold" };
  if (dias <= 3) return { texto: `Vence en ${dias} día${dias === 1 ? "" : "s"}`, clase: "text-oro-700 font-semibold" };
  return { texto: `Vence el ${fecha(vence)}`, clase: "text-muted-foreground" };
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState(null);
  const [respuesta, setRespuesta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
    });
  }, [router]);

  useEffect(() => {
    if (session) cargar();
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
    setLoading(false);
  }

  async function responder(r) {
    setGuardando(true);
    setError("");
    const texto = respuesta.trim();
    const { data, error: e } = await supabase.rpc("responder_reclamo", { p_id: r.id, p_respuesta: texto });
    setGuardando(false);
    if (e) return setError(explicarError(e));
    if (data?.ok === false) return setError("Esa hoja ya estaba respondida.");
    // Sin cuenta en la app, la respuesta solo le llega por correo.
    if (!r.user_id && window.confirm("Respuesta guardada. ¿Abrir el correo para enviársela al consumidor?")) {
      window.location.href = correoRespuesta(r, texto);
    }
    setAbierta(null);
    setRespuesta("");
    cargar();
  }

  if (!session) return null;

  return (
    <Shell session={session} titulo="Libro de Reclamaciones" descripcion="Reclamos y quejas de clientes, con plazo de respuesta">
      <div className="max-w-4xl space-y-4">
        {error && <Aviso onCerrar={() => setError("")}>{error}</Aviso>}

        <div className="flex gap-1.5">
          {[
            { clave: "pendiente", texto: "Por responder" },
            { clave: "respondido", texto: "Respondidas" },
          ].map((f) => (
            <button
              key={f.clave}
              onClick={() => setFiltro(f.clave)}
              className={cn(
                "pulsable rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium ring-1 ring-inset",
                filtro === f.clave ? "bg-marca-700 text-white ring-marca-700" : "bg-card text-muted-foreground ring-border",
              )}
            >
              {f.texto}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : hojas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/60 py-12 text-center text-[0.85rem] text-muted-foreground">
            {filtro === "pendiente" ? "No hay hojas por responder." : "Todavía no hay hojas respondidas."}
          </p>
        ) : (
          hojas.map((r) => {
            const pl = plazo(r.vence_en);
            const abierto = abierta === r.id;
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {r.tipo === "queja" ? "Queja" : "Reclamo"} N.° {r.codigo}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {r.nombres} · {r.tipo_documento.toUpperCase()} {r.numero_documento} · {r.origen === "app" ? "desde la app" : "desde la web"}
                      </p>
                    </div>
                    <div className="text-right text-[0.8rem]">
                      <p className="text-muted-foreground">Registrada el {fecha(r.creado_en)}</p>
                      {r.estado === "pendiente" ? (
                        <p className={pl.clase}>{pl.texto}</p>
                      ) : (
                        <p className="text-green-700">Respondida el {fecha(r.respondido_en)}</p>
                      )}
                    </div>
                  </div>

                  <button onClick={() => setAbierta(abierto ? null : r.id)} className="text-[0.8rem] font-medium text-marca-700 hover:underline">
                    {abierto ? "Ocultar la hoja" : "Ver la hoja completa"}
                  </button>

                  {abierto && (
                    <dl className="grid gap-x-6 gap-y-3 rounded-lg bg-muted/40 p-4 text-[0.85rem] sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Domicilio</dt>
                        <dd>{r.domicilio}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Contacto</dt>
                        <dd>
                          {r.correo}
                          {r.telefono ? ` · ${r.telefono}` : ""}
                        </dd>
                      </div>
                      {r.menor_edad && (
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">Menor de edad · apoderado</dt>
                          <dd>{r.apoderado}</dd>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Servicio</dt>
                        <dd>
                          {r.descripcion_bien}
                          {r.monto != null ? ` · Monto reclamado: S/ ${r.monto}` : ""}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Detalle</dt>
                        <dd className="whitespace-pre-wrap">{r.detalle}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Pedido</dt>
                        <dd className="whitespace-pre-wrap">{r.pedido}</dd>
                      </div>
                      {r.respuesta && (
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">Respuesta</dt>
                          <dd className="whitespace-pre-wrap">{r.respuesta}</dd>
                          {!r.user_id && (
                            <a href={correoRespuesta(r, r.respuesta)} className="mt-1 inline-block text-[0.8rem] font-medium text-marca-700 hover:underline">
                              Volver a enviarla por correo
                            </a>
                          )}
                        </div>
                      )}
                    </dl>
                  )}

                  {abierto && r.estado === "pendiente" && (
                    <div className="space-y-2">
                      <p className="text-[0.8rem] font-medium">
                        Respuesta al consumidor
                        {r.user_id ? " (le llega a Mis avisos en la app)" : " (sin cuenta: se la enviarás por correo)"}
                      </p>
                      <Textarea
                        value={respuesta}
                        onChange={(e) => setRespuesta(e.target.value)}
                        rows={4}
                        placeholder="Qué revisamos, qué encontramos y qué hicimos."
                      />
                      <Button disabled={respuesta.trim().length < 20 || guardando} onClick={() => responder(r)}>
                        {guardando ? "Guardando..." : "Guardar respuesta"}
                      </Button>
                    </div>
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
