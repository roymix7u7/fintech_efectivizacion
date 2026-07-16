"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function TarjetasAdminPage() {
  const [session, setSession] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [seleccionada, setSeleccionada] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [fotoModal, setFotoModal] = useState(null);
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargarTarjetas("pendiente");
    });
  }, [router]);

  async function cargarTarjetas(estado) {
    setLoading(true);
    setFiltro(estado);
    setSeleccionada(null);

    const { data } = await supabase
      .from("tarjetas")
      .select(
        `
        id, banco, ultimos_4, estado, foto_tarjeta, motivo_rechazo, created_at, fecha_revision,
        perfiles_cliente (nombres, apellidos, dni, telefono, user_id)
      `,
      )
      .eq("estado", estado)
      .eq("activa", true)
      .order("created_at", { ascending: true });

    // Firmar URLs
    if (data) {
      for (const t of data) {
        if (t.foto_tarjeta) {
          try {
            const pathParts = t.foto_tarjeta.split("tarjetas-fotos/");
            if (pathParts[1]) {
              const path = decodeURIComponent(pathParts[1].split("?")[0]);
              const { data: sd } = await supabase.storage
                .from("tarjetas-fotos")
                .createSignedUrl(path, 3600);
              if (sd?.signedUrl) t.foto_tarjeta = sd.signedUrl;
            }
          } catch (e) {}
        }
      }
    }

    setTarjetas(data || []);
    setLoading(false);
  }

  async function aprobar(t) {
    setAccion("aprobando");
    await supabase
      .from("tarjetas")
      .update({
        estado: "aprobado",
        revisado_por: session.user.id,
        fecha_revision: new Date().toISOString(),
      })
      .eq("id", t.id);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "APROBAR_TARJETA",
      entidad: "tarjetas",
      entidad_id: t.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "aprobado" },
    });

    setAccion(null);
    setSeleccionada(null);
    cargarTarjetas(filtro);
  }

  async function rechazar(t) {
    if (!motivo.trim()) return alert("Ingresa un motivo de rechazo.");
    setAccion("rechazando");
    await supabase
      .from("tarjetas")
      .update({
        estado: "rechazado",
        motivo_rechazo: motivo,
        revisado_por: session.user.id,
        fecha_revision: new Date().toISOString(),
      })
      .eq("id", t.id);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "RECHAZAR_TARJETA",
      entidad: "tarjetas",
      entidad_id: t.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "rechazado", motivo },
    });

    setAccion(null);
    setMotivo("");
    setSeleccionada(null);
    cargarTarjetas(filtro);
  }

  if (!session) return null;

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
          <h1 className="text-lg font-semibold">Verificación de tarjetas</h1>
        </div>
        <span className="text-sm text-gray-500">{session.user.email}</span>
      </nav>

      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex gap-2 mb-6">
          {["pendiente", "aprobado", "rechazado"].map((e) => (
            <Button
              key={e}
              variant={filtro === e ? "default" : "outline"}
              size="sm"
              onClick={() => cargarTarjetas(e)}
            >
              {e.charAt(0).toUpperCase() + e.slice(1)}s
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : tarjetas.length === 0 ? (
          <p className="text-gray-500">
            No hay tarjetas con estado &quot;{filtro}&quot;.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              {tarjetas.map((t) => (
                <Card
                  key={t.id}
                  className={`cursor-pointer transition-colors ${seleccionada?.id === t.id ? "border-blue-400 bg-blue-50" : "hover:border-gray-300"}`}
                  onClick={() => {
                    setSeleccionada(t);
                    setMotivo("");
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">
                        {t.banco} •••• {t.ultimos_4}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(t.created_at).toLocaleString("es-PE")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {t.perfiles_cliente?.nombres}{" "}
                      {t.perfiles_cliente?.apellidos}
                    </p>
                    <p className="text-xs text-gray-400">
                      DNI: {t.perfiles_cliente?.dni || "—"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {seleccionada && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Foto de la tarjeta</h3>
                    {seleccionada.foto_tarjeta ? (
                      <img
                        src={seleccionada.foto_tarjeta}
                        alt="Tarjeta"
                        className="w-full rounded-lg border max-h-80 object-contain bg-gray-100 cursor-pointer hover:opacity-80 transition"
                        onClick={() => setFotoModal(seleccionada.foto_tarjeta)}
                      />
                    ) : (
                      <div className="h-40 rounded border bg-gray-100 flex items-center justify-center text-gray-400">
                        Sin foto
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-sm">
                    <h3 className="font-semibold mb-2">Datos del cliente</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-gray-500">Nombre</span>
                        <p className="font-medium">
                          {seleccionada.perfiles_cliente?.nombres}{" "}
                          {seleccionada.perfiles_cliente?.apellidos}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">DNI</span>
                        <p className="font-medium">
                          {seleccionada.perfiles_cliente?.dni || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Tarjeta</span>
                        <p className="font-medium">
                          {seleccionada.banco} •••• {seleccionada.ultimos_4}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Teléfono</span>
                        <p className="font-medium">
                          {seleccionada.perfiles_cliente?.telefono || "—"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {filtro === "pendiente" && (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <Button
                        onClick={() => aprobar(seleccionada)}
                        disabled={accion !== null}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {accion === "aprobando"
                          ? "Aprobando..."
                          : "Aprobar tarjeta"}
                      </Button>
                      <div className="border-t pt-3 space-y-2">
                        <Textarea
                          placeholder="Motivo del rechazo..."
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                        />
                        <Button
                          onClick={() => rechazar(seleccionada)}
                          disabled={accion !== null}
                          variant="outline"
                          className="w-full border-red-300 text-red-600 hover:bg-red-50"
                        >
                          {accion === "rechazando"
                            ? "Rechazando..."
                            : "Rechazar tarjeta"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {fotoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: "rgba(0,0,0,0.9)" }}
          onClick={() => setFotoModal(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300"
            onClick={() => setFotoModal(null)}
          >
            ✕
          </button>
          <img
            src={fotoModal}
            alt="Tarjeta ampliada"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
