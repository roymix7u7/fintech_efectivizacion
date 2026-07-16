"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function SolicitudesPage() {
  const [session, setSession] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
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
      if (!["gestor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargarSolicitudes("pendiente");
    });
  }, [router]);

  async function cargarSolicitudes(estado) {
    setLoading(true);
    setFiltro(estado);
    setSeleccionada(null);

    const { data } = await supabase
      .from("solicitudes")
      .select(
        `
        id, codigo, banco, estado, nota_cliente, motivo_rechazo,
        comprobante_url, created_at, fecha_revision,
        tarjetas (banco, ultimos_4),
        perfiles_cliente (nombres, apellidos, telefono, dni, user_id)
      `,
      )
      .eq("estado", estado)
      .order("created_at", { ascending: true });

    // Generar URLs firmadas para comprobantes
    if (data) {
      for (const sol of data) {
        if (sol.comprobante_url && sol.perfiles_cliente?.user_id) {
          try {
            const urlParts = sol.comprobante_url.split("comprobantes/");
            if (urlParts[1]) {
              const path = decodeURIComponent(urlParts[1].split("?")[0]);
              const { data: signedData } = await supabase.storage
                .from("comprobantes")
                .createSignedUrl(path, 3600);
              if (signedData?.signedUrl)
                sol.comprobante_url = signedData.signedUrl;
            }
          } catch (e) {
            console.log("Error firmando URL:", e);
          }
        }
      }
    }

    setSolicitudes(data || []);
    setLoading(false);
  }

  async function aprobarSolicitud(sol) {
    setAccion("aprobando");

    await supabase
      .from("solicitudes")
      .update({
        estado: "aprobado",
        revisado_por: session.user.id,
        fecha_revision: new Date().toISOString(),
      })
      .eq("id", sol.id);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "APROBAR_SOLICITUD",
      entidad: "solicitudes",
      entidad_id: sol.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "aprobado" },
    });

    setAccion(null);
    setSeleccionada(null);
    cargarSolicitudes(filtro);
  }

  async function rechazarSolicitud(sol) {
    if (!motivo.trim()) return alert("Ingresa un motivo de rechazo.");
    setAccion("rechazando");

    await supabase
      .from("solicitudes")
      .update({
        estado: "rechazado",
        motivo_rechazo: motivo,
        revisado_por: session.user.id,
        fecha_revision: new Date().toISOString(),
      })
      .eq("id", sol.id);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "RECHAZAR_SOLICITUD",
      entidad: "solicitudes",
      entidad_id: sol.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "rechazado", motivo },
    });

    setAccion(null);
    setMotivo("");
    setSeleccionada(null);
    cargarSolicitudes(filtro);
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
          <h1 className="text-lg font-semibold">Solicitudes de clientes</h1>
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
              onClick={() => cargarSolicitudes(e)}
            >
              {e.charAt(0).toUpperCase() + e.slice(1)}s
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : solicitudes.length === 0 ? (
          <p className="text-gray-500">
            No hay solicitudes con estado &quot;{filtro}&quot;.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lista */}
            <div className="space-y-3">
              {solicitudes.map((sol) => (
                <Card
                  key={sol.id}
                  className={`cursor-pointer transition-colors ${
                    seleccionada?.id === sol.id
                      ? "border-blue-400 bg-blue-50"
                      : "hover:border-gray-300"
                  }`}
                  onClick={() => {
                    setSeleccionada(sol);
                    setMotivo("");
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-medium">
                        {sol.codigo}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(sol.created_at).toLocaleString("es-PE")}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {sol.perfiles_cliente?.nombres}{" "}
                      {sol.perfiles_cliente?.apellidos}
                    </p>
                    <p className="text-xs text-gray-500">
                      {sol.tarjetas?.banco} •••• {sol.tarjetas?.ultimos_4}
                    </p>
                    {sol.nota_cliente && (
                      <p className="text-xs text-gray-400 mt-1 italic truncate">
                        {sol.nota_cliente}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Detalle */}
            {seleccionada && (
              <div className="space-y-4">
                {/* Comprobante */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Comprobante</h3>
                    {seleccionada.comprobante_url ? (
                      <img
                        src={seleccionada.comprobante_url}
                        alt="Comprobante"
                        className="w-full rounded-lg border max-h-96 object-contain bg-gray-100 cursor-pointer hover:opacity-80 transition"
                        onClick={() =>
                          setFotoModal(seleccionada.comprobante_url)
                        }
                      />
                    ) : (
                      <div className="h-40 rounded border bg-gray-100 flex items-center justify-center text-gray-400">
                        Sin comprobante
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Datos del cliente */}
                <Card>
                  <CardContent className="p-4 space-y-2 text-sm">
                    <h3 className="font-semibold mb-2">
                      Datos de la solicitud
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-gray-500">Código</span>
                        <p className="font-mono font-medium">
                          {seleccionada.codigo}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Cliente</span>
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
                        <span className="text-gray-500">Teléfono</span>
                        <p className="font-medium">
                          {seleccionada.perfiles_cliente?.telefono || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Tarjeta</span>
                        <p className="font-medium">
                          {seleccionada.tarjetas?.banco} ••••{" "}
                          {seleccionada.tarjetas?.ultimos_4}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Fecha</span>
                        <p className="font-medium">
                          {new Date(seleccionada.created_at).toLocaleString(
                            "es-PE",
                          )}
                        </p>
                      </div>
                    </div>
                    {seleccionada.nota_cliente && (
                      <div className="mt-2 pt-2 border-t">
                        <span className="text-gray-500">Nota del cliente</span>
                        <p className="font-medium italic">
                          {seleccionada.nota_cliente}
                        </p>
                      </div>
                    )}
                    {seleccionada.estado === "rechazado" &&
                      seleccionada.motivo_rechazo && (
                        <div className="mt-2 pt-2 border-t bg-red-50 p-3 rounded">
                          <span className="text-red-500 font-medium">
                            Motivo del rechazo
                          </span>
                          <p className="text-red-700">
                            {seleccionada.motivo_rechazo}
                          </p>
                        </div>
                      )}
                  </CardContent>
                </Card>

                {/* Acciones */}
                {filtro === "pendiente" && (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <Button
                        onClick={() => aprobarSolicitud(seleccionada)}
                        disabled={accion !== null}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {accion === "aprobando"
                          ? "Aprobando..."
                          : "Aprobar solicitud"}
                      </Button>

                      <div className="border-t pt-3 space-y-2">
                        <Textarea
                          placeholder="Motivo del rechazo..."
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                        />
                        <Button
                          onClick={() => rechazarSolicitud(seleccionada)}
                          disabled={accion !== null}
                          variant="outline"
                          className="w-full border-red-300 text-red-600 hover:bg-red-50"
                        >
                          {accion === "rechazando"
                            ? "Rechazando..."
                            : "Rechazar solicitud"}
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

      {/* Modal foto pantalla completa */}
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
            alt="Comprobante ampliado"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
