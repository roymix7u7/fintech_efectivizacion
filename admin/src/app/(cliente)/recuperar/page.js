"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseCliente, mensajeError, verificarRegistro } from "@/lib/cliente";
import {
  validarEmail,
  validarPassword,
  reglasPassword,
} from "@/lib/validacionesCliente";
import {
  Encabezado,
  Marco,
  Campo,
  CampoClave,
  ReglasClave,
  CodigoSeis,
  Boton,
  Aviso,
} from "@/components/cliente/piezas";
import {
  ESCENA_RECUPERAR,
  ESCENA_RECUPERADA,
} from "@/components/cliente/escenas";

/**
 * Recuperar la contraseña, igual que la app (app/app/recuperar.js):
 * correo → código de 6 dígitos → contraseña nueva. Al terminar se cierra
 * la sesión de recuperación y se ingresa con la nueva.
 */
const PASOS = ["Tu correo", "Código", "Nueva contraseña"];

export default function RecuperarPage() {
  const sb = supabaseCliente();
  const [paso, setPaso] = useState(1);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoError, setCodigoError] = useState("");
  const [clave, setClave] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [intentos, setIntentos] = useState(0);
  const [espera, setEspera] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [listo, setListo] = useState(false);
  const verificando = useRef(false);
  // Si se verifica el código y la persona se va sin guardar, la sesión
  // de recuperación no puede quedar abierta.
  const sesionAbierta = useRef(false);

  useEffect(
    () => () => {
      if (sesionAbierta.current) sb.auth.signOut().catch(() => {});
    },
    [sb],
  );

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const correo = email.trim().toLowerCase();
  const errorEmail = validarEmail(email);
  const reglas = reglasPassword(clave, confirmar);
  const errorClave = validarPassword(clave, confirmar);

  async function enviarCodigo(e) {
    e?.preventDefault();
    setAviso(null);
    if (errorEmail) return setIntentos((n) => n + 1);
    setCargando(true);
    try {
      // Solo se envía el código a correos con cuenta: si no, el cliente se
      // queda esperando un correo que nunca llega. (El registro ya responde
      // lo mismo con verificar_registro: no se revela nada nuevo.) Si la
      // consulta falla (null), se sigue como antes.
      const registro = await verificarRegistro({ email: correo });
      if (registro?.email === false) {
        setPaso(1);
        return setAviso({
          tono: "error",
          texto: (
            <>
              No hay ninguna cuenta con <strong className="break-all">{correo}</strong>. Revisa que sea el
              mismo correo con el que te registraste.{" "}
              <Link href="/registro" className="font-semibold underline">
                ¿Aún no tienes cuenta? Regístrate
              </Link>
            </>
          ),
        });
      }
      const { error } = await sb.auth.resetPasswordForEmail(correo);
      if (error) return setAviso({ tono: "error", texto: mensajeError(error) });
      setCodigo("");
      setIntentos(0);
      setEspera(60);
      setPaso(2);
    } catch (err) {
      setAviso({ tono: "error", texto: mensajeError(err) });
    } finally {
      setCargando(false);
    }
  }

  async function verificar(token) {
    if (verificando.current) return;
    verificando.current = true;
    setCargando(true);
    setCodigoError("");
    try {
      const { error } = await sb.auth.verifyOtp({
        email: correo,
        token,
        type: "recovery",
      });
      if (error) {
        setCodigo("");
        return setCodigoError("El código es incorrecto o ya expiró.");
      }
      sesionAbierta.current = true;
      setAviso(null);
      setPaso(3);
    } finally {
      verificando.current = false;
      setCargando(false);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    setAviso(null);
    if (errorClave) return setIntentos((n) => n + 1);
    setCargando(true);
    try {
      const { error } = await sb.auth.updateUser({ password: clave });
      if (error) return setAviso({ tono: "error", texto: mensajeError(error) });
      await sb.auth.signOut();
      sesionAbierta.current = false;
      setListo(true);
    } catch (err) {
      setAviso({ tono: "error", texto: mensajeError(err) });
    } finally {
      setCargando(false);
    }
  }

  async function empezarDeNuevo() {
    if (sesionAbierta.current) await sb.auth.signOut().catch(() => {});
    sesionAbierta.current = false;
    setCodigo("");
    setClave("");
    setConfirmar("");
    setAviso(null);
    setPaso(1);
  }

  const derecha = (
    <Link
      href="/ingresar"
      className="rounded-full px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10"
    >
      Ingresar
    </Link>
  );

  if (listo)
    return (
      <>
        <Encabezado derecha={derecha} />
        <Marco
          escena={ESCENA_RECUPERADA}
          titulo="Contraseña actualizada"
          subtitulo="Ya puedes ingresar con tu contraseña nueva, aquí o en la app."
        >
          <Link
            href="/ingresar"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-marca-900 font-semibold text-white hover:bg-marca-700"
          >
            Ingresar
          </Link>
        </Marco>
      </>
    );

  return (
    <>
      <Encabezado derecha={derecha} />

      {paso === 1 && (
        <Marco
          titulo="Recupera tu acceso"
          subtitulo="Te enviaremos un código a tu correo."
          paso={1}
          pasos={PASOS}
          escena={ESCENA_RECUPERAR}
        >
          <form onSubmit={enviarCodigo} noValidate className="space-y-5">
            <Aviso tono={aviso?.tono} onCerrar={() => setAviso(null)}>
              {aviso?.texto}
            </Aviso>
            <Campo
              id="email"
              etiqueta="Correo de tu cuenta"
              type="email"
              autoComplete="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={intentos > 0 || email.length > 3 ? errorEmail : null}
              ok={!errorEmail}
            />
            <Boton type="submit" cargando={cargando} className="w-full">
              Enviar código
            </Boton>
          </form>
        </Marco>
      )}

      {paso === 2 && (
        <Marco
          titulo="Revisa tu correo"
          subtitulo={`Te enviamos un código de 6 dígitos a ${correo}. Si no lo ves en unos minutos, revisa la carpeta de spam o promociones.`}
          paso={2}
          pasos={PASOS}
          escena={ESCENA_RECUPERAR}
        >
          <Aviso tono={aviso?.tono} onCerrar={() => setAviso(null)}>
            {aviso?.texto}
          </Aviso>
          <CodigoSeis
            valor={codigo}
            deshabilitado={cargando}
            error={codigoError}
            onCambio={(v) => {
              setCodigo(v);
              setCodigoError("");
              if (v.length === 6) verificar(v);
            }}
          />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Boton type="button" tono="enlace" onClick={empezarDeNuevo}>
              Cambiar correo
            </Boton>
            <Boton
              type="button"
              tono="enlace"
              disabled={espera > 0 || cargando}
              onClick={() => enviarCodigo()}
            >
              {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar código"}
            </Boton>
          </div>
        </Marco>
      )}

      {paso === 3 && (
        <Marco
          titulo="Nueva contraseña"
          subtitulo="Crea una que no hayas usado antes."
          paso={3}
          pasos={PASOS}
          escena={ESCENA_RECUPERAR}
        >
          <form onSubmit={guardar} noValidate className="space-y-5">
            <Aviso tono={aviso?.tono} onCerrar={() => setAviso(null)}>
              {aviso?.texto}
            </Aviso>
            <div>
              <CampoClave
                id="clave"
                etiqueta="Contraseña nueva"
                autoComplete="new-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
              />
              <ReglasClave reglas={reglas} />
            </div>
            <CampoClave
              id="confirmar"
              etiqueta="Confirmar contraseña"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              error={
                (intentos > 0 || confirmar.length > 0) && !reglas.match
                  ? "Las contraseñas no coinciden."
                  : null
              }
              ok={reglas.match}
            />
            {intentos > 0 && errorClave && reglas.match && (
              <p role="alert" className="text-chico font-medium text-red-600">
                {errorClave}
              </p>
            )}
            <Boton type="submit" cargando={cargando} className="w-full">
              Guardar contraseña
            </Boton>
            <Boton
              type="button"
              tono="enlace"
              className="w-full"
              onClick={empezarDeNuevo}
            >
              Cancelar y empezar de nuevo
            </Boton>
          </form>
        </Marco>
      )}
    </>
  );
}
