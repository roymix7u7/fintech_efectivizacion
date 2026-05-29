"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function VerificacionPage() {
  const [session, setSession] = useState(null);
  const [operaciones, setOperaciones] = useState([]);
  const [filtro, setFiltro] = useState("pendiente_verificacion");
  const [seleccionada, setSeleccionada] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["verificador", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargarOperaciones("pendiente_verificacion");
    });
  }, [router]);

  async function cargarOperaciones(estado) {
    setLoading(true);
    setFiltro(estado);
    setSeleccionada(null);

    const { data } = await supabase
      .from("operaciones")
      .select(
        `
        id, codigo, monto_bruto, monto_comision, monto_neto,
        tasa_comision, estado, created_at, numero_op_voucher,
        fecha_voucher, voucher_url, ocr_datos_raw,
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

  async function aprobarOperacion(op) {
    setAccion("aprobando");

    await supabase
      .from("operaciones")
      .update({
        estado: "pendiente_deposito",
        verificado_por: session.user.id,
        fecha_verificacion: new Date().toISOString(),
      })
      .eq("id", op.id);

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "APROBAR_OPERACION",
      entidad: "operaciones",
      entidad_id: op.id,
      datos_antes: { estado: "pendiente_verificacion" },
      datos_despues: { estado: "pendiente_deposito" },
    });

    setAccion(null);
    setSeleccionada(null);
    cargarOperaciones(filtro);
  }

  async function observarOperacion(op) {
    if (!motivo.trim()) return alert("Ingresa un motivo.");
    setAccion("observando");

    await supabase
      .from("operaciones")
      .update({ estado: "observado" })
      .eq("id", op.id);

    await supabase.from("observaciones").insert({
      entidad: "operaciones",
      entidad_id: op.id,
      motivo,
      creado_por: session.user.id,
    });

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "OBSERVAR_OPERACION",
      entidad: "operaciones",
      entidad_id: op.id,
      datos_antes: { estado: "pendiente_verificacion" },
      datos_despues: { estado: "observado", motivo },
    });

    setAccion(null);
    setMotivo("");
    setSeleccionada(null);
    cargarOperaciones(filtro);
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
          <h1 className="text-lg font-semibold">Verificación de operaciones</h1>
        </div>
        <span className="text-sm text-gray-500">{session.user.email}</span>
      </nav>

      <main className="p-6 max-w-5xl mx-auto">
        <div className="flex gap-2 mb-6">
          {[
            "pendiente_verificacion",
            "pendiente_deposito",
            "observado",
            "depositado",
          ].map((e) => (
            <Button
              key={e}
              variant={filtro === e ? "default" : "outline"}
              size="sm"
              onClick={() => cargarOperaciones(e)}
            >
              {e.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : operaciones.length === 0 ? (
          <p className="text-gray-500">
            No hay operaciones con estado "{filtro.replace(/_/g, " ")}".
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lista de operaciones */}
            <div className="space-y-3">
              {operaciones.map((op) => (
                <Card
                  key={op.id}
                  className={`cursor-pointer transition-colors ${
                    seleccionada?.id === op.id
                      ? "border-blue-400 bg-blue-50"
                      : "hover:border-gray-300"
                  }`}
                  onClick={() => {
                    setSeleccionada(op);
                    setMotivo("");
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-medium">
                        {op.codigo}
                      </span>
                      <span className="text-lg font-bold">
                        S/ {op.monto_bruto?.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {op.perfiles_cliente?.nombres}{" "}
                      {op.perfiles_cliente?.apellidos}
                    </p>
                    <p className="text-xs text-gray-400">
                      {op.tarjetas?.banco} •••• {op.tarjetas?.ultimos_4} →{" "}
                      {op.cuentas_bancarias?.banco}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(op.created_at).toLocaleString("es-PE")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Detalle de operación seleccionada */}
            {seleccionada && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Voucher</h3>
                    {seleccionada.voucher_url ? (
                      <img
                        src={seleccionada.voucher_url}
                        alt="Voucher"
                        className="w-full rounded border max-h-80 object-contain bg-gray-100"
                      />
                    ) : (
                      <div className="h-40 rounded border bg-gray-100 flex items-center justify-center text-gray-400">
                        Sin voucher
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 space-y-2 text-sm">
                    <h3 className="font-semibold mb-2">
                      Datos de la operación
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-500">Código</span>
                        <p className="font-mono">{seleccionada.codigo}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">
                          N° operación voucher
                        </span>
                        <p>{seleccionada.numero_op_voucher || "—"}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Fecha voucher</span>
                        <p>{seleccionada.fecha_voucher || "—"}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Tarjeta</span>
                        <p>
                          {seleccionada.tarjetas?.banco} ••••{" "}
                          {seleccionada.tarjetas?.ultimos_4}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Monto bruto</span>
                        <p className="font-bold">
                          S/ {seleccionada.monto_bruto?.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">
                          Comisión ({seleccionada.tasa_comision}%)
                        </span>
                        <p>S/ {seleccionada.monto_comision?.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Monto neto</span>
                        <p className="font-bold text-green-700">
                          S/ {seleccionada.monto_neto?.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Cuenta destino</span>
                        <p>{seleccionada.cuentas_bancarias?.banco}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {filtro === "pendiente_verificacion" && (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <Button
                        onClick={() => aprobarOperacion(seleccionada)}
                        disabled={accion !== null}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {accion === "aprobando"
                          ? "Aprobando..."
                          : "Aprobar operación"}
                      </Button>

                      <div className="border-t pt-3 space-y-2">
                        <Textarea
                          placeholder="Motivo de observación..."
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                        />
                        <Button
                          onClick={() => observarOperacion(seleccionada)}
                          disabled={accion !== null}
                          variant="outline"
                          className="w-full border-red-300 text-red-600 hover:bg-red-50"
                        >
                          {accion === "observando"
                            ? "Observando..."
                            : "Observar operación"}
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
    </div>
  );
}
