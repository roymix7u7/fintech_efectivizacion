"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function KYCPage() {
  const [session, setSession] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargarClientes("pendiente");
    });
  }, [router]);

  async function cargarClientes(estado) {
    setLoading(true);
    setFiltro(estado);

    const { data: usuarios } = await supabase
      .from("users")
      .select("id, email, estado")
      .eq("rol", "cliente")
      .eq("estado", estado)
      .order("created_at", { ascending: false });

    if (usuarios && usuarios.length > 0) {
      const ids = usuarios.map((u) => u.id);
      const { data: perfiles } = await supabase
        .from("perfiles_cliente")
        .select("*")
        .in("user_id", ids);

      const clientesCompletos = usuarios.map((u) => ({
        ...u,
        perfil: perfiles?.find((p) => p.user_id === u.id) || null,
      }));

      setClientes(clientesCompletos);
    } else {
      setClientes([]);
    }
    setLoading(false);
  }

  const colorBadge = {
    pendiente: "bg-yellow-100 text-yellow-800",
    activo: "bg-green-100 text-green-800",
    observado: "bg-red-100 text-red-800",
    bloqueado: "bg-gray-100 text-gray-800",
  };

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
          <h1 className="text-lg font-semibold">Gestión KYC</h1>
        </div>
        <span className="text-sm text-gray-500">{session.user.email}</span>
      </nav>

      <main className="p-6 max-w-4xl mx-auto">
        <div className="flex gap-2 mb-6">
          {["pendiente", "activo", "observado", "bloqueado"].map((e) => (
            <Button
              key={e}
              variant={filtro === e ? "default" : "outline"}
              size="sm"
              onClick={() => cargarClientes(e)}
            >
              {e.charAt(0).toUpperCase() + e.slice(1)}
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : clientes.length === 0 ? (
          <p className="text-gray-500">
            No hay clientes con estado "{filtro}".
          </p>
        ) : (
          <div className="space-y-3">
            {clientes.map((cliente) => (
              <Card
                key={cliente.id}
                className="cursor-pointer hover:border-gray-300"
                onClick={() => router.push(`/kyc/${cliente.id}`)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {cliente.perfil
                        ? `${cliente.perfil.nombres} ${cliente.perfil.apellidos}`
                        : "Sin perfil completado"}
                    </p>
                    <p className="text-sm text-gray-500">{cliente.email}</p>
                    {cliente.perfil?.telefono && (
                      <p className="text-sm text-gray-400">
                        {cliente.perfil.telefono}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${colorBadge[cliente.estado]}`}
                    >
                      {cliente.estado}
                    </span>
                    <span className="text-gray-400">→</span>
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
