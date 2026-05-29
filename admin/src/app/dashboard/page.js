"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    kycPendientes: 0,
    porVerificar: 0,
    porDepositar: 0,
    depositadasHoy: 0,
  });
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) {
        router.push("/login");
      } else {
        setSession(s);
        cargarStats();
      }
      setLoading(false);
    });
  }, [router]);

  async function cargarStats() {
    const { count: kycPendientes } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("rol", "cliente")
      .eq("estado", "pendiente");

    const { count: porVerificar } = await supabase
      .from("operaciones")
      .select("*", { count: "exact", head: true })
      .eq("estado", "pendiente_verificacion");

    const { count: porDepositar } = await supabase
      .from("operaciones")
      .select("*", { count: "exact", head: true })
      .eq("estado", "pendiente_deposito");

    const hoy = new Date().toISOString().split("T")[0];
    const { count: depositadasHoy } = await supabase
      .from("operaciones")
      .select("*", { count: "exact", head: true })
      .eq("estado", "depositado")
      .gte("fecha_deposito", hoy);

    setStats({
      kycPendientes: kycPendientes || 0,
      porVerificar: porVerificar || 0,
      porDepositar: porDepositar || 0,
      depositadasHoy: depositadasHoy || 0,
    });
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Cargando...
      </div>
    );
  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Panel Administrativo</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {session.user.email} —{" "}
            <span className="font-medium uppercase">{session.rol}</span>
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        </div>
      </nav>

      <main className="p-6 max-w-6xl mx-auto">
        <h2 className="text-2xl font-semibold mb-6">Dashboard</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card
            className="cursor-pointer hover:border-gray-300"
            onClick={() => router.push("/kyc")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">
                KYC Pendientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.kycPendientes}</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-gray-300"
            onClick={() => router.push("/verificacion")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">
                Op. por verificar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.porVerificar}</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-gray-300"
            onClick={() => router.push("/tesoreria")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">
                Op. por depositar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.porDepositar}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">
                Depositadas hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.depositadasHoy}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:border-gray-300"
            onClick={() => router.push("/kyc")}
          >
            <CardContent className="p-6">
              <h3 className="font-semibold mb-1">Gestión KYC</h3>
              <p className="text-sm text-gray-500">
                Revisar y aprobar clientes pendientes
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-gray-300"
            onClick={() => router.push("/verificacion")}
          >
            <CardContent className="p-6">
              <h3 className="font-semibold mb-1">
                Verificación de operaciones
              </h3>
              <p className="text-sm text-gray-500">
                Revisar vouchers y aprobar operaciones
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-gray-300"
            onClick={() => router.push("/tesoreria")}
          >
            <CardContent className="p-6">
              <h3 className="font-semibold mb-1">Tesorería</h3>
              <p className="text-sm text-gray-500">
                Realizar depósitos y marcar completados
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-gray-300"
            onClick={() => router.push("/alertas")}
          >
            <CardContent className="p-6">
              <h3 className="font-semibold mb-1">Alertas globales</h3>
              <p className="text-sm text-gray-500">
                Crear y gestionar alertas para clientes
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
