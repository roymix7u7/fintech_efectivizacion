"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import Shell from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AuditoriaPage() {
  const [session, setSession] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroAccion, setFiltroAccion] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargarLogs();
    });
  }, [router]);

  async function cargarLogs(accion, fecha) {
    setLoading(true);

    let query = supabase
      .from("auditoria_logs")
      .select("*, users(email)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (accion) query = query.ilike("accion", `%${accion}%`);
    if (fecha) query = query.gte("created_at", fecha).lte("created_at", fecha + "T23:59:59");

    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  }

  function buscar() {
    cargarLogs(filtroAccion, filtroFecha);
  }

  function limpiar() {
    setFiltroAccion("");
    setFiltroFecha("");
    cargarLogs();
  }

  const accionColor = {
    APROBAR_KYC: "bg-green-100 text-green-700",
    OBSERVAR_KYC: "bg-red-100 text-red-700",
    EDITAR_PERFIL_CLIENTE: "bg-blue-100 text-blue-700",
    ASIGNAR_TASA: "bg-purple-100 text-purple-700",
    CREAR_ALERTA: "bg-yellow-100 text-yellow-700",
    ACTIVAR_ALERTA: "bg-green-100 text-green-700",
    DESACTIVAR_ALERTA: "bg-gray-100 text-gray-700",
    CREAR_GUIA_BANCO: "bg-blue-100 text-blue-700",
    EDITAR_GUIA_BANCO: "bg-blue-100 text-blue-700",
  };

  if (!session) return null;

  return (
    <Shell
      session={session}
      titulo="Auditoría"
      descripcion="Historial de acciones del personal"
    >
      <div className="max-w-4xl">
        {/* Filtros */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Acción</label>
                <Input
                  placeholder="Ej: APROBAR, KYC, ALERTA..."
                  value={filtroAccion}
                  onChange={(e) => setFiltroAccion(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha</label>
                <Input
                  type="date"
                  value={filtroFecha}
                  onChange={(e) => setFiltroFecha(e.target.value)}
                />
              </div>
              <Button onClick={buscar}>Buscar</Button>
              <Button variant="outline" onClick={limpiar}>Limpiar</Button>
            </div>
          </CardContent>
        </Card>

        {/* Logs */}
        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : logs.length === 0 ? (
          <p className="text-gray-500">No hay registros de auditoría.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accionColor[log.accion] || "bg-gray-100 text-gray-700"}`}>
                          {log.accion}
                        </span>
                        <span className="text-xs text-gray-400">
                          {log.entidad}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {log.users?.email || "Sistema"}
                      </p>
                      {log.datos_despues && (
                        <pre className="text-xs text-gray-400 mt-2 bg-gray-50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.datos_despues, null, 2)}
                        </pre>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                      {new Date(log.created_at).toLocaleString("es-PE")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}