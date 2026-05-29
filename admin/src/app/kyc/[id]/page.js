"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function KYCDetallePage() {
  const [session, setSession] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [tasa, setTasa] = useState("1.00");
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargarCliente();
    });
  }, [router, params.id]);

  async function cargarCliente() {
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", params.id)
      .single();

    if (!user) return router.push("/kyc");
    setCliente(user);

    const { data: perfilData } = await supabase
      .from("perfiles_cliente")
      .select("*")
      .eq("user_id", params.id)
      .single();

    setPerfil(perfilData);
    if (perfilData?.tasa_comision) setTasa(String(perfilData.tasa_comision));
    setLoading(false);
  }

  async function aprobar() {
    setAccion("aprobando");

    // Actualizar estado del usuario
    await supabase
      .from("users")
      .update({ estado: "activo" })
      .eq("id", params.id);

    // Actualizar perfil con validador y tasa
    if (perfil) {
      await supabase
        .from("perfiles_cliente")
        .update({
          validado_por: session.user.id,
          fecha_validacion: new Date().toISOString(),
          tasa_comision: parseFloat(tasa),
        })
        .eq("user_id", params.id);
    }

    // Registrar en auditoría
    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "APROBAR_KYC",
      entidad: "perfiles_cliente",
      entidad_id: perfil?.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "activo", tasa_comision: tasa },
    });

    alert("Cliente aprobado correctamente.");
    router.push("/kyc");
  }

  async function observar() {
    if (!motivo.trim()) return alert("Ingresa un motivo de observación.");
    setAccion("observando");

    await supabase
      .from("users")
      .update({ estado: "observado" })
      .eq("id", params.id);

    if (perfil) {
      await supabase
        .from("perfiles_cliente")
        .update({ motivo_observacion: motivo })
        .eq("user_id", params.id);
    }

    await supabase.from("observaciones").insert({
      entidad: "perfiles_cliente",
      entidad_id: perfil?.id,
      motivo,
      creado_por: session.user.id,
    });

    await supabase.from("auditoria_logs").insert({
      usuario_id: session.user.id,
      accion: "OBSERVAR_KYC",
      entidad: "perfiles_cliente",
      entidad_id: perfil?.id,
      datos_antes: { estado: "pendiente" },
      datos_despues: { estado: "observado", motivo },
    });

    alert("Cliente observado. Se notificará al cliente.");
    router.push("/kyc");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Cargando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/kyc")}
          className="text-gray-500 hover:text-gray-700"
        >
          ← Volver
        </button>
        <h1 className="text-lg font-semibold">Detalle KYC</h1>
      </nav>

      <main className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Datos personales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos personales</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Nombres</span>
              <p className="font-medium">{perfil?.nombres || "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">Apellidos</span>
              <p className="font-medium">{perfil?.apellidos || "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">Email</span>
              <p className="font-medium">{cliente?.email}</p>
            </div>
            <div>
              <span className="text-gray-500">Teléfono</span>
              <p className="font-medium">{perfil?.telefono || "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">DNI (encriptado)</span>
              <p className="font-medium">{perfil?.dni ? "••••••••" : "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">Dirección</span>
              <p className="font-medium">{perfil?.direccion || "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">Código promo</span>
              <p className="font-medium">{perfil?.codigo_promo || "Ninguno"}</p>
            </div>
            <div>
              <span className="text-gray-500">Estado actual</span>
              <p className="font-medium">{cliente?.estado}</p>
            </div>
          </CardContent>
        </Card>

        {/* Fotos KYC */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documentos de identidad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-2">DNI Frontal</p>
                {perfil?.foto_dni_frontal ? (
                  <img
                    src={perfil.foto_dni_frontal}
                    alt="DNI Frontal"
                    className="rounded border w-full h-40 object-cover"
                  />
                ) : (
                  <div className="rounded border h-40 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                    Sin foto
                  </div>
                )}
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-2">DNI Posterior</p>
                {perfil?.foto_dni_posterior ? (
                  <img
                    src={perfil.foto_dni_posterior}
                    alt="DNI Posterior"
                    className="rounded border w-full h-40 object-cover"
                  />
                ) : (
                  <div className="rounded border h-40 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                    Sin foto
                  </div>
                )}
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-2">Selfie con DNI</p>
                {perfil?.foto_selfie ? (
                  <img
                    src={perfil.foto_selfie}
                    alt="Selfie"
                    className="rounded border w-full h-40 object-cover"
                  />
                ) : (
                  <div className="rounded border h-40 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                    Sin foto
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Acciones — solo si está pendiente u observado */}
        {(cliente?.estado === "pendiente" ||
          cliente?.estado === "observado") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tasa de comisión (%)</Label>
                <select
                  value={tasa}
                  onChange={(e) => setTasa(e.target.value)}
                  className="w-full border rounded-md p-2 text-sm"
                >
                  <option value="1.00">1.00% — Cliente nuevo estándar</option>
                  <option value="0.50">0.50% — Cliente frecuente</option>
                  <option value="0.35">
                    0.35% — Cliente VIP / alto volumen
                  </option>
                </select>
              </div>

              <Button
                onClick={aprobar}
                disabled={accion !== null}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {accion === "aprobando" ? "Aprobando..." : "Aprobar cliente"}
              </Button>

              <div className="border-t pt-4 space-y-2">
                <Label>Motivo de observación</Label>
                <Textarea
                  placeholder="Escribe el motivo por el cual se observa este cliente..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <Button
                  onClick={observar}
                  disabled={accion !== null}
                  variant="outline"
                  className="w-full border-red-300 text-red-600 hover:bg-red-50"
                >
                  {accion === "observando"
                    ? "Observando..."
                    : "Observar cliente"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
