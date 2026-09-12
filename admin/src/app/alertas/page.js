"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import Shell from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function AlertasPage() {
  const [session, setSession] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    mensaje: "",
    tipo: "info",
    fecha_fin: "",
  });
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargarAlertas();
    });
  }, [router]);

  async function cargarAlertas() {
    setLoading(true);
    const { data } = await supabase
      .from("alertas_sistema")
      .select("*")
      .order("created_at", { ascending: false });
    setAlertas(data || []);
    setLoading(false);
  }

  async function crearAlerta() {
    if (!form.titulo.trim() || !form.mensaje.trim())
      return alert("Completa título y mensaje.");
    setGuardando(true);

    const { error } = await supabase.from("alertas_sistema").insert({
      titulo: form.titulo,
      mensaje: form.mensaje,
      tipo: form.tipo,
      activa: true,
      fecha_fin: form.fecha_fin || null,
      creada_por: session.user.id,
    });

    if (error) {
      alert("Error al crear alerta.");
      setGuardando(false);
      return;
    }

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "CREAR_ALERTA",
      entidad: "alertas_sistema",
      datos_despues: { titulo: form.titulo, tipo: form.tipo },
    });

    setForm({ titulo: "", mensaje: "", tipo: "info", fecha_fin: "" });
    setCreando(false);
    setGuardando(false);
    cargarAlertas();
  }

  async function toggleAlerta(alerta) {
    const nuevaActiva = !alerta.activa;

    await supabase
      .from("alertas_sistema")
      .update({ activa: nuevaActiva })
      .eq("id", alerta.id);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: nuevaActiva ? "ACTIVAR_ALERTA" : "DESACTIVAR_ALERTA",
      entidad: "alertas_sistema",
      entidad_id: alerta.id,
      datos_antes: { activa: alerta.activa },
      datos_despues: { activa: nuevaActiva },
    });

    cargarAlertas();
  }

  const colores = {
    info: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-800",
      badge: "bg-blue-100 text-blue-700",
    },
    advertencia: {
      bg: "bg-orange-50",
      border: "border-orange-200",
      text: "text-orange-800",
      badge: "bg-orange-100 text-orange-700",
    },
    critico: {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-800",
      badge: "bg-red-100 text-red-700",
    },
  };

  if (!session) return null;

  return (
    <Shell
      session={session}
      titulo="Noticias"
      descripcion="Avisos que ven todos los clientes en su app"
    >
      <div className="max-w-3xl">
        {!creando ? (
          <Button onClick={() => setCreando(true)} className="mb-6">
            + Nueva alerta
          </Button>
        ) : (
          <Card className="mb-6">
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold">Crear nueva alerta</h3>

              <div className="space-y-2">
                <Label>Tipo de alerta</Label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="w-full border rounded-md p-2 text-sm"
                >
                  <option value="info">
                    Info — Banner discreto, el cliente puede cerrarlo
                  </option>
                  <option value="advertencia">
                    Advertencia — Banner visible, reaparece al abrir la app
                  </option>
                  <option value="critico">
                    Crítico — Modal que bloquea la pantalla
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  placeholder="Ej: Sistema en mantenimiento"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Mensaje</Label>
                <Textarea
                  placeholder="Mensaje completo para el cliente..."
                  value={form.mensaje}
                  onChange={(e) =>
                    setForm({ ...form, mensaje: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Fecha de expiración (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={form.fecha_fin}
                  onChange={(e) =>
                    setForm({ ...form, fecha_fin: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={crearAlerta} disabled={guardando}>
                  {guardando ? "Creando..." : "Crear alerta"}
                </Button>
                <Button variant="outline" onClick={() => setCreando(false)}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : alertas.length === 0 ? (
          <p className="text-gray-500">No hay alertas creadas.</p>
        ) : (
          <div className="space-y-3">
            {alertas.map((alerta) => {
              const c = colores[alerta.tipo] || colores.info;
              return (
                <Card
                  key={alerta.id}
                  className={`${alerta.activa ? c.border : "border-gray-200 opacity-60"}`}
                >
                  <CardContent className={`p-4 ${alerta.activa ? c.bg : ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}
                          >
                            {alerta.tipo}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${alerta.activa ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                          >
                            {alerta.activa ? "Activa" : "Inactiva"}
                          </span>
                        </div>
                        <h3
                          className={`font-semibold ${alerta.activa ? c.text : "text-gray-500"}`}
                        >
                          {alerta.titulo}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {alerta.mensaje}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          Creada:{" "}
                          {new Date(alerta.created_at).toLocaleString("es-PE")}
                          {alerta.fecha_fin &&
                            ` — Expira: ${new Date(alerta.fecha_fin).toLocaleString("es-PE")}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleAlerta(alerta)}
                        className={
                          alerta.activa
                            ? "border-red-300 text-red-600 hover:bg-red-50"
                            : "border-green-300 text-green-600 hover:bg-green-50"
                        }
                      >
                        {alerta.activa ? "Desactivar" : "Activar"}
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
