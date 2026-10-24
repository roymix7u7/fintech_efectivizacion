"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { clientePublico, EMPRESA } from "@/lib/supabasePublico";

/**
 * Pedir la eliminación de la cuenta desde la web, sin la app.
 *
 * Google Play exige esta página aparte de la opción dentro de la app,
 * para quien ya la desinstaló. Para saber que es el titular, entra con
 * su correo y contraseña; el pedido cae en la misma cola del panel
 * (Pedidos de datos) que el hecho desde la app.
 */
const SE_BORRA = [
  "Las fotos de tu documento, tu selfie y tus tarjetas",
  "Tus datos personales: nombre, documento, celular y dirección",
  "Tu acceso: ya no podrás entrar con tu correo",
];
const SE_CONSERVA = [
  "El registro de tus operaciones y sus comprobantes, por el tiempo que exige la ley",
  "La constancia de los documentos que aceptaste",
];

const fecha = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }) : "";

export default function EliminarCuentaPage() {
  // Un solo cliente mientras dura la página: la sesión vive en memoria.
  const cliente = useRef(null);
  if (!cliente.current) cliente.current = clientePublico();
  const sb = cliente.current;

  const [paso, setPaso] = useState("entrar"); // entrar | confirmar | listo
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [motivo, setMotivo] = useState("");
  const [entiendo, setEntiendo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [vence, setVence] = useState(null);
  const [yaPedida, setYaPedida] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const { data, error: eAuth } = await sb.auth.signInWithPassword({
      email: correo.trim().toLowerCase(),
      password: clave,
    });
    if (eAuth || !data?.user) {
      setCargando(false);
      return setError("Correo o contraseña incorrectos.");
    }
    const { data: u } = await sb.from("users").select("rol").eq("id", data.user.id).maybeSingle();
    setCargando(false);
    if (u?.rol !== "cliente") {
      await sb.auth.signOut();
      return setError("Esta página es para clientes de la app AlToque.");
    }
    setClave("");
    setPaso("confirmar");
  }

  async function pedir() {
    setError("");
    setCargando(true);
    const { data, error: e } = await sb.rpc("solicitar_eliminacion", { p_motivo: motivo.trim() || null });
    setCargando(false);
    if (e) return setError(e.message);
    setYaPedida(data?.ok === false);
    setVence(data?.vence_en || null);
    await sb.auth.signOut();
    setPaso("listo");
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">Eliminar mi cuenta</h1>
        <p className="mt-2 text-slate-600">
          Puedes pedirlo también desde la app, en Mi cuenta → Mis datos. Te responderemos en un plazo de 10 días
          hábiles.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-red-50 p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-red-700">Qué se borra</p>
            <ul className="mt-2 space-y-1.5 text-[14px] text-slate-800">
              {SE_BORRA.map((t) => (
                <li key={t}>• {t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-800">Qué se conserva</p>
            <ul className="mt-2 space-y-1.5 text-[14px] text-slate-800">
              {SE_CONSERVA.map((t) => (
                <li key={t}>• {t}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-slate-500">
          Si tienes una solicitud en curso, primero la terminamos (y te pagamos), y luego eliminamos tu cuenta.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-700">{error}</p>}

        {paso === "entrar" && (
          <form onSubmit={entrar} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Confirma que eres tú</h2>
              <p className="text-[14px] text-slate-600">Entra con el correo y la contraseña de tu cuenta.</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium">Correo</span>
              <input
                id="correo"
                type="email"
                required
                autoComplete="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1B2A4A] focus:ring-4 focus:ring-[#1B2A4A]/10"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium">Contraseña</span>
              <input
                id="clave"
                type="password"
                required
                autoComplete="current-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1B2A4A] focus:ring-4 focus:ring-[#1B2A4A]/10"
              />
            </label>
            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-xl bg-[#1B2A4A] px-4 py-3 font-semibold text-white hover:bg-[#0F1B33] disabled:opacity-50"
            >
              {cargando ? "Verificando..." : "Continuar"}
            </button>
            <p className="text-[13px] text-slate-500">
              ¿Olvidaste tu contraseña? Recupérala desde la app, o escríbenos a{" "}
              <a className="font-medium text-[#1B2A4A] underline" href={`mailto:${EMPRESA.correo}?subject=Eliminar mi cuenta`}>
                {EMPRESA.correo}
              </a>{" "}
              desde el correo con el que te registraste.
            </p>
          </form>
        )}

        {paso === "confirmar" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">¿Eliminar tu cuenta?</h2>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium">¿Nos cuentas por qué? (opcional)</span>
              <textarea
                id="motivo"
                rows={3}
                maxLength={500}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1B2A4A]"
              />
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-[14px]">
              <input
                id="entiendo"
                type="checkbox"
                checked={entiendo}
                onChange={(e) => setEntiendo(e.target.checked)}
                className="mt-1"
              />
              Entiendo que mi cuenta y mis fotos se borrarán y que no se puede deshacer.
            </label>
            <button
              onClick={pedir}
              disabled={!entiendo || cargando}
              className="w-full rounded-xl bg-red-600 px-4 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {cargando ? "Enviando..." : "Pedir eliminación"}
            </button>
          </div>
        )}

        {paso === "listo" && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{yaPedida ? "Ya tenías un pedido abierto" : "Recibimos tu pedido"}</h2>
            <p className="text-slate-600">
              {vence ? `Te responderemos a más tardar el ${fecha(vence)}. ` : ""}
              Mientras tanto puedes cancelarlo desde la app, en Mi cuenta → Mis datos.
            </p>
            <Link href="/privacidad" className="inline-block pt-2 text-[14px] font-medium text-[#1B2A4A] underline">
              Ver la política de privacidad
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
