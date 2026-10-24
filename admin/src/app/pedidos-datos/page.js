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
 * Pedidos de los clientes sobre sus datos (migración 54). Hoy: eliminar
 * la cuenta.
 *
 * Tienen plazo legal de respuesta (10 días hábiles, a confirmar con la
 * asesoría): por eso cada pedido muestra cuánto falta y se pinta en rojo
 * al vencer. Eliminar borra las fotos, anonimiza los datos personales y
 * quita el acceso; conserva el registro de operaciones.
 */
const ESTADOS = {
  pendiente: { texto: "Pendiente", clase: "bg-oro-50 text-oro-700" },
  en_proceso: { texto: "En proceso", clase: "bg-marca-50 text-marca-700" },
  completada: { texto: "Eliminada", clase: "bg-green-50 text-green-700" },
  rechazada: { texto: "Rechazada", clase: "bg-red-50 text-red-700" },
  cancelada: { texto: "Cancelada por el cliente", clase: "bg-muted text-muted-foreground" },
};

const fecha = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "";

function plazo(vence) {
  const dias = Math.ceil((new Date(vence).getTime() - Date.now()) / 86400000);
  if (dias < 0) return { texto: `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}`, clase: "text-red-600 font-semibold" };
  if (dias === 0) return { texto: "Vence hoy", clase: "text-red-600 font-semibold" };
  if (dias <= 2) return { texto: `Vence en ${dias} día${dias === 1 ? "" : "s"}`, clase: "text-oro-700 font-semibold" };
  return { texto: `Vence el ${fecha(vence)}`, clase: "text-muted-foreground" };
}

export default function PrivacidadPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [pedidos, setPedidos] = useState([]);
  const [enCurso, setEnCurso] = useState({});
  const [filtro, setFiltro] = useState("abiertas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rechazando, setRechazando] = useState(null);
  const [respuesta, setRespuesta] = useState("");
  const [eliminando, setEliminando] = useState(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [accion, setAccion] = useState(null);
  const router = useRouter();

  const esAdmin = session?.rol === "admin";

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
    setError("");
    const estados = filtro === "abiertas" ? ["pendiente", "en_proceso"] : ["completada", "rechazada", "cancelada"];
    const { data, error: e } = await supabase
      .from("solicitudes_datos")
      .select(
        `id, user_id, tipo, estado, motivo, respuesta, creada_en, vence_en, atendida_en,
         cliente:users!solicitudes_datos_user_id_fkey (
           email,
           perfiles_cliente!perfiles_cliente_user_id_fkey (id, nombres, apellidos)
         )`,
      )
      .in("estado", estados)
      .order(filtro === "abiertas" ? "vence_en" : "creada_en", { ascending: filtro === "abiertas" });
    if (e) {
      setError(explicarError(e));
      setLoading(false);
      return;
    }
    setPedidos(data || []);

    // Solicitudes de dinero en curso: no se elimina a nadie con un pago pendiente.
    const ids = (data || []).map((p) => p.cliente?.perfiles_cliente?.[0]?.id ?? p.cliente?.perfiles_cliente?.id).filter(Boolean);
    if (ids.length && filtro === "abiertas") {
      const { data: abiertas } = await supabase
        .from("solicitudes")
        .select("cliente_id")
        .in("cliente_id", ids)
        .in("estado", ["pendiente", "aprobado"]);
      const cuenta = {};
      for (const s of abiertas || []) cuenta[s.cliente_id] = (cuenta[s.cliente_id] || 0) + 1;
      setEnCurso(cuenta);
    } else setEnCurso({});
    setLoading(false);
  }

  async function atender(p, estado, texto = null) {
    setAccion(p.id);
    setError("");
    const { data, error: e } = await supabase.rpc("atender_solicitud_datos", {
      p_id: p.id,
      p_estado: estado,
      p_respuesta: texto,
    });
    setAccion(null);
    if (e) return setError(explicarError(e));
    if (data?.ok === false) setError("Ese pedido ya estaba cerrado.");
    setRechazando(null);
    setRespuesta("");
    cargar();
  }

  async function eliminar(p) {
    setAccion(p.id);
    setError("");
    const { data, error: e } = await supabase.functions.invoke("eliminar-cuenta", { body: { solicitud_id: p.id } });
    setAccion(null);
    if (e) {
      // La función devuelve el motivo en el cuerpo (p. ej. solicitudes en curso).
      let detalle = e.message;
      try {
        detalle = (await e.context?.json())?.error || detalle;
      } catch {}
      return setError(detalle);
    }
    setEliminando(null);
    setConfirmacion("");
    setError("");
    window.alert(
      data?.opero
        ? `Cuenta eliminada. Como había operado, se conservaron ${data?.fotos_conservadas ?? 0} foto(s) y su identidad, bloqueadas, hasta que venza cada plazo.`
        : `Cuenta eliminada. Nunca había operado: se borraron ${data?.fotos_borradas ?? 0} foto(s) y sus datos.`,
    );
    cargar();
  }

  if (!session) return null;

  return (
    <Shell
      session={session}
      titulo="Pedidos de datos"
      descripcion="Clientes que pidieron eliminar su cuenta"
    >
      <div className="max-w-4xl space-y-4">
        {error && <Aviso onCerrar={() => setError("")}>{error}</Aviso>}

        <div className="flex gap-1.5">
          {[
            { clave: "abiertas", texto: "Por atender" },
            { clave: "cerradas", texto: "Cerradas" },
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
        ) : pedidos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/60 py-12 text-center text-[0.85rem] text-muted-foreground">
            {filtro === "abiertas" ? "No hay pedidos por atender." : "Todavía no hay pedidos cerrados."}
          </p>
        ) : (
          pedidos.map((p) => {
            const perfil = Array.isArray(p.cliente?.perfiles_cliente) ? p.cliente.perfiles_cliente[0] : p.cliente?.perfiles_cliente;
            const abiertas = perfil ? enCurso[perfil.id] || 0 : 0;
            const e = ESTADOS[p.estado];
            const abierta = ["pendiente", "en_proceso"].includes(p.estado);
            const pl = plazo(p.vence_en);
            return (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {perfil ? `${perfil.nombres} ${perfil.apellidos}` : "Sin perfil"}
                      </p>
                      <p className="text-sm text-muted-foreground">{p.cliente?.email}</p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-[0.72rem] font-semibold", e?.clase)}>{e?.texto}</span>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.8rem]">
                    <span className="text-muted-foreground">Pedido el {fecha(p.creada_en)}</span>
                    {abierta ? (
                      <span className={pl.clase}>{pl.texto}</span>
                    ) : (
                      <span className="text-muted-foreground">Cerrado el {fecha(p.atendida_en)}</span>
                    )}
                  </div>

                  {p.motivo && (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-[0.85rem]">
                      <span className="text-muted-foreground">Motivo del cliente: </span>
                      {p.motivo}
                    </p>
                  )}
                  {p.respuesta && (
                    <p className="text-[0.8rem] text-muted-foreground">Respuesta: {p.respuesta}</p>
                  )}
                  {abierta && abiertas > 0 && (
                    <p className="rounded-md bg-oro-50 px-3 py-2 text-[0.8rem] text-oro-700">
                      Tiene {abiertas} solicitud(es) de dinero en curso. Hay que terminarlas (y pagarle) antes de
                      eliminar la cuenta.
                    </p>
                  )}

                  {abierta && esAdmin && rechazando !== p.id && eliminando !== p.id && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {p.estado === "pendiente" && (
                        <Button variant="outline" size="sm" disabled={accion === p.id} onClick={() => atender(p, "en_proceso")}>
                          Tomar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRechazando(p.id);
                          setRespuesta("");
                        }}
                      >
                        Rechazar
                      </Button>
                      <Button
                        size="sm"
                        disabled={abiertas > 0}
                        className="bg-red-600 text-white hover:bg-red-700"
                        onClick={() => {
                          setEliminando(p.id);
                          setConfirmacion("");
                        }}
                      >
                        Eliminar cuenta
                      </Button>
                    </div>
                  )}

                  {rechazando === p.id && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-[0.8rem] font-medium">Respuesta para el cliente (la verá en sus avisos)</p>
                      <Textarea
                        value={respuesta}
                        onChange={(ev) => setRespuesta(ev.target.value)}
                        rows={3}
                        placeholder="Ej: Tienes una solicitud pendiente de pago. Te pagaremos y luego eliminaremos tu cuenta."
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRechazando(null)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={respuesta.trim().length < 10 || accion === p.id}
                          onClick={() => atender(p, "rechazada", respuesta.trim())}
                        >
                          Enviar respuesta y rechazar
                        </Button>
                      </div>
                    </div>
                  )}

                  {eliminando === p.id && (
                    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-3">
                      <p className="text-[0.85rem] font-medium text-red-800">Esto no se puede deshacer.</p>
                      <ul className="list-disc pl-5 text-[0.8rem] text-red-900">
                        <li>Pierde el acceso a la app y se borran su celular, dirección y correo.</li>
                        <li>
                          Si ya operó: sus fotos se conservan bloqueadas 5 años y su nombre, documento y operaciones
                          10 años desde su última operación (solo los ve la administración). Se borran solos al vencer.
                        </li>
                        <li>Si nunca operó: se borran sus fotos y sus datos.</li>
                      </ul>
                      <p className="text-[0.8rem]">
                        Escribe <span className="font-mono font-semibold">ELIMINAR</span> para confirmar:
                      </p>
                      <input
                        value={confirmacion}
                        onChange={(ev) => setConfirmacion(ev.target.value)}
                        className="w-48 rounded-md border border-input bg-card px-2.5 py-1.5 font-mono text-sm outline-none focus:border-red-400"
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEliminando(null)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={confirmacion !== "ELIMINAR" || accion === p.id}
                          className="bg-red-600 text-white hover:bg-red-700"
                          onClick={() => eliminar(p)}
                        >
                          {accion === p.id ? "Eliminando..." : "Eliminar definitivamente"}
                        </Button>
                      </div>
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
