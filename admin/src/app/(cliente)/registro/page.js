"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PERU_DATA from "@/lib/ubigeo";
import { cn } from "@/lib/utils";
import {
  supabaseCliente,
  marcarInicioSesion,
  documentosVigentes,
  aceptarDocumentos,
  subirFotosIdentidad,
  mensajeError,
  verificarRegistro,
} from "@/lib/cliente";
import {
  validarEmail,
  validarDocumento,
  largoDocumento,
  validarTelefono,
  validarNombre,
  validarPassword,
  reglasPassword,
  errorDeDigitos,
} from "@/lib/validacionesCliente";
import {
  Encabezado,
  Marco,
  Campo,
  CampoClave,
  ReglasClave,
  CodigoSeis,
  Casilla,
  Boton,
  Aviso,
  Cargando,
} from "@/components/cliente/piezas";
import SubidaFotos, { fotosCompletas } from "@/components/cliente/fotos";

/**
 * Registro de clientes desde la web. Los mismos tres pasos y las mismas
 * reglas que la app (app/app/registro.js):
 *   1. Datos, contraseña y consentimientos.
 *   2. Código de 6 dígitos enviado al correo (crea la fila en users y
 *      registra lo aceptado).
 *   3. Fotos del documento y selfie (crea el perfil en revisión).
 *
 * Si quien entra ya tiene sesión pero no terminó (cerró la página tras
 * verificar el correo), se retoma en "completar": sin pedir correo ni
 * contraseña otra vez.
 */
const PASOS = ["Tus datos", "Tu correo", "Tu identidad"];

const VACIO = {
  tipo_documento: "dni",
  nombres: "",
  apellidos: "",
  dni: "",
  telefono: "",
  departamento: "",
  provincia: "",
  distrito: "",
  direccion: "",
  email: "",
  password: "",
  confirmar: "",
  codigo_promo: "",
};

/**
 * Borrador del paso 1 en esta pestaña (sessionStorage: se borra al
 * cerrarla). Nunca la contraseña. Así, si la página se recarga a mitad
 * del registro, no hay que volver a escribir todo.
 */
const BORRADOR = "atk-registro";
const leerBorrador = () => {
  try {
    return JSON.parse(sessionStorage.getItem(BORRADOR) || "null");
  } catch {
    return null;
  }
};
const guardarBorrador = (form) => {
  try {
    // eslint-disable-next-line no-unused-vars
    const { password, confirmar, ...resto } = form;
    sessionStorage.setItem(BORRADOR, JSON.stringify(resto));
  } catch {}
};
const borrarBorrador = () => {
  try {
    sessionStorage.removeItem(BORRADOR);
  } catch {}
};

export default function RegistroPage() {
  const sb = supabaseCliente();
  const router = useRouter();
  const [paso, setPaso] = useState(1);
  const [completar, setCompletar] = useState(false);
  const [revisando, setRevisando] = useState(true);
  const [form, setForm] = useState(VACIO);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaFotos, setAceptaFotos] = useState(false);
  const [aceptaPromos, setAceptaPromos] = useState(false);
  const [promoAbierto, setPromoAbierto] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const [vigentes, setVigentes] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [codigoError, setCodigoError] = useState("");
  const [espera, setEspera] = useState(0);
  const [fotos, setFotos] = useState({
    dni_frontal: null,
    dni_posterior: null,
    selfie: null,
  });
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const verificando = useRef(false);
  // Lo que respondió la base para el último correo / documento escrito:
  // { valor, usado }. Se guarda el valor para no mostrar la respuesta de
  // uno anterior si la persona siguió escribiendo.
  const [yaUsado, setYaUsado] = useState({ email: null, dni: null });

  // ¿Ya hay una cuenta a medio terminar en este navegador?
  useEffect(() => {
    const borrador = leerBorrador();
    // Desde "Ingresar", con un correo que nunca se verificó.
    const correo = new URLSearchParams(window.location.search).get("correo");
    setForm((f) => ({
      ...f,
      ...(borrador || {}),
      ...(correo ? { email: correo } : {}),
    }));
    (async () => {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (session) {
        const { data: perfil } = await sb
          .from("perfiles_cliente")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (perfil) return router.replace("/cuenta");
        setCompletar(true);
        setForm((f) => ({ ...f, email: session.user.email || "" }));
        if (borrador)
          setAviso({
            tono: "info",
            texto:
              "Recuperamos los datos que ya habías escrito. Revísalos y continúa con tus fotos.",
          });
      }
      setRevisando(false);
    })();
    documentosVigentes()
      .then(setVigentes)
      .catch(() => {});
  }, [sb, router]);

  // Cuenta regresiva para volver a pedir el código.
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (!revisando) guardarBorrador(form);
  }, [form, revisando]);

  // ── ¿Ya registrado? Se consulta al terminar de escribir ──
  const emailNormal = form.email.trim().toLowerCase();
  const emailConsultable = !completar && !validarEmail(form.email);
  useEffect(() => {
    if (!emailConsultable) return;
    const t = setTimeout(async () => {
      const r = await verificarRegistro({ email: emailNormal });
      if (r && r.email !== null)
        setYaUsado((y) => ({
          ...y,
          email: { valor: emailNormal, usado: r.email },
        }));
    }, 600);
    return () => clearTimeout(t);
  }, [emailNormal, emailConsultable]);

  const dniConsultable = !validarDocumento(form.tipo_documento, form.dni);
  useEffect(() => {
    if (!dniConsultable) return;
    const t = setTimeout(async () => {
      const r = await verificarRegistro({ dni: form.dni });
      if (r && r.dni !== null)
        setYaUsado((y) => ({ ...y, dni: { valor: form.dni, usado: r.dni } }));
    }, 400);
    return () => clearTimeout(t);
  }, [form.dni, dniConsultable]);

  const emailUsado =
    emailConsultable &&
    yaUsado.email?.valor === emailNormal &&
    yaUsado.email.usado;
  const dniUsado =
    dniConsultable && yaUsado.dni?.valor === form.dni && yaUsado.dni.usado;
  const emailRevisado =
    !emailConsultable || yaUsado.email?.valor === emailNormal;
  const dniRevisado = !dniConsultable || yaUsado.dni?.valor === form.dni;

  // ── Ubigeo (listado oficial del INEI) ──
  const departamentos = Object.keys(PERU_DATA);
  const provincias = form.departamento
    ? Object.keys(PERU_DATA[form.departamento] || {})
    : [];
  const distritos =
    form.departamento && form.provincia
      ? PERU_DATA[form.departamento]?.[form.provincia] || []
      : [];
  const ubigeoValido = Boolean(
    form.departamento &&
    form.provincia &&
    PERU_DATA[form.departamento]?.[form.provincia]?.includes(form.distrito),
  );

  // ── Validación en vivo ──
  const largo = largoDocumento(form.tipo_documento);
  const reglas = reglasPassword(form.password, form.confirmar);
  const errores = {
    nombres: validarNombre(form.nombres, "nombres"),
    apellidos: validarNombre(form.apellidos, "apellidos"),
    dni: dniUsado
      ? `Ese ${form.tipo_documento === "ce" ? "carnet" : "DNI"} ya está registrado en otra cuenta.`
      : errorDeDigitos(form.dni, largo, (v) =>
          validarDocumento(form.tipo_documento, v),
        ),
    telefono: errorDeDigitos(form.telefono, 9, validarTelefono),
    ubicacion: !ubigeoValido
      ? "Elige departamento, provincia y distrito."
      : null,
    direccion:
      form.direccion.trim().length < 5
        ? "Escribe tu dirección (calle y número)."
        : null,
    email: completar
      ? null
      : emailUsado
        ? "Ese correo ya tiene una cuenta."
        : validarEmail(form.email),
    password: completar ? null : validarPassword(form.password, form.password),
    confirmar: completar
      ? null
      : !reglas.match
        ? "Las contraseñas no coinciden."
        : null,
  };
  // Un error se ve al intentar continuar, o mientras se escribe algo que
  // ya se ve mal (igual que en la app).
  const err = (k) => {
    if (!errores[k]) return null;
    if (intentos > 0) return errores[k];
    if (k === "dni" || k === "telefono")
      return form[k].length > 0 ? errores[k] : null;
    if (k === "email") return form.email.length > 3 ? errores.email : null;
    if (k === "confirmar")
      return form.confirmar.length > 0 ? errores.confirmar : null;
    return null;
  };
  const ok = (k) => !errores[k] && String(form[k] || "").length > 0;
  const faltan =
    Object.values(errores).filter(Boolean).length +
    (completar ? 0 : (aceptaTerminos ? 0 : 1) + (aceptaFotos ? 0 : 1));

  // ── Paso 1 → 2: crea la cuenta y envía el código ──
  async function continuar(e) {
    e.preventDefault();
    setAviso(null);
    if (faltan) {
      setIntentos((n) => n + 1);
      setAviso({
        tono: "atencion",
        texto: "Revisa los campos marcados en rojo.",
      });
      return;
    }
    if (completar) return setPaso(3);

    setCargando(true);
    try {
      if (!vigentes?.length) setVigentes(await documentosVigentes());
      const { data, error } = await sb.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) {
          return setAviso({
            tono: "atencion",
            texto:
              "Ese correo ya tiene una cuenta. Ingresa o recupera tu contraseña.",
          });
        }
        return setAviso({ tono: "error", texto: mensajeError(error) });
      }
      // Correo ya confirmado: Supabase responde sin identidades.
      if (data.user && data.user.identities?.length === 0) {
        return setAviso({
          tono: "atencion",
          texto:
            "Ese correo ya tiene una cuenta. Ingresa o recupera tu contraseña.",
        });
      }
      setEspera(60);
      setPaso(2);
    } catch (e2) {
      setAviso({ tono: "error", texto: mensajeError(e2) });
    } finally {
      setCargando(false);
    }
  }

  // ── Paso 2: verifica el código y crea la fila en users ──
  async function verificar(token) {
    if (verificando.current) return;
    verificando.current = true;
    setCargando(true);
    setCodigoError("");
    try {
      const { data, error } = await sb.auth.verifyOtp({
        email: form.email.trim().toLowerCase(),
        token,
        type: "signup",
      });
      if (error) {
        setCodigo("");
        return setCodigoError("El código es incorrecto o ya expiró.");
      }
      const uid = data.user?.id;
      const { data: existente } = await sb
        .from("users")
        .select("id")
        .eq("id", uid)
        .maybeSingle();
      if (!existente) {
        const { error: e2 } = await sb.from("users").insert({
          id: uid,
          email: form.email.trim().toLowerCase(),
          rol: "cliente",
          estado: "pendiente",
        });
        if (e2) return setAviso({ tono: "error", texto: mensajeError(e2) });
      }
      // Lo aceptado en el paso 1 queda registrado con su versión exacta.
      try {
        await aceptarDocumentos(
          (vigentes?.length ? vigentes : await documentosVigentes()).map(
            (d) => d.id,
          ),
        );
      } catch {}
      marcarInicioSesion();
      setPaso(3);
    } catch (e3) {
      setAviso({ tono: "error", texto: mensajeError(e3) });
    } finally {
      verificando.current = false;
      setCargando(false);
    }
  }

  // Se equivocó de correo: vuelve al paso 1 con todo lo demás escrito.
  // La cuenta con el correo mal escrito nunca se confirma, así que no
  // queda activa ni bloquea nada.
  function cambiarCorreo() {
    setCodigo("");
    setCodigoError("");
    setEspera(0);
    setPaso(1);
    setAviso({
      tono: "info",
      texto:
        "Corrige tu correo y vuelve a pulsar «Crear cuenta y enviar código». Tus demás datos siguen aquí.",
    });
    setTimeout(() => {
      const campo = document.getElementById("email");
      campo?.scrollIntoView({ behavior: "smooth", block: "center" });
      campo?.focus();
      campo?.select();
    }, 80);
  }

  async function reenviar() {
    setAviso(null);
    const { error } = await sb.auth.resend({
      type: "signup",
      email: form.email.trim().toLowerCase(),
    });
    if (error) return setAviso({ tono: "error", texto: mensajeError(error) });
    setEspera(60);
    setAviso({ tono: "exito", texto: "Te enviamos un código nuevo." });
  }

  // ── Paso 3: fotos y perfil ──
  async function finalizar() {
    if (!fotosCompletas(fotos))
      return setAviso({ tono: "atencion", texto: "Faltan fotos por subir." });
    setCargando(true);
    setAviso(null);
    let paths = null;
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        setAviso({
          tono: "atencion",
          texto: "Tu sesión expiró. Ingresa para terminar tu registro.",
        });
        return router.push("/ingresar");
      }
      paths = await subirFotosIdentidad(user.id, fotos);
      const perfil = {
        user_id: user.id,
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        tipo_documento: form.tipo_documento,
        dni: form.dni,
        telefono: "+51" + form.telefono,
        direccion: [
          form.direccion.trim(),
          form.distrito,
          form.provincia,
          form.departamento,
        ]
          .filter(Boolean)
          .join(", "),
        codigo_promo: form.codigo_promo.trim() || null,
        acepta_promociones: aceptaPromos,
        promociones_actualizado_en: new Date().toISOString(),
        foto_dni_frontal: paths.dni_frontal,
        foto_dni_posterior: paths.dni_posterior,
        foto_selfie: paths.selfie,
      };
      const { data: existente } = await sb
        .from("perfiles_cliente")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const { error } = existente
        ? await sb
            .from("perfiles_cliente")
            .update(perfil)
            .eq("user_id", user.id)
        : await sb.from("perfiles_cliente").insert(perfil);
      if (error) throw error;
      borrarBorrador();
      router.replace("/cuenta?bienvenida=1");
    } catch (e4) {
      if (paths)
        await sb.storage
          .from("kyc-documentos")
          .remove(Object.values(paths))
          .catch(() => {});
      setAviso({ tono: "error", texto: mensajeError(e4) });
    } finally {
      setCargando(false);
    }
  }

  const derecha = (
    <Link
      href="/ingresar"
      className="rounded-full px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10"
    >
      Ingresar
    </Link>
  );

  if (revisando)
    return (
      <>
        <Encabezado derecha={derecha} />
        <Cargando />
      </>
    );

  return (
    <>
      <Encabezado derecha={derecha} />

      {paso === 1 && (
        <Marco
          titulo={completar ? "Completa tu registro" : "Crea tu cuenta"}
          subtitulo={
            completar
              ? `Tu correo ${form.email} ya está verificado. Faltan tus datos y tus fotos.`
              : "Con la misma cuenta ingresas aquí y en la app."
          }
          paso={1}
          pasos={PASOS}
          ancho="max-w-2xl"
        >
          {aviso && (
            <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)}>
              {aviso.texto}
              {aviso.texto.includes("ya tiene una cuenta") && (
                <>
                  {" "}
                  <Link href="/ingresar" className="font-semibold underline">
                    Ingresar
                  </Link>{" "}
                  ·{" "}
                  <Link href="/recuperar" className="font-semibold underline">
                    Recuperar contraseña
                  </Link>
                </>
              )}
            </Aviso>
          )}
          <form onSubmit={continuar} noValidate className="space-y-7">
            <fieldset className="space-y-4">
              <legend className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8A93A6]">
                Identidad
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  id="nombres"
                  etiqueta="Nombres"
                  autoComplete="given-name"
                  placeholder="Como figuran en tu documento"
                  value={form.nombres}
                  onChange={(e) => set("nombres", e.target.value)}
                  error={err("nombres")}
                  ok={ok("nombres")}
                />
                <Campo
                  id="apellidos"
                  etiqueta="Apellidos"
                  autoComplete="family-name"
                  placeholder="Ambos apellidos"
                  value={form.apellidos}
                  onChange={(e) => set("apellidos", e.target.value)}
                  error={err("apellidos")}
                  ok={ok("apellidos")}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold">
                  Tipo de documento
                </p>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-label="Tipo de documento"
                >
                  {[
                    { k: "dni", t: "DNI", d: "Peruano" },
                    { k: "ce", t: "Carnet", d: "de extranjería" },
                  ].map((o) => (
                    <button
                      key={o.k}
                      type="button"
                      role="radio"
                      aria-checked={form.tipo_documento === o.k}
                      onClick={() =>
                        form.tipo_documento !== o.k &&
                        setForm((f) => ({ ...f, tipo_documento: o.k, dni: "" }))
                      }
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left transition",
                        form.tipo_documento === o.k
                          ? "border-marca-900 bg-marca-900 text-white"
                          : "border-[#DCE3EE] hover:bg-[#F6F8FC]",
                      )}
                    >
                      <span className="block font-semibold">{o.t}</span>
                      <span
                        className={cn(
                          "block text-chico",
                          form.tipo_documento === o.k
                            ? "text-white/70"
                            : "text-[#8A93A6]",
                        )}
                      >
                        {o.d}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  id="dni"
                  etiqueta={
                    form.tipo_documento === "ce"
                      ? "Número de carnet"
                      : "Número de DNI"
                  }
                  inputMode="numeric"
                  maxLength={largo}
                  placeholder={`${largo} dígitos`}
                  value={form.dni}
                  onChange={(e) =>
                    set(
                      "dni",
                      e.target.value.replace(/\D/g, "").slice(0, largo),
                    )
                  }
                  error={err("dni")}
                  ok={ok("dni") && dniRevisado}
                  ayuda={
                    dniConsultable && !dniRevisado
                      ? "Comprobando..."
                      : undefined
                  }
                />
                <Campo
                  id="telefono"
                  etiqueta="Celular"
                  prefijo="+51"
                  inputMode="tel"
                  autoComplete="tel-national"
                  maxLength={9}
                  placeholder="9 dígitos"
                  value={form.telefono}
                  onChange={(e) =>
                    set(
                      "telefono",
                      e.target.value.replace(/\D/g, "").slice(0, 9),
                    )
                  }
                  error={err("telefono")}
                  ok={ok("telefono")}
                />
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8A93A6]">
                Dirección
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Selector
                  id="departamento"
                  etiqueta="Departamento"
                  valor={form.departamento}
                  opciones={departamentos}
                  onCambio={(v) =>
                    setForm((f) => ({
                      ...f,
                      departamento: v,
                      provincia: "",
                      distrito: "",
                    }))
                  }
                  error={intentos > 0 && !form.departamento}
                />
                <Selector
                  id="provincia"
                  etiqueta="Provincia"
                  valor={form.provincia}
                  opciones={provincias}
                  deshabilitado={!form.departamento}
                  onCambio={(v) =>
                    setForm((f) => ({ ...f, provincia: v, distrito: "" }))
                  }
                  error={intentos > 0 && !form.provincia}
                />
                <Selector
                  id="distrito"
                  etiqueta="Distrito"
                  valor={form.distrito}
                  opciones={distritos}
                  deshabilitado={!form.provincia}
                  onCambio={(v) => set("distrito", v)}
                  error={intentos > 0 && !form.distrito}
                />
              </div>
              {intentos > 0 && errores.ubicacion && (
                <p
                  role="alert"
                  className="-mt-2 text-chico font-medium text-red-600"
                >
                  {errores.ubicacion}
                </p>
              )}
              <Campo
                id="direccion"
                etiqueta="Dirección"
                autoComplete="street-address"
                placeholder="Av., calle, número"
                maxLength={150}
                value={form.direccion}
                onChange={(e) => set("direccion", e.target.value)}
                error={err("direccion")}
                ok={ok("direccion")}
              />
            </fieldset>

            {!completar && (
              <fieldset className="space-y-4">
                <legend className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8A93A6]">
                  Acceso
                </legend>
                <Campo
                  id="email"
                  etiqueta="Correo electrónico"
                  type="email"
                  autoComplete="email"
                  placeholder="tucorreo@ejemplo.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  error={
                    emailUsado ? (
                      <>
                        Ese correo ya tiene una cuenta.{" "}
                        <Link href="/ingresar" className="underline">
                          Ingresar
                        </Link>{" "}
                        ·{" "}
                        <Link href="/recuperar" className="underline">
                          Recuperar contraseña
                        </Link>
                      </>
                    ) : (
                      err("email")
                    )
                  }
                  ok={ok("email") && emailRevisado}
                  ayuda={
                    emailConsultable && !emailRevisado
                      ? "Comprobando..."
                      : "Te enviaremos un código para verificarlo."
                  }
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <CampoClave
                      id="password"
                      etiqueta="Contraseña"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      error={
                        intentos > 0 && errores.password
                          ? "Revisa los requisitos."
                          : null
                      }
                      ok={ok("password")}
                    />
                    <ReglasClave reglas={reglas} />
                  </div>
                  <CampoClave
                    id="confirmar"
                    etiqueta="Confirmar contraseña"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={form.confirmar}
                    onChange={(e) => set("confirmar", e.target.value)}
                    error={err("confirmar")}
                    ok={reglas.match}
                  />
                </div>
              </fieldset>
            )}

            {!completar && (
              <fieldset className="space-y-2.5">
                <legend className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8A93A6]">
                  Autorizaciones
                </legend>
                <Casilla
                  id="terminos"
                  marcada={aceptaTerminos}
                  onCambio={setAceptaTerminos}
                  error={intentos > 0 && !aceptaTerminos}
                >
                  Acepto los{" "}
                  <a
                    href="/terminos"
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-marca-900 underline"
                  >
                    Términos y condiciones
                  </a>{" "}
                  y la{" "}
                  <a
                    href="/privacidad"
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-marca-900 underline"
                  >
                    Política de privacidad
                  </a>
                  .
                </Casilla>
                <Casilla
                  id="fotos"
                  marcada={aceptaFotos}
                  onCambio={setAceptaFotos}
                  error={intentos > 0 && !aceptaFotos}
                >
                  Autorizo el uso de las fotos de mi documento y mi selfie solo
                  para verificar mi identidad.{" "}
                  <a
                    href="/autorizacion-fotos"
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-marca-900 underline"
                  >
                    Ver detalle
                  </a>
                </Casilla>
                <Casilla
                  id="promos"
                  marcada={aceptaPromos}
                  onCambio={setAceptaPromos}
                >
                  Quiero recibir promociones y novedades de ALTOQUE PERU WK
                  (opcional). Puedo dejar de recibirlas cuando quiera.
                </Casilla>
              </fieldset>
            )}

            {promoAbierto || form.codigo_promo ? (
              <Campo
                id="promo"
                etiqueta="Código promocional (opcional)"
                autoFocus
                value={form.codigo_promo}
                onChange={(e) =>
                  set("codigo_promo", e.target.value.toUpperCase().slice(0, 30))
                }
              />
            ) : (
              <button
                type="button"
                onClick={() => setPromoAbierto(true)}
                className="text-sm font-semibold text-marca-700 underline underline-offset-4"
              >
                ¿Tienes un código promocional?
              </button>
            )}

            <Boton
              type="submit"
              tono="oro"
              cargando={cargando}
              className="w-full"
            >
              {completar
                ? "Continuar con mis fotos"
                : "Crear cuenta y enviar código"}
            </Boton>
          </form>
        </Marco>
      )}

      {paso === 2 && (
        <Marco
          titulo="Revisa tu correo"
          subtitulo="Te enviamos un código de 6 dígitos. Escríbelo aquí para verificar tu correo."
          paso={2}
          pasos={PASOS}
        >
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-[#F4F7FB] px-4 py-3 ring-1 ring-[#E3E9F2]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 shrink-0 text-marca-700"
              aria-hidden
            >
              <path d="M3 6h18v12H3z" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block text-chico text-[#6B7690]">Enviado a</span>
              <span className="block break-all font-semibold">
                {form.email.trim().toLowerCase()}
              </span>
            </span>
            <button
              type="button"
              onClick={cambiarCorreo}
              disabled={cargando}
              className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-marca-900 ring-1 ring-[#DCE3EE] transition hover:bg-[#EFF3F9] disabled:opacity-50"
            >
              Cambiar correo
            </button>
          </div>
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
            <span className="text-[#8A93A6]">
              ¿No te llegó? Revisa tu carpeta de spam o{" "}
              <button
                type="button"
                onClick={cambiarCorreo}
                className="font-semibold text-marca-700 underline underline-offset-4"
              >
                corrige tu correo
              </button>
              .
            </span>
            <Boton
              type="button"
              tono="enlace"
              disabled={espera > 0}
              onClick={reenviar}
            >
              {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar código"}
            </Boton>
          </div>
          {cargando && (
            <p className="mt-4 text-sm text-[#4F5B74]">Verificando...</p>
          )}
        </Marco>
      )}

      {paso === 3 && (
        <Marco
          titulo="Tu identidad"
          subtitulo="La revisa una persona de nuestro equipo, no un algoritmo."
          paso={3}
          pasos={PASOS}
        >
          <Aviso tono={aviso?.tono} onCerrar={() => setAviso(null)}>
            {aviso?.texto}
          </Aviso>
          <SubidaFotos
            fotos={fotos}
            onCambio={setFotos}
            tipoDocumento={form.tipo_documento}
            deshabilitado={cargando}
          />
          <Boton
            type="button"
            tono="oro"
            cargando={cargando}
            disabled={!fotosCompletas(fotos)}
            className="mt-6 w-full"
            onClick={finalizar}
          >
            {cargando ? "Enviando documentos..." : "Enviar a revisión"}
          </Boton>
          <p className="mt-3 text-center text-chico text-[#8A93A6]">
            Tus fotos se guardan cifradas y solo las ve el equipo de
            verificación.
          </p>
        </Marco>
      )}
    </>
  );
}

function Selector({
  id,
  etiqueta,
  valor,
  opciones,
  onCambio,
  deshabilitado,
  error,
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {etiqueta}
      </label>
      <select
        id={id}
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => onCambio(e.target.value)}
        aria-invalid={error}
        className={cn(
          "h-12 w-full rounded-xl border bg-white px-3 text-md outline-none transition focus:ring-4 disabled:bg-[#F6F8FC] disabled:text-[#AFBCD0]",
          error
            ? "border-red-400 focus:ring-red-500/10"
            : valor
              ? "border-emerald-500 focus:ring-emerald-500/10"
              : "border-[#DCE3EE] focus:border-marca-600 focus:ring-marca-600/10",
        )}
      >
        <option value="">Elige...</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
