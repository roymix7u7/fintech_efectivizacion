"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login, inicioDe } from "@/lib/auth";
import { Aviso } from "@/components/marca";
import { Flecha, Ojo, Candado } from "@/components/shell";
import { Campo } from "@/components/piezas";
import { BotonAccion } from "@/components/carga";
import { mostrarCarga, ocultarCarga } from "@/components/pantallaCarga";

const CORREO = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const errores = {
    email: !email.trim() ? "Escribe tu correo." : !CORREO.test(email.trim()) ? "Ese correo no tiene un formato válido." : null,
    password: !password ? "Escribe tu contraseña." : null,
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setTocado(true);
    setError("");
    if (errores.email || errores.password) return;
    setLoading(true);
    mostrarCarga("Entrando al panel…");
    try {
      const { rol } = await login(email, password);
      router.push(inicioDe(rol));
    } catch (err) {
      ocultarCarga();
      setError(/invalid login credentials/i.test(err.message) ? "Correo o contraseña incorrectos." : err.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-card">
      {/* Panel de marca. Se oculta en pantallas pequeñas para que el
          formulario ocupe todo el ancho disponible. */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-marca-900 p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-24 h-[420px] w-[420px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(232,184,0,0.18) 0%, rgba(232,184,0,0) 68%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(47,86,176,0.45) 0%, rgba(47,86,176,0) 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <Image src="/logo.png" alt="" width={46} height={46} priority className="object-contain" />
          <div className="leading-tight">
            <p className="font-heading text-md font-bold tracking-[0.14em] text-oro-500">ALTOQUE PERÚ</p>
            <p className="text-xs font-semibold tracking-[0.22em] text-white/50">PANEL INTERNO</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-heading text-3xl font-semibold leading-tight text-white">
            Cada comprobante,
            <br />
            revisado por una persona.
          </h2>
          <p className="mt-4 text-md leading-relaxed text-white/60">
            Aquí se verifica la identidad de cada cliente, se aprueban sus tarjetas, se revisan sus solicitudes y se les paga.
          </p>
        </div>

        <p className="relative flex items-center gap-2 text-chico text-white/45">
          <Candado className="h-4 w-4" />
          Acceso restringido al personal autorizado. Toda acción queda registrada en auditoría.
        </p>
      </div>

      {/* Formulario */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-12 lg:bg-card">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {/* El logo tiene letras blancas: sobre el fondo claro va en su recuadro oscuro. */}
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marca-900">
              <Image src="/logo.png" alt="" width={32} height={32} priority className="object-contain" />
            </span>
            <p className="font-heading text-md font-bold tracking-[0.12em] text-marca-700">ALTOQUE PERÚ</p>
          </div>

          <h1 className="font-heading text-2xl font-semibold text-foreground">Panel administrativo</h1>
          <p className="mt-1.5 text-md text-muted-foreground">Ingresa con tu cuenta del equipo.</p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
            <Campo etiqueta="Correo electrónico" htmlFor="email" error={tocado ? errores.email : null}>
              <input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={tocado && Boolean(errores.email)}
                placeholder="nombre@altoqueperu.com"
                className="campo h-11"
              />
            </Campo>

            <Campo etiqueta="Contraseña" htmlFor="password" error={tocado ? errores.password : null}>
              <div className="relative">
                <input
                  id="password"
                  type={verClave ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={tocado && Boolean(errores.password)}
                  placeholder="••••••••"
                  className="campo h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition hover:bg-muted"
                >
                  <span className="relative block">
                    <Ojo className="h-[18px] w-[18px]" />
                    {verClave && <span className="absolute left-1/2 top-1/2 h-[2px] w-5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-current" />}
                  </span>
                </button>
              </div>
            </Campo>

            {error && <Aviso>{error}</Aviso>}

            <BotonAccion type="submit" cargando={loading} tamano="grande" className="w-full">
              {loading ? "Ingresando..." : "Ingresar"}
              {!loading && <Flecha className="h-4 w-4" />}
            </BotonAccion>
          </form>

          <p className="mt-8 text-chico leading-relaxed text-muted-foreground">
            ¿Eres cliente? Esta pantalla es solo para el personal. Usa la app móvil de AlToque Perú para tus operaciones.
          </p>
        </div>
      </div>
    </div>
  );
}
