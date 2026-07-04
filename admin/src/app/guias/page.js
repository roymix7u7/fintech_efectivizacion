"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const BANCOS_DEFAULT = ["BCP", "BBVA", "Interbank", "Scotiabank", "BanBif"];

export default function GuiasPage() {
  const [session, setSession] = useState(null);
  const [guias, setGuias] = useState([]);
  const [editando, setEditando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nuevoBanco, setNuevoBanco] = useState("");
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
    const { data } = await supabase
      .from("guias_banco")
      .select("*")
      .order("banco");
    setGuias(data || []);
    setLoading(false);
  }

  async function crearGuia(banco) {
    if (!banco.trim()) return;
    const { error } = await supabase.from("guias_banco").insert({
      banco: banco.trim(),
      activa: true,
      pasos: [],
      actualizado_por: session.user.id,
    });
    if (error) return alert("Error: " + error.message);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "CREAR_GUIA_BANCO",
      entidad: "guias_banco",
      datos_despues: { banco: banco.trim() },
    });

    setNuevoBanco("");
    cargarGuias();
  }

  async function toggleGuia(guia) {
    await supabase
      .from("guias_banco")
      .update({ activa: !guia.activa, actualizado_por: session.user.id })
      .eq("id", guia.id);
    cargarGuias();
  }

  function editarGuia(guia) {
    setEditando({
      ...guia,
      pasos: guia.pasos || [],
    });
  }

  function agregarPaso() {
    setEditando({
      ...editando,
      pasos: [
        ...editando.pasos,
        {
          orden: editando.pasos.length + 1,
          titulo: "",
          descripcion: "",
          imagen_url: null,
        },
      ],
    });
  }

  function actualizarPaso(index, campo, valor) {
    const nuevos = [...editando.pasos];
    nuevos[index] = { ...nuevos[index], [campo]: valor };
    setEditando({ ...editando, pasos: nuevos });
  }

  function eliminarPaso(index) {
    const nuevos = editando.pasos
      .filter((_, i) => i !== index)
      .map((p, i) => ({ ...p, orden: i + 1 }));
    setEditando({ ...editando, pasos: nuevos });
  }

  function moverPaso(index, direccion) {
    const nuevos = [...editando.pasos];
    const target = index + direccion;
    if (target < 0 || target >= nuevos.length) return;
    [nuevos[index], nuevos[target]] = [nuevos[target], nuevos[index]];
    setEditando({
      ...editando,
      pasos: nuevos.map((p, i) => ({ ...p, orden: i + 1 })),
    });
  }

  async function guardarGuia() {
    setGuardando(true);

    const pasosLimpios = editando.pasos
      .filter((p) => p.titulo.trim())
      .map((p, i) => ({ ...p, orden: i + 1 }));

    await supabase
      .from("guias_banco")
      .update({
        pasos: pasosLimpios,
        actualizado_por: session.user.id,
      })
      .eq("id", editando.id);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "EDITAR_GUIA_BANCO",
      entidad: "guias_banco",
      entidad_id: editando.id,
      datos_despues: {
        banco: editando.banco,
        total_pasos: pasosLimpios.length,
      },
    });

    setGuardando(false);
    setEditando(null);
    cargarGuias();
  }

  if (!session) return null;

  // Vista de edición de una guía
  if (editando) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setEditando(null)}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Volver
          </button>
          <h1 className="text-lg font-semibold">
            Editando guía: {editando.banco}
          </h1>
        </nav>

        <main className="p-6 max-w-3xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Pasos de la guía</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={agregarPaso}>
                + Agregar paso
              </Button>
              <Button onClick={guardarGuia} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>

          {editando.pasos.length === 0 ? (
            <p className="text-gray-500 text-center py-10">
              No hay pasos. Haz clic en &quot;Agregar paso&quot; para empezar.
            </p>
          ) : (
            <div className="space-y-4">
              {editando.pasos.map((paso, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="bg-gray-900 text-white text-xs w-7 h-7 rounded-full flex items-center justify-center font-bold">
                          {paso.orden}
                        </span>
                        <span className="text-sm text-gray-500">
                          Paso {paso.orden}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moverPaso(index, -1)}
                          className="text-gray-400 hover:text-gray-600 px-2 py-1 text-sm"
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moverPaso(index, 1)}
                          className="text-gray-400 hover:text-gray-600 px-2 py-1 text-sm"
                          disabled={index === editando.pasos.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => eliminarPaso(index)}
                          className="text-red-400 hover:text-red-600 px-2 py-1 text-sm"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Título del paso</Label>
                        <Input
                          value={paso.titulo}
                          onChange={(e) =>
                            actualizarPaso(index, "titulo", e.target.value)
                          }
                          placeholder="Ej: Abre tu app BCP"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Descripción</Label>
                        <Textarea
                          value={paso.descripcion}
                          onChange={(e) =>
                            actualizarPaso(index, "descripcion", e.target.value)
                          }
                          placeholder="Ej: Ve a Transferencias > A otros bancos"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">
                          URL de imagen (opcional)
                        </Label>
                        <Input
                          value={paso.imagen_url || ""}
                          onChange={(e) =>
                            actualizarPaso(
                              index,
                              "imagen_url",
                              e.target.value || null,
                            )
                          }
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Vista de lista de guías
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Dashboard
          </button>
          <h1 className="text-lg font-semibold">Guías de banco</h1>
        </div>
        <span className="text-sm text-gray-500">{session.user.email}</span>
      </nav>

      <main className="p-6 max-w-3xl mx-auto">
        {/* Crear nueva guía */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Agregar banco</h3>
            <div className="flex gap-2 mb-3">
              {BANCOS_DEFAULT.filter(
                (b) => !guias.find((g) => g.banco === b),
              ).map((b) => (
                <Button
                  key={b}
                  variant="outline"
                  size="sm"
                  onClick={() => crearGuia(b)}
                >
                  + {b}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Otro banco..."
                value={nuevoBanco}
                onChange={(e) => setNuevoBanco(e.target.value)}
              />
              <Button
                onClick={() => crearGuia(nuevoBanco)}
                disabled={!nuevoBanco.trim()}
              >
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de guías */}
        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : guias.length === 0 ? (
          <p className="text-gray-500">
            No hay guías creadas. Agrega un banco arriba.
          </p>
        ) : (
          <div className="space-y-3">
            {guias.map((guia) => (
              <Card key={guia.id} className={!guia.activa ? "opacity-60" : ""}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div
                    className="cursor-pointer flex-1"
                    onClick={() => editarGuia(guia)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏦</span>
                      <div>
                        <p className="font-semibold">{guia.banco}</p>
                        <p className="text-sm text-gray-500">
                          {(guia.pasos || []).length} pasos configurados
                          {guia.updated_at &&
                            ` — Editado: ${new Date(guia.updated_at).toLocaleDateString("es-PE")}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => editarGuia(guia)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleGuia(guia)}
                      className={
                        guia.activa
                          ? "border-red-300 text-red-600"
                          : "border-green-300 text-green-600"
                      }
                    >
                      {guia.activa ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
