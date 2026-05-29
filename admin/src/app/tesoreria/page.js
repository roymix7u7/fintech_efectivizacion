"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function TesoreriaPage() {
  const [session, setSession] = useState(null);
  const [operaciones, setOperaciones] = useState([]);
  const [filtro, setFiltro] = useState("pendiente_deposito");
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["tesoreria", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargarOperaciones("pendiente_deposito");
    });
  }, [router]);

  async function cargarOperaciones(estado) {
    setLoading(true);
    setFiltro(estado);

    const { data } = await supabase
      .from("operaciones")
      .select(
        `
        id, codigo, monto_bruto, monto_comision, monto_neto,
        tasa_comision, estado, created_at, fecha_verificacion,
        tarjetas (banco, ultimos_4),
        cuentas_bancarias (banco, numero_cuenta),
        perfiles_cliente (nombres, apellidos, telefono, user_id)
      `,
      )
      .eq("estado", estado)
      .order("created_at", { ascending: true });

    setOperaciones(data || []);
    setLoading(false);
  }

  async function marcarDepositado(op) {
    if (
      !confirm(
        `¿Confirmas el depósito de S/ ${op.monto_neto?.toFixed(2)} a ${op.perfiles_cliente?.nombres} ${op.perfiles_cliente?.apellidos}?`,
      )
    )
      return;

    setProcesando(op.id);

    await supabase
      .from("operaciones")
      .update({
        estado: "depositado",
        depositado_por: session.user.id,
        fecha_deposito: new Date().toISOString(),
      })
      .eq("id", op.id);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "DEPOSITAR_OPERACION",
      entidad: "operaciones",
      entidad_id: op.id,
      datos_antes: { estado: "pendiente_deposito" },
      datos_despues: { estado: "depositado", monto_neto: op.monto_neto },
    });

    setProcesando(null);
    cargarOperaciones(filtro);
  }

  // Calcular totales
  const totalNeto = operaciones.reduce(
    (sum, op) => sum + (op.monto_neto || 0),
    0,
  );
  const totalComision = operaciones.reduce(
    (sum, op) => sum + (op.monto_comision || 0),
    0,
  );

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
          <h1 className="text-lg font-semibold">Tesorería</h1>
        </div>
        <span className="text-sm text-gray-500">{session.user.email}</span>
      </nav>

      <main className="p-6 max-w-4xl mx-auto">
        <div className="flex gap-2 mb-6">
          {["pendiente_deposito", "depositado"].map((e) => (
            <Button
              key={e}
              variant={filtro === e ? "default" : "outline"}
              size="sm"
              onClick={() => cargarOperaciones(e)}
            >
              {e === "pendiente_deposito" ? "Por depositar" : "Depositados"}
            </Button>
          ))}
        </div>

        {/* Resumen */}
        {operaciones.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-500">Operaciones</p>
                <p className="text-2xl font-bold">{operaciones.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-500">Total a depositar</p>
                <p className="text-2xl font-bold text-green-700">
                  S/ {totalNeto.toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-500">Comisiones</p>
                <p className="text-2xl font-bold text-blue-700">
                  S/ {totalComision.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : operaciones.length === 0 ? (
          <p className="text-gray-500">
            No hay operaciones{" "}
            {filtro === "pendiente_deposito"
              ? "pendientes de depósito"
              : "depositadas"}
            .
          </p>
        ) : (
          <div className="space-y-3">
            {operaciones.map((op) => (
              <Card key={op.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-sm font-medium">
                          {op.codigo}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(op.created_at).toLocaleString("es-PE")}
                        </span>
                      </div>
                      <p className="text-sm font-medium">
                        {op.perfiles_cliente?.nombres}{" "}
                        {op.perfiles_cliente?.apellidos}
                      </p>
                      <p className="text-xs text-gray-500">
                        {op.tarjetas?.banco} •••• {op.tarjetas?.ultimos_4}
                      </p>
                      <div className="mt-2 flex gap-6 text-sm">
                        <div>
                          <span className="text-gray-400">Destino: </span>
                          <span className="font-medium">
                            {op.cuentas_bancarias?.banco}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Cuenta: </span>
                          <span className="font-mono">
                            {op.cuentas_bancarias?.numero_cuenta ||
                              "Encriptada"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <p className="text-xs text-gray-400">
                        Bruto: S/ {op.monto_bruto?.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Com. ({op.tasa_comision}%): S/{" "}
                        {op.monto_comision?.toFixed(2)}
                      </p>
                      <p className="text-xl font-bold text-green-700 mt-1">
                        S/ {op.monto_neto?.toFixed(2)}
                      </p>

                      {filtro === "pendiente_deposito" && (
                        <Button
                          size="sm"
                          className="mt-2 bg-green-600 hover:bg-green-700"
                          disabled={procesando === op.id}
                          onClick={() => marcarDepositado(op)}
                        >
                          {procesando === op.id
                            ? "Procesando..."
                            : "Marcar depositado"}
                        </Button>
                      )}

                      {filtro === "depositado" && (
                        <span className="text-xs text-green-600 mt-2 block">
                          Depositado el{" "}
                          {new Date(
                            op.fecha_deposito || op.created_at,
                          ).toLocaleDateString("es-PE")}
                        </span>
                      )}
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
