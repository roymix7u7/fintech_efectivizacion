"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login } from "@/lib/auth";
import { Aviso } from "@/components/marca";
import { Flecha } from "@/components/shell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { rol } = await login(email, password);
      // Los roles verificador y tesoreria correspondian al flujo de
      // operaciones con montos, que ya no existe.
      router.push(rol === "gestor" ? "/kyc" : "/dashboard");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel de marca. Se oculta en pantallas pequeñas para que el
          formulario ocupe todo el ancho disponible. */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-marca-900 p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-24 h-[420px] w-[420px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(232,184,0,0.16) 0%, rgba(232,184,0,0) 68%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(44,66,112,0.5) 0%, rgba(44,66,112,0) 70%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <Image
            src="/logo.png"
            alt=""
            width={44}
            height={44}
            priority
            className="object-contain"
          />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-[0.16em] text-oro-500">
              ALTOQUE PERÚ
            </p>
            <p className="text-[11px] tracking-[0.24em] text-white/45">
              WK
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[32px] font-semibold leading-[1.2] text-white">
            Cada comprobante,
            <br />
            revisado por una persona.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/55">
            Este panel es donde se verifica la identidad de cada cliente, se
            aprueban sus tarjetas y se resuelven las solicitudes que llegan
            desde la app.
          </p>
        </div>

        <p className="relative text-[12px] text-white/35">
          Acceso restringido al personal autorizado. Toda acción queda
          registrada en auditoría.
        </p>
      </div>

      {/* Formulario */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              priority
              className="object-contain"
            />
            <p className="text-sm font-bold tracking-[0.14em] text-marca-700">
              ALTOQUE PERÚ
            </p>
          </div>

          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            Panel administrativo
          </h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Ingresa con tu cuenta de staff para continuar.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[13px] font-medium text-foreground"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nombre@altoqueperu.com"
                className="w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-foreground"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={verClave ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-input bg-card px-3.5 py-2.5 pr-11 text-sm outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                />
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  aria-label={
                    verClave ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition hover:bg-muted"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    className="h-4 w-4"
                  >
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                    {verClave && <path d="M3 3l18 18" />}
                  </svg>
                </button>
              </div>
            </div>

            {error && <Aviso>{error}</Aviso>}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-marca-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-marca-600 disabled:opacity-60"
            >
              {loading ? "Ingresando..." : "Ingresar"}
              {!loading && <Flecha className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-8 text-[12px] leading-relaxed text-muted-foreground">
            ¿Eres cliente? Esta pantalla es solo para el personal. Usa la app
            móvil de AlToque Perú para gestionar tus operaciones.
          </p>
        </div>
      </div>
    </div>
  );
}
