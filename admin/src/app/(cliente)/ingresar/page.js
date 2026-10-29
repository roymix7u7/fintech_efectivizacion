"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  supabaseCliente,
  marcarInicioSesion,
  tiempoRestante,
  motivoDelBloqueo,
  mensajeError,
} from "@/lib/cliente";
import { validarEmail } from "@/lib/validacionesCliente";
import {
  Encabezado,
  Marco,
  Campo,
  CampoClave,
  Boton,
  Aviso,
  Cargando,
} from "@/components/cliente/piezas";

/**
 * Ingreso de clientes. Las mismas comprobaciones que la app
 * (app/app/login.js): la cuenta tiene que ser de cliente, una cuenta
 * bloqueada muestra su motivo y una sin fila en users se repara.
 */
export default function IngresarPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <Ingresar />
    </Suspense>
  );
}

function Ingresar() {
  const sb = supabaseCliente();
  const router = useRouter();
  const expirada = useSearchParams().get("expirada") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState(
    expirada
      ? {
          tono: "info",
          texto:
            "Tu sesión terminó por seguridad (dura 2 horas). Ingresa de nuevo.",
        }
      : null,
  );
  const [bloqueo, setBloqueo] = useState(null);

  // Con una sesión vigente, directo a Mi cuenta.
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session && tiempoRestante() > 0) router.replace("/cuenta");
    });
  }, [sb, router]);

  async function ingresar(e) {
    e.preventDefault();
    setAviso(null);
    const errorEmail = validarEmail(email);
    if (errorEmail) return setAviso({ tono: "atencion", texto: errorEmail });
    if (!password)
      return setAviso({ tono: "atencion", texto: "Ingresa tu contraseña." });

    setCargando(true);
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        // Creó la cuenta pero nunca escribió el código: se le ofrece
        // terminar el registro en vez de dejarlo sin salida.
        if (/Email not confirmed/i.test(error.message || "")) {
          const correo = email.trim().toLowerCase();
          return setAviso({
            tono: "atencion",
            texto: (
              <>
                Tu correo aún no está verificado: tu registro quedó a medias.{" "}
                <Link
                  href={`/registro?correo=${encodeURIComponent(correo)}`}
                  className="font-semibold underline"
                >
                  Terminar mi registro
                </Link>{" "}
                (te enviaremos un código nuevo).
              </>
            ),
          });
        }
        return setAviso({ tono: "error", texto: mensajeError(error) });
      }

      const { data: userData, error: userError } = await sb
        .from("users")
        .select("rol, estado")
        .eq("id", data.user.id)
        .maybeSingle();
      if (userError) {
        await sb.auth.signOut();
        return setAviso({ tono: "error", texto: mensajeError(userError) });
      }

      // Registro interrumpido antes de crear la fila en users.
      if (!userData) {
        const { error: repararError } = await sb.from("users").insert({
          id: data.user.id,
          email: data.user.email,
          rol: "cliente",
          estado: "pendiente",
        });
        if (repararError) {
          await sb.auth.signOut();
          return setAviso({
            tono: "error",
            texto: "Tu registro quedó incompleto. Escríbenos para activarlo.",
          });
        }
        marcarInicioSesion();
        return router.replace("/cuenta");
      }

      if (userData.rol !== "cliente") {
        await sb.auth.signOut();
        return setAviso({
          tono: "atencion",
          texto: (
            <>
              Esta cuenta es del equipo. Entra por el{" "}
              <Link href="/login" className="font-semibold underline">
                acceso del equipo
              </Link>
              .
            </>
          ),
        });
      }

      if (userData.estado === "bloqueado") {
        // El motivo se lee con la sesión abierta: después ya no se ve.
        const motivo = await motivoDelBloqueo(data.user.id);
        await sb.auth.signOut();
        return setBloqueo({ motivo });
      }

      marcarInicioSesion();
      router.replace("/cuenta");
    } catch (err) {
      setAviso({ tono: "error", texto: mensajeError(err) });
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <Encabezado
        derecha={
          <Link
            href="/registro"
            className="rounded-full bg-oro-500 px-4 py-2 text-sm font-bold text-marca-900 hover:bg-oro-300"
          >
            Crear cuenta
          </Link>
        }
      />
      <Marco
        titulo="Hola de nuevo."
        subtitulo="Ingresa con el correo y la contraseña de tu cuenta. Es la misma de la app."
      >
        {bloqueo ? (
          <div className="space-y-5">
            <Aviso tono="error">
              <strong className="block">Tu cuenta está bloqueada.</strong>
              {bloqueo.motivo
                ? `Motivo: ${bloqueo.motivo}`
                : "Escríbenos para conocer el motivo."}
            </Aviso>
            <Boton
              tono="neutro"
              className="w-full"
              onClick={() => setBloqueo(null)}
            >
              Entendido
            </Boton>
          </div>
        ) : (
          <form onSubmit={ingresar} noValidate className="space-y-4">
            <Aviso tono={aviso?.tono} onCerrar={() => setAviso(null)}>
              {aviso?.texto}
            </Aviso>
            <Campo
              id="email"
              etiqueta="Correo"
              type="email"
              autoComplete="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <CampoClave
              id="password"
              etiqueta="Contraseña"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex justify-end">
              <Link
                href="/recuperar"
                className="text-sm font-semibold text-marca-700 underline underline-offset-4 hover:text-marca-900"
              >
                Olvidé mi contraseña
              </Link>
            </div>
            <Boton type="submit" cargando={cargando} className="w-full">
              Ingresar
            </Boton>
            <p className="pt-2 text-center text-sm text-[#4F5B74]">
              ¿Aún no tienes cuenta?{" "}
              <Link
                href="/registro"
                className="font-semibold text-marca-900 underline underline-offset-4"
              >
                Créala aquí
              </Link>
            </p>
          </form>
        )}
      </Marco>
    </>
  );
}
