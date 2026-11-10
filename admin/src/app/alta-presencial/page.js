"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import PERU_DATA from "@/lib/ubigeo";
import { BANCOS_PRINCIPALES, ORDEN_BANCOS, nombreBanco } from "@/lib/bancos";
import {
  validarEmail,
  validarDocumento,
  validarTelefono,
  validarNombre,
  validarPassword,
  reglasPassword,
  errorDeDigitos,
  largoDocumento,
  validarUltimos4,
  validarCuenta,
  LARGO_AHORROS,
} from "@/lib/validacionesCliente";
import Shell, { Persona, Check } from "@/components/shell";
import { Aviso } from "@/components/marca";
import { BotonAccion, CargaPantalla, Rueda } from "@/components/carga";
import { Campo } from "@/components/piezas";
import Desplegable from "@/components/desplegable";
import { CodigoSeis, ReglasClave } from "@/components/cliente/piezas";
import SubidaFotos, { fotosCompletas } from "@/components/cliente/fotos";
import { ElegirBanco, FotoUnica } from "@/components/cliente/sesion";

/**
 * Alta presencial: el gestor registra en el local al cliente que viene
 * en persona. Es el mismo registro de la app o la web (correo confirmado
 * con código, contraseña, documentos aceptados, fotos de identidad), en
 * pasos cortos y con la opción de volver atrás. Al final se le pueden
 * agregar tarjetas y cuentas, y la cuenta queda activa sin pasar por la
 * cola de verificación (registrar_cliente_presencial).
 *
 * El registro lo hace el propio cliente: se usa una sesión temporal que
 * vive solo en esta pantalla (no se guarda en el navegador), así que la
 * sesión del gestor no se toca y en el equipo del local no queda abierta
 * la cuenta del cliente.
 *
 * El alta es solo de quien la hace: hasta "Activar" el cliente solo
 * tiene su acceso (correo confirmado), sin fila en users, perfil ni
 * tarjetas, así que no entra a ninguna cola ni se le reparte a nadie.
 * Al activar, la base lo crea todo de una vez, ya activo y asignado al
 * gestor. Si un alta quedó a medias, ese correo se retoma con un código.
 */
const ROLES = ["admin", "supervisor", "gestor"];
// Cuatro pantallas: datos y contraseña juntos; el código; las fotos; y
// al final tarjetas, cuentas, comisión y activar en una sola.
const PASOS = [
  { k: "datos", t: "Datos" },
  { k: "correo", t: "Correo" },
  { k: "identidad", t: "Fotos" },
  { k: "activar", t: "Tarjetas y activar" },
];
const VACIO = {
  tipo_documento: "dni",
  dni: "",
  nombres: "",
  apellidos: "",
  telefono: "",
  departamento: "",
  provincia: "",
  distrito: "",
  direccion: "",
  email: "",
};
const TARJETA_VACIA = {
  banco: null,
  ultimos4: "",
  nombre: "",
  frente: null,
  reverso: null,
};
const CUENTA_VACIA = { banco: "BCP", tipo: "ahorros", numero: "" };
const FOTOS_VACIAS = { dni_frontal: null, dni_posterior: null, selfie: null };

/** Contraseña al azar, para quien la creará después con "Olvidé mi contraseña". */
function claveAlAzar() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const azar = crypto.getRandomValues(new Uint32Array(16));
  return `${Array.from(azar, (n) => abc[n % abc.length]).join("")}#7a`;
}

export default function AltaPresencialPage() {
  const [session, setSession] = useState(sesionEnCache);
  const router = useRouter();

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!ROLES.includes(s.rol)) return router.push("/dashboard");
      setSession(s);
    });
  }, [router]);

  if (!session) return <CargaPantalla />;
  return (
    <Shell
      session={session}
      titulo="Nuevo cliente"
      descripcion="Registro presencial: el cliente queda activo al terminar"
      ayuda="Son 4 pasos: datos y contraseña, código del correo, fotos, y tarjetas con activar. Llénalo con el cliente al lado y su documento en la mano; puedes volver atrás. El alta es solo tuya: el cliente no entra a ninguna cola y nada se guarda hasta «Activar»."
    >
      <Alta session={session} />
    </Shell>
  );
}

function Alta({ session }) {
  // Sesión temporal del cliente: solo en memoria, con clave propia.
  const temporal = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: `atk-alta-${Math.random().toString(36).slice(2)}`,
          },
        },
      ),
    [],
  );

  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState(VACIO);
  const [clave, setClave] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [claveDespues, setClaveDespues] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [promos, setPromos] = useState(false);
  const [enviadoA, setEnviadoA] = useState(null); // correo al que se mandó el código
  // "signup": cuenta nueva; "recovery": retoma un alta que quedó a medias.
  const [tipoCodigo, setTipoCodigo] = useState("signup");
  const [cuenta, setCuenta] = useState(null); // { userId } cuando confirmó el correo
  const [codigo, setCodigo] = useState("");
  const [codigoError, setCodigoError] = useState("");
  const [espera, setEspera] = useState(0);
  const [fotos, setFotos] = useState(FOTOS_VACIAS);
  const [tarjetas, setTarjetas] = useState([]);
  const [nuevaTarjeta, setNuevaTarjeta] = useState(TARJETA_VACIA);
  const [cuentas, setCuentas] = useState([]);
  const [nuevaCuenta, setNuevaCuenta] = useState(CUENTA_VACIA);
  const [intento, setIntento] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [progreso, setProgreso] = useState({}); // lo ya guardado al activar
  const [listo, setListo] = useState(null); // resultado de activar
  const [aviso, setAviso] = useState(null);
  // Comisión con la que empieza: null es la tarifa estándar.
  const [cupones, setCupones] = useState(null);
  const [cupon, setCupon] = useState(null);
  const [verComision, setVerComision] = useState(false);
  const [formTarjeta, setFormTarjeta] = useState(false);
  const [formCuenta, setFormCuenta] = useState(false);
  const [yaUsado, setYaUsado] = useState({ email: null, dni: null });
  const verificando = useRef(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const emailNormal = form.email.trim().toLowerCase();
  const nombreCompleto =
    `${form.nombres.trim()} ${form.apellidos.trim()}`.trim();

  // ── ¿Ya está registrado ese correo o ese documento? ──
  const emailRetraso = useRetraso(emailNormal, 500);
  const dniRetraso = useRetraso(form.dni, 500);
  useEffect(() => {
    if (cuenta || validarEmail(emailRetraso)) return;
    supabase
      .rpc("estado_correo_alta", { p_email: emailRetraso })
      .then(({ data, error }) =>
        setYaUsado((y) => ({
          ...y,
          email: { valor: emailRetraso, estado: error ? null : data },
        })),
      );
  }, [emailRetraso, cuenta]);
  // El documento se sigue revisando aunque el correo ya esté confirmado:
  // el perfil recién se guarda al activar.
  useEffect(() => {
    if (progreso.registro || validarDocumento(form.tipo_documento, dniRetraso))
      return;
    temporal
      .rpc("verificar_registro", { p_email: null, p_dni: dniRetraso })
      .then(({ data }) =>
        setYaUsado((y) => ({
          ...y,
          dni: { valor: dniRetraso, usado: data?.dni === true },
        })),
      );
  }, [dniRetraso, form.tipo_documento, progreso.registro, temporal]);

  // Cupones activos para elegir la comisión.
  useEffect(() => {
    supabase
      .rpc("listar_bloques")
      .then(({ data }) => setCupones((data || []).filter((b) => b.activo)));
  }, []);

  // Cuenta regresiva para reenviar el código.
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((e) => e - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  // ── Ubigeo ──
  const departamentos = Object.keys(PERU_DATA);
  const provincias = form.departamento
    ? Object.keys(PERU_DATA[form.departamento] || {})
    : [];
  const distritos =
    form.departamento && form.provincia
      ? PERU_DATA[form.departamento]?.[form.provincia] || []
      : [];
  const ubigeoValido = Boolean(
    PERU_DATA[form.departamento]?.[form.provincia]?.includes(form.distrito),
  );

  // ── Validación por paso ──
  const nombreDoc = form.tipo_documento === "ce" ? "carnet" : "DNI";
  const errDatos = {
    dni:
      yaUsado.dni?.valor === form.dni && yaUsado.dni.usado && !progreso.registro
        ? `Ese ${nombreDoc} ya tiene una cuenta. Búscalo en Clientes.`
        : errorDeDigitos(form.dni, largoDocumento(form.tipo_documento), (v) =>
            validarDocumento(form.tipo_documento, v),
          ),
    nombres: validarNombre(form.nombres, "nombres"),
    apellidos: validarNombre(form.apellidos, "apellidos"),
    telefono: errorDeDigitos(form.telefono, 9, validarTelefono),
    ubicacion: ubigeoValido
      ? null
      : "Elige departamento, provincia y distrito.",
    direccion:
      form.direccion.trim().length < 5
        ? "Escribe la dirección (calle y número)."
        : null,
    email: cuenta
      ? null
      : yaUsado.email?.valor === emailNormal &&
          yaUsado.email.estado === "cliente"
        ? "Ese correo ya es de un cliente. Búscalo en Clientes."
        : yaUsado.email?.valor === emailNormal &&
            yaUsado.email.estado === "equipo"
          ? "Ese correo es de una cuenta del equipo."
          : validarEmail(form.email),
  };
  const reglas = reglasPassword(clave, confirmar);
  const errAcceso = {
    clave: cuenta || claveDespues ? null : validarPassword(clave, confirmar),
    acepta:
      cuenta || acepta
        ? null
        : "El cliente debe aceptar los términos y la política de privacidad.",
  };
  const fallas = (o) => Object.values(o).filter(Boolean);
  // Un alta anterior quedó a medias con este correo: se retoma.
  const aMedias =
    !cuenta &&
    yaUsado.email?.valor === emailNormal &&
    yaUsado.email.estado === "a_medias";

  const err = (o, k) => (intento ? o[k] : null);

  function ir(n) {
    setAviso(null);
    setIntento(false);
    setPaso(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function siguiente() {
    const k = PASOS[paso].k;
    if (k === "datos") {
      if (fallas(errDatos).length || fallas(errAcceso).length)
        return setIntento(true);
      // Ya confirmó el correo: no hay que volver a mandar el código.
      return cuenta ? ir(2) : enviarCodigo();
    }
    if (k === "identidad") {
      if (!fotosCompletas(fotos))
        return setAviso({ tono: "atencion", texto: "Faltan fotos por tomar." });
      return ir(3);
    }
  }

  function atras() {
    const k = PASOS[paso].k;
    // Con el correo confirmado no se vuelve al código: ya está hecho.
    if (k === "identidad") return ir(0);
    ir(Math.max(0, paso - 1));
  }

  // ── Acceso: crea la cuenta y manda el código ──
  async function enviarCodigo() {
    if (fallas(errAcceso).length) return setIntento(true);
    setTrabajando(true);
    setAviso(null);
    try {
      let tipo = "signup";
      let retomar = aMedias;
      if (!retomar) {
        const { data, error } = await temporal.auth.signUp({
          email: emailNormal,
          password: claveDespues ? claveAlAzar() : clave,
        });
        const existe =
          (error && /already registered|already exists/i.test(error.message)) ||
          (data?.user && data.user.identities?.length === 0);
        if (error && !existe)
          return setAviso({
            tono: "error",
            texto: explicarError(error, "No se pudo enviar el código."),
          });
        if (existe) {
          const { data: estado } = await supabase.rpc("estado_correo_alta", {
            p_email: emailNormal,
          });
          if (estado !== "a_medias")
            return setAviso({
              tono: "atencion",
              texto: "Ese correo ya tiene una cuenta. Búscalo en Clientes.",
            });
          retomar = true;
        }
      }
      if (retomar) {
        // Quedó a medias: se entra con un código y se sigue desde aquí.
        const { error } =
          await temporal.auth.resetPasswordForEmail(emailNormal);
        if (error)
          return setAviso({
            tono: "error",
            texto: explicarError(error, "No se pudo enviar el código."),
          });
        tipo = "recovery";
      }
      setTipoCodigo(tipo);
      setEnviadoA(emailNormal);
      setCodigo("");
      setCodigoError("");
      setEspera(60);
      ir(1);
    } finally {
      setTrabajando(false);
    }
  }

  async function reenviar() {
    const { error } =
      tipoCodigo === "recovery"
        ? await temporal.auth.resetPasswordForEmail(enviadoA)
        : await temporal.auth.resend({ type: "signup", email: enviadoA });
    if (error)
      return setAviso({
        tono: "error",
        texto: explicarError(error, "No se pudo reenviar."),
      });
    setEspera(60);
    setAviso({ tono: "exito", texto: "Código nuevo enviado." });
  }

  // ── Correo: verifica el código (todavía no se crea nada en las tablas) ──
  async function verificar(token) {
    if (verificando.current) return;
    verificando.current = true;
    setTrabajando(true);
    setCodigoError("");
    try {
      const { data, error } = await temporal.auth.verifyOtp({
        email: enviadoA,
        token,
        type: tipoCodigo,
      });
      if (error) {
        setCodigo("");
        return setCodigoError("El código es incorrecto o ya expiró.");
      }
      const uid = data.user?.id;
      // Retomando: la contraseña que escribió ahora es la que vale.
      if (tipoCodigo === "recovery" && !claveDespues && clave) {
        const { error: e2 } = await temporal.auth.updateUser({
          password: clave,
        });
        if (e2)
          return setAviso({
            tono: "error",
            texto: explicarError(e2, "No se pudo guardar la contraseña."),
          });
      }
      // Lo que el cliente aceptó, con su versión exacta.
      const { data: docs } = await temporal
        .from("documentos_vigentes")
        .select("id");
      if (docs?.length)
        await temporal
          .rpc("aceptar_documentos", {
            p_documentos: docs.map((d) => d.id),
            p_dispositivo: {
              origen: "alta_presencial",
              registrado_por: session.email,
            },
          })
          .then(
            () => {},
            () => {},
          );
      setCuenta({ userId: uid });
      ir(2);
    } finally {
      verificando.current = false;
      setTrabajando(false);
    }
  }

  // ── Tarjetas ──
  const tarjetaEscrita = Boolean(
    nuevaTarjeta.banco || nuevaTarjeta.ultimos4 || nuevaTarjeta.frente,
  );
  const errTarjeta = {
    banco: nuevaTarjeta.banco ? null : "Elige el banco.",
    ultimos4:
      validarUltimos4(nuevaTarjeta.ultimos4) ||
      (tarjetas.some(
        (t) =>
          t.banco === nuevaTarjeta.banco &&
          t.ultimos4 === nuevaTarjeta.ultimos4,
      )
        ? "Esa tarjeta ya está en la lista."
        : null),
    nombre:
      (nuevaTarjeta.nombre || nombreCompleto).trim().length < 3
        ? "Escribe el nombre impreso."
        : null,
    frente: nuevaTarjeta.frente ? null : "Falta la foto de la tarjeta.",
  };
  /** Pasa la tarjeta escrita a la lista. Devuelve la lista nueva o null si falta algo. */
  function agregarTarjeta() {
    if (fallas(errTarjeta).length) {
      setIntento(true);
      return null;
    }
    const lista = [
      ...tarjetas,
      {
        ...nuevaTarjeta,
        id: crypto.randomUUID(),
        nombre: (nuevaTarjeta.nombre || nombreCompleto).trim().toUpperCase(),
      },
    ];
    setTarjetas(lista);
    // La cuenta de ahorros suele ser del mismo banco: se deja elegido.
    if (
      BANCOS_PRINCIPALES.includes(nuevaTarjeta.banco) &&
      !nuevaCuenta.numero &&
      !cuentas.some((c) => c.banco === nuevaTarjeta.banco)
    )
      setNuevaCuenta((c) => ({ ...c, banco: nuevaTarjeta.banco }));
    setNuevaTarjeta(TARJETA_VACIA);
    setFormTarjeta(false);
    setIntento(false);
    return lista;
  }

  // ── Cuentas ──
  const cci = nuevaCuenta.tipo === "interbancaria";
  const errCuenta = {
    numero:
      validarCuenta(nuevaCuenta.numero, nuevaCuenta.tipo, nuevaCuenta.banco) ||
      (cuentas.some(
        (c) => c.banco === nuevaCuenta.banco && c.tipo === nuevaCuenta.tipo,
      )
        ? `Ya hay una cuenta ${cci ? "CCI" : "de ahorros"} ${nuevaCuenta.banco} en la lista.`
        : cuentas.some((c) => c.numero === nuevaCuenta.numero)
          ? "Ese número ya está en la lista."
          : null),
  };
  function agregarCuenta() {
    if (fallas(errCuenta).length) {
      setIntento(true);
      return null;
    }
    const lista = [...cuentas, { ...nuevaCuenta, id: crypto.randomUUID() }];
    setCuentas(lista);
    setNuevaCuenta((c) => ({ ...CUENTA_VACIA, banco: c.banco }));
    setFormCuenta(false);
    setIntento(false);
    return lista;
  }
  // Tarjetas de banco principal sin cuenta de ahorros de ese banco.
  const sinDonde = [
    ...new Set(
      tarjetas
        .filter((t) => BANCOS_PRINCIPALES.includes(t.banco))
        .filter(
          (t) =>
            !cuentas.some((c) => c.banco === t.banco && c.tipo === "ahorros"),
        )
        .map((t) => t.banco),
    ),
  ];

  // ── Activar: sube las fotos y registra todo de una vez ──
  async function activar() {
    setAviso(null);
    // Lo que quedó escrito sin pulsar "Agregar" también entra.
    let tarjetas_ = tarjetas;
    let cuentas_ = cuentas;
    if (tarjetaEscrita) {
      tarjetas_ = agregarTarjeta();
      if (!tarjetas_)
        return setAviso({
          tono: "atencion",
          texto: "Completa la tarjeta que empezaste o pulsa «Limpiar».",
        });
    }
    if (nuevaCuenta.numero) {
      cuentas_ = agregarCuenta();
      if (!cuentas_)
        return setAviso({
          tono: "atencion",
          texto: "Corrige la cuenta que empezaste o bórrala.",
        });
    }
    setTrabajando(true);
    const hecho = { ...progreso };
    const marcar = (k, v = true) => {
      hecho[k] = v;
      setProgreso({ ...hecho });
    };
    try {
      const uid = cuenta.userId;
      const subir = async (bucket, path, foto) => {
        const { error } = await temporal.storage
          .from(bucket)
          .upload(path, foto.blob, { contentType: "image/jpeg", upsert: true });
        if (error) throw error;
        return path;
      };
      // Las fotos van con la sesión del cliente, a su carpeta.
      if (!hecho.fotos) {
        const paths = {};
        for (const k of ["dni_frontal", "dni_posterior", "selfie"])
          paths[k] = await subir("kyc-documentos", `${uid}/${k}.jpg`, fotos[k]);
        marcar("fotos", paths);
      }
      for (const t of tarjetas_) {
        if (hecho[`ft-${t.id}`]) continue;
        const sello = `${Date.now()}-${t.ultimos4}`;
        const frente = await subir(
          "tarjetas-fotos",
          `${uid}/${sello}-frente.jpg`,
          t.frente,
        );
        const reverso = t.reverso
          ? await subir(
              "tarjetas-fotos",
              `${uid}/${sello}-reverso.jpg`,
              t.reverso,
            )
          : null;
        marcar(`ft-${t.id}`, { frente, reverso });
      }
      // Todo lo demás lo crea la base de una vez, con la sesión del gestor:
      // el cliente activo, su perfil, tarjetas verificadas y cuentas.
      const { data, error } = await supabase.rpc(
        "registrar_cliente_presencial",
        {
          p_user: uid,
          p_datos: {
            tipo_documento: form.tipo_documento,
            dni: form.dni,
            nombres: form.nombres.trim(),
            apellidos: form.apellidos.trim(),
            telefono: "+51" + form.telefono,
            direccion: [
              form.direccion.trim(),
              form.distrito,
              form.provincia,
              form.departamento,
            ]
              .filter(Boolean)
              .join(", "),
            acepta_promociones: promos,
            foto_dni_frontal: hecho.fotos.dni_frontal,
            foto_dni_posterior: hecho.fotos.dni_posterior,
            foto_selfie: hecho.fotos.selfie,
          },
          p_tarjetas: tarjetas_.map((t) => ({
            banco: t.banco,
            ultimos_4: t.ultimos4,
            nombre_impreso: t.nombre,
            foto_tarjeta: hecho[`ft-${t.id}`].frente,
            foto_reverso: hecho[`ft-${t.id}`].reverso,
          })),
          p_cuentas: cuentas_.map((c) => ({
            banco: c.banco,
            tipo: c.tipo,
            numero_cuenta: c.numero,
          })),
          p_cupon: cupon?.id || null,
        },
      );
      if (error) throw error;
      marcar("registro");
      await temporal.auth.signOut().catch(() => {});
      setListo(data);
    } catch (e) {
      setAviso({
        tono: "error",
        texto:
          e?.code === "PGRST202"
            ? "Falta aplicar en Supabase la migración 20261103000067_alta_presencial.sql."
            : e?.code === "P0001"
              ? e.message
              : explicarError(
                  e,
                  "No se pudo terminar. Vuelve a pulsar «Activar cliente»: continúa donde se quedó.",
                ),
      });
    } finally {
      setTrabajando(false);
    }
  }

  function otroCliente() {
    temporal.auth.signOut().catch(() => {});
    setPaso(0);
    setForm(VACIO);
    setClave("");
    setConfirmar("");
    setClaveDespues(false);
    setAcepta(false);
    setPromos(false);
    setEnviadoA(null);
    setTipoCodigo("signup");
    setCuenta(null);
    setCodigo("");
    setFotos(FOTOS_VACIAS);
    setTarjetas([]);
    setCuentas([]);
    setNuevaTarjeta(TARJETA_VACIA);
    setNuevaCuenta(CUENTA_VACIA);
    setProgreso({});
    setCupon(null);
    setVerComision(false);
    setFormTarjeta(false);
    setFormCuenta(false);
    setListo(null);
    setAviso(null);
    setYaUsado({ email: null, dni: null });
  }

  // ── Listo ──
  if (listo) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-panel">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-7 w-7" />
        </span>
        <h2 className="mt-4 font-heading text-2xl font-semibold text-foreground">
          {nombreCompleto} ya está activo
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Puede ingresar a la app o la web con{" "}
          <strong className="text-foreground">{enviadoA}</strong>
          {claveDespues
            ? " creando su contraseña con «Olvidé mi contraseña»."
            : " y la contraseña que escribió."}
          {tarjetas.length > 0 &&
            ` ${tarjetas.length === 1 ? "Su tarjeta quedó verificada" : `Sus ${tarjetas.length} tarjetas quedaron verificadas`}.`}
          {listo.cupon
            ? ` Empieza con el cupón ${listo.cupon}${listo.cupon_hasta ? ` hasta el ${new Date(listo.cupon_hasta).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}` : ""}.`
            : " Paga la tarifa estándar."}
        </p>
        {sinDonde.length > 0 && (
          <p className="mt-3 rounded-lg bg-oro-50 px-3 py-2 text-sm text-oro-700">
            Para operar con {sinDonde.join(" y ")} le falta su cuenta de ahorros
            de ese banco.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <BotonAccion
            onClick={otroCliente}
            icono={<Persona className="h-4 w-4" />}
          >
            Registrar otro cliente
          </BotonAccion>
          {["admin", "supervisor"].includes(session.rol) && (
            <Link
              href="/clientes"
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted/50"
            >
              Ver en Clientes
            </Link>
          )}
        </div>
      </div>
    );
  }

  const k = PASOS[paso].k;
  // Empezó a guardarse: ya no se edita, solo se continúa.
  const guardando = Object.keys(progreso).length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <Pasos paso={paso} cuenta={Boolean(cuenta)} />

      <div className="rounded-2xl border border-border bg-card shadow-panel">
        <div key={k} className="animate-aparecer p-5 sm:p-7">
          {aviso && (
            <Aviso
              className="mb-4"
              tono={
                aviso.tono === "exito"
                  ? "exito"
                  : aviso.tono === "error"
                    ? "error"
                    : "espera"
              }
              onCerrar={() => setAviso(null)}
            >
              {aviso.texto}
            </Aviso>
          )}

          {k === "datos" && (
            <Paso
              titulo="Datos del cliente"
              indicacion="Cópialos tal como figuran en su documento."
            >
              <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                <Campo etiqueta="Documento">
                  <Desplegable
                    variante="panel"
                    valor={form.tipo_documento}
                    deshabilitado={Boolean(cuenta && progreso.perfil)}
                    onCambio={(v) => {
                      set("tipo_documento", v);
                      set("dni", "");
                    }}
                    opciones={[
                      { valor: "dni", texto: "DNI" },
                      { valor: "ce", texto: "Carnet de extranjería" },
                    ]}
                  />
                </Campo>
                <Campo
                  etiqueta={`Número de ${nombreDoc}`}
                  htmlFor="dni"
                  error={
                    err(errDatos, "dni") ||
                    (form.dni.length === largoDocumento(form.tipo_documento)
                      ? errDatos.dni
                      : null)
                  }
                >
                  <input
                    id="dni"
                    inputMode="numeric"
                    autoFocus
                    value={form.dni}
                    maxLength={largoDocumento(form.tipo_documento)}
                    onChange={(e) =>
                      set("dni", e.target.value.replace(/\D/g, ""))
                    }
                    placeholder={`${largoDocumento(form.tipo_documento)} dígitos`}
                    className="campo cifras"
                  />
                </Campo>
                <Campo
                  etiqueta="Nombres"
                  htmlFor="nombres"
                  error={err(errDatos, "nombres")}
                >
                  <input
                    id="nombres"
                    value={form.nombres}
                    maxLength={60}
                    onChange={(e) => set("nombres", e.target.value)}
                    className="campo"
                  />
                </Campo>
                <Campo
                  etiqueta="Apellidos"
                  htmlFor="apellidos"
                  error={err(errDatos, "apellidos")}
                >
                  <input
                    id="apellidos"
                    value={form.apellidos}
                    maxLength={60}
                    onChange={(e) => set("apellidos", e.target.value)}
                    className="campo"
                  />
                </Campo>
                <Campo
                  etiqueta="Celular"
                  htmlFor="telefono"
                  error={
                    err(errDatos, "telefono") ||
                    (form.telefono.length === 9 ? errDatos.telefono : null)
                  }
                >
                  <span className="relative flex items-center">
                    <span className="pointer-events-none absolute left-3 text-sm font-semibold text-muted-foreground">
                      +51
                    </span>
                    <input
                      id="telefono"
                      inputMode="numeric"
                      value={form.telefono}
                      maxLength={9}
                      onChange={(e) =>
                        set("telefono", e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="9 dígitos"
                      className="campo cifras pl-11"
                    />
                  </span>
                </Campo>
                <Campo
                  etiqueta="Correo"
                  htmlFor="email"
                  error={
                    err(errDatos, "email") ||
                    (yaUsado.email?.valor === emailNormal &&
                    yaUsado.email.usado &&
                    !cuenta
                      ? errDatos.email
                      : null)
                  }
                  extra={
                    cuenta
                      ? "Confirmado ✓"
                      : aMedias
                        ? "Quedó a medias: se retoma con un código"
                        : "Le llegará un código"
                  }
                >
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    disabled={Boolean(cuenta)}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="campo"
                  />
                </Campo>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Campo etiqueta="Departamento">
                  <Desplegable
                    variante="panel"
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
                    error={intento && !form.departamento}
                  />
                </Campo>
                <Campo etiqueta="Provincia">
                  <Desplegable
                    variante="panel"
                    valor={form.provincia}
                    opciones={provincias}
                    deshabilitado={!form.departamento}
                    onCambio={(v) =>
                      setForm((f) => ({ ...f, provincia: v, distrito: "" }))
                    }
                    error={intento && !form.provincia}
                  />
                </Campo>
                <Campo etiqueta="Distrito">
                  <Desplegable
                    variante="panel"
                    valor={form.distrito}
                    opciones={distritos}
                    deshabilitado={!form.provincia}
                    onCambio={(v) => set("distrito", v)}
                    error={intento && !form.distrito}
                  />
                </Campo>
              </div>
              <div className="mt-4">
                <Campo
                  etiqueta="Dirección"
                  htmlFor="direccion"
                  error={err(errDatos, "direccion")}
                >
                  <input
                    id="direccion"
                    value={form.direccion}
                    maxLength={150}
                    onChange={(e) => set("direccion", e.target.value)}
                    placeholder="Av., calle, número"
                    className="campo"
                  />
                </Campo>
              </div>
              {!cuenta && (
                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="font-heading text-base font-semibold text-foreground">
                    Contraseña y términos
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Si la escribe ahora, entrégale la pantalla al cliente.
                  </p>
                  <div className="mt-3">
                    <div
                      className="grid gap-2 sm:grid-cols-2"
                      role="radiogroup"
                      aria-label="Contraseña"
                    >
                      {[
                        [
                          false,
                          "La escribe ahora",
                          "El cliente la escribe él mismo.",
                        ],
                        [
                          true,
                          "La crea después",
                          "Con «Olvidé mi contraseña» en la app.",
                        ],
                      ].map(([v, t, d]) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={claveDespues === v}
                          onClick={() => setClaveDespues(v)}
                          className={cn(
                            "rounded-xl border-2 p-3 text-left transition",
                            claveDespues === v
                              ? "border-marca-700 bg-marca-50/60"
                              : "border-border hover:border-marca-300",
                          )}
                        >
                          <span className="block font-semibold text-foreground">
                            {t}
                          </span>
                          <span className="block text-chico text-muted-foreground">
                            {d}
                          </span>
                        </button>
                      ))}
                    </div>
                    {!claveDespues && (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Campo etiqueta="Contraseña" htmlFor="clave">
                          <EntradaClave
                            id="clave"
                            valor={clave}
                            onCambio={setClave}
                          />
                        </Campo>
                        <Campo
                          etiqueta="Repítela"
                          htmlFor="confirmar"
                          error={
                            confirmar && !reglas.match ? "No coinciden." : null
                          }
                          extra={
                            confirmar && reglas.match ? (
                              <span className="font-semibold text-emerald-700">
                                Coinciden ✓
                              </span>
                            ) : null
                          }
                        >
                          <EntradaClave
                            id="confirmar"
                            valor={confirmar}
                            onCambio={setConfirmar}
                          />
                        </Campo>
                        <div className="sm:col-span-2">
                          <ReglasClave reglas={reglas} />
                          {intento && errAcceso.clave && (
                            <p className="mt-1 text-chico font-semibold text-red-700">
                              {errAcceso.clave}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mt-5 space-y-2.5 rounded-xl bg-muted/40 p-4">
                      <label className="flex cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={acepta}
                          onChange={(e) => setAcepta(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-marca-700"
                        />
                        <span>
                          El cliente leyó y acepta los{" "}
                          <a
                            href="/terminos"
                            target="_blank"
                            rel="noopener"
                            className="font-semibold underline"
                          >
                            Términos
                          </a>{" "}
                          y la{" "}
                          <a
                            href="/privacidad"
                            target="_blank"
                            rel="noopener"
                            className="font-semibold underline"
                          >
                            Política de privacidad
                          </a>
                          .
                        </span>
                      </label>
                      {intento && errAcceso.acepta && (
                        <p className="text-chico font-semibold text-red-700">
                          {errAcceso.acepta}
                        </p>
                      )}
                      <label className="flex cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={promos}
                          onChange={(e) => setPromos(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-marca-700"
                        />
                        <span>
                          Quiere recibir promociones y novedades{" "}
                          <span className="text-muted-foreground">
                            (opcional)
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </Paso>
          )}

          {k === "correo" && (
            <Paso
              titulo="Confirma su correo"
              indicacion="Pídele el código de 6 dígitos que le llegó."
            >
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-muted/40 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block text-chico text-muted-foreground">
                    Enviado a
                  </span>
                  <span className="block break-all font-semibold">
                    {enviadoA}
                  </span>
                </span>
                <BotonAccion
                  tono="neutro"
                  tamano="chico"
                  onClick={() => ir(0)}
                  disabled={trabajando}
                >
                  Corregir correo
                </BotonAccion>
              </div>
              <CodigoSeis
                valor={codigo}
                deshabilitado={trabajando}
                error={codigoError}
                onCambio={(v) => {
                  setCodigo(v);
                  setCodigoError("");
                  if (v.length === 6) verificar(v);
                }}
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>¿No llegó? Que revise spam o promociones.</span>
                <BotonAccion
                  tono="neutro"
                  tamano="chico"
                  disabled={espera > 0 || trabajando}
                  onClick={reenviar}
                >
                  {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar código"}
                </BotonAccion>
              </div>
              {trabajando && (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Rueda className="h-4 w-4" /> Verificando...
                </p>
              )}
            </Paso>
          )}

          {k === "identidad" && (
            <Paso
              titulo="Fotos de identidad"
              indicacion={`Fotografía su ${nombreDoc} (frente y reverso) y su rostro con el documento.`}
            >
              <SubidaFotos
                fotos={fotos}
                onCambio={setFotos}
                tipoDocumento={form.tipo_documento}
                deshabilitado={trabajando}
              />
            </Paso>
          )}

          {k === "activar" && (
            <Paso
              titulo="Tarjetas, cuentas y activar"
              indicacion="Tarjetas y cuentas son opcionales. Verifica que estén a su nombre: quedan aprobadas."
            >
              <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-muted/40 p-4 text-sm sm:grid-cols-3">
                <Fila
                  t="Cliente"
                  v={`${nombreCompleto} · ${form.tipo_documento === "ce" ? "CE" : "DNI"} ${form.dni}`}
                  onEditar={guardando ? null : () => ir(0)}
                />
                <Fila t="Correo" v={`${enviadoA} ✓`} />
                <Fila
                  t="Fotos de identidad"
                  v={fotosCompletas(fotos) ? "3 de 3 ✓" : "Faltan"}
                  onEditar={guardando ? null : () => ir(2)}
                />
              </dl>

              <Seccion titulo="Tarjetas" extra="opcional">
                {tarjetas.length > 0 && (
                  <Lista
                    vacio=""
                    items={tarjetas.map((t) => ({
                      id: t.id,
                      titulo: `${nombreBanco(t.banco)} •••• ${t.ultimos4}`,
                      detalle: t.nombre,
                    }))}
                    onQuitar={(id) =>
                      setTarjetas((l) => l.filter((x) => x.id !== id))
                    }
                  />
                )}
                {formTarjeta || !tarjetas.length ? (
                  <div
                    className={cn(
                      "space-y-4 rounded-xl border border-dashed border-border p-4",
                      tarjetas.length > 0 && "mt-3",
                    )}
                  >
                    <ElegirBanco
                      bancos={ORDEN_BANCOS}
                      valor={nuevaTarjeta.banco}
                      onCambio={(b) =>
                        setNuevaTarjeta((t) => ({ ...t, banco: b }))
                      }
                    />
                    {intento && errTarjeta.banco && (
                      <p className="text-chico font-semibold text-red-700">
                        {errTarjeta.banco}
                      </p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
                      <Campo
                        etiqueta="Últimos 4"
                        htmlFor="ultimos4"
                        error={err(errTarjeta, "ultimos4")}
                      >
                        <input
                          id="ultimos4"
                          inputMode="numeric"
                          maxLength={4}
                          value={nuevaTarjeta.ultimos4}
                          onChange={(e) =>
                            setNuevaTarjeta((t) => ({
                              ...t,
                              ultimos4: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          placeholder="0000"
                          className="campo cifras"
                        />
                      </Campo>
                      <Campo
                        etiqueta="Nombre impreso"
                        htmlFor="nombreImpreso"
                        error={err(errTarjeta, "nombre")}
                        extra="Vacío = su nombre"
                      >
                        <input
                          id="nombreImpreso"
                          maxLength={60}
                          value={nuevaTarjeta.nombre}
                          onChange={(e) =>
                            setNuevaTarjeta((t) => ({
                              ...t,
                              nombre: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder={nombreCompleto.toUpperCase()}
                          className="campo"
                        />
                      </Campo>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FotoUnica
                        id="tarjeta-frente"
                        forma="tarjeta"
                        titulo="Foto de la tarjeta"
                        ayuda="Nombre y últimos 4 visibles."
                        consejos={[
                          "Tapa el resto del número.",
                          "Nunca el código de seguridad (CVV).",
                        ]}
                        foto={nuevaTarjeta.frente}
                        onCambio={(f) =>
                          setNuevaTarjeta((t) => ({ ...t, frente: f }))
                        }
                      />
                      <FotoUnica
                        id="tarjeta-reverso"
                        forma="tarjeta"
                        titulo="Segunda foto"
                        opcional
                        ayuda="Si ayuda a verificarla."
                        consejos={["Si es el reverso, tapa el CVV."]}
                        foto={nuevaTarjeta.reverso}
                        onCambio={(f) =>
                          setNuevaTarjeta((t) => ({ ...t, reverso: f }))
                        }
                      />
                    </div>
                    {intento && errTarjeta.frente && (
                      <p className="text-chico font-semibold text-red-700">
                        {errTarjeta.frente}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {!tarjetas.length && !tarjetaEscrita && (
                        <span className="mr-auto text-chico text-muted-foreground">
                          Si no trae tarjeta, déjalo vacío y activa.
                        </span>
                      )}
                      {(tarjetaEscrita || tarjetas.length > 0) && (
                        <BotonAccion
                          tono="neutro"
                          tamano="chico"
                          onClick={() => {
                            setNuevaTarjeta(TARJETA_VACIA);
                            setFormTarjeta(false);
                            setIntento(false);
                          }}
                        >
                          {tarjetas.length ? "Cancelar" : "Limpiar"}
                        </BotonAccion>
                      )}
                      <BotonAccion tamano="chico" onClick={agregarTarjeta}>
                        + Agregar tarjeta
                      </BotonAccion>
                    </div>
                  </div>
                ) : (
                  <BotonAgregarOtra onClick={() => setFormTarjeta(true)}>
                    + Agregar otra tarjeta
                  </BotonAgregarOtra>
                )}
              </Seccion>

              <Seccion titulo="Cuentas para depósito" extra="opcional">
                {sinDonde.length > 0 && (
                  <p className="mb-3 rounded-lg bg-oro-50 px-3 py-2 text-sm text-oro-700">
                    Para operar con su tarjeta {sinDonde.join(" y ")} necesita
                    su cuenta de ahorros de ese banco.
                  </p>
                )}
                {cuentas.length > 0 && (
                  <Lista
                    vacio=""
                    items={cuentas.map((c) => ({
                      id: c.id,
                      titulo: `${c.tipo === "interbancaria" ? "CCI" : "Ahorros"} ${nombreBanco(c.banco)}`,
                      detalle: c.numero,
                    }))}
                    onQuitar={(id) =>
                      setCuentas((l) => l.filter((x) => x.id !== id))
                    }
                  />
                )}
                {formCuenta || !cuentas.length ? (
                  <div
                    className={cn(
                      "space-y-4 rounded-xl border border-dashed border-border p-4",
                      cuentas.length > 0 && "mt-3",
                    )}
                  >
                    <ElegirBanco
                      bancos={BANCOS_PRINCIPALES}
                      valor={nuevaCuenta.banco}
                      onCambio={(b) =>
                        setNuevaCuenta((c) => ({ ...c, banco: b, numero: "" }))
                      }
                    />
                    <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                      <Campo etiqueta="Tipo">
                        <Desplegable
                          variante="panel"
                          valor={nuevaCuenta.tipo}
                          onCambio={(v) =>
                            setNuevaCuenta((c) => ({
                              ...c,
                              tipo: v,
                              numero: "",
                            }))
                          }
                          opciones={[
                            {
                              valor: "ahorros",
                              texto: "Ahorros",
                              detalle: "Recibe los depósitos",
                            },
                            {
                              valor: "interbancaria",
                              texto: "CCI",
                              detalle: "20 dígitos",
                            },
                          ]}
                        />
                      </Campo>
                      <Campo
                        etiqueta={cci ? "CCI" : "Número de cuenta"}
                        htmlFor="numeroCuenta"
                        error={err(errCuenta, "numero")}
                        extra={`${nuevaCuenta.numero.length}/${cci ? 20 : Math.max(...(LARGO_AHORROS[nuevaCuenta.banco] || [20]))}`}
                      >
                        <input
                          id="numeroCuenta"
                          inputMode="numeric"
                          maxLength={20}
                          value={nuevaCuenta.numero}
                          onChange={(e) =>
                            setNuevaCuenta((c) => ({
                              ...c,
                              numero: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          placeholder={
                            cci
                              ? "20 dígitos"
                              : `${(LARGO_AHORROS[nuevaCuenta.banco] || ["10 a 20"]).join(" o ")} dígitos`
                          }
                          className="campo cifras"
                        />
                      </Campo>
                    </div>
                    <div className="flex justify-end gap-2">
                      {cuentas.length > 0 && (
                        <BotonAccion
                          tono="neutro"
                          tamano="chico"
                          onClick={() => {
                            setNuevaCuenta((c) => ({ ...c, numero: "" }));
                            setFormCuenta(false);
                            setIntento(false);
                          }}
                        >
                          Cancelar
                        </BotonAccion>
                      )}
                      <BotonAccion tamano="chico" onClick={agregarCuenta}>
                        + Agregar cuenta
                      </BotonAccion>
                    </div>
                  </div>
                ) : (
                  <BotonAgregarOtra onClick={() => setFormCuenta(true)}>
                    + Agregar otra cuenta
                  </BotonAgregarOtra>
                )}
              </Seccion>

              <Seccion titulo="Comisión">
                {verComision ? (
                  <ElegirComision
                    cupones={cupones}
                    valor={cupon}
                    onCambio={setCupon}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 font-semibold text-foreground">
                      {cupon
                        ? `Cupón ${cupon.nombre} · ${cupon.duracion_dias ? `${cupon.duracion_dias} días` : "sin vencimiento"}`
                        : "Tarifa estándar"}
                    </span>
                    {cupones?.some((c) => !c.es_default) ? (
                      <BotonAccion
                        tono="neutro"
                        tamano="chico"
                        onClick={() => setVerComision(true)}
                      >
                        Cambiar
                      </BotonAccion>
                    ) : (
                      <span className="text-chico text-muted-foreground">
                        No hay cupones activos
                      </span>
                    )}
                  </div>
                )}
              </Seccion>

              {trabajando || guardando ? (
                <ul className="mt-6 space-y-1.5 border-t border-border pt-5 text-sm">
                  {[
                    ["fotos", "Fotos de identidad"],
                    ...tarjetas.map((t) => [
                      `ft-${t.id}`,
                      `Foto de la tarjeta ${t.banco} •••• ${t.ultimos4}`,
                    ]),
                    [
                      "registro",
                      "Cliente, tarjetas y cuentas registrados y activos",
                    ],
                  ].map(([clave, texto]) => (
                    <li key={clave} className="flex items-center gap-2">
                      {progreso[clave] ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : trabajando ? (
                        <Rueda className="h-4 w-4" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border-2 border-border" />
                      )}
                      <span
                        className={
                          progreso[clave]
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {texto}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">
                  Al activar, la cuenta queda lista para operar
                  {tarjetas.length || tarjetaEscrita
                    ? " y sus tarjetas verificadas"
                    : ""}
                  . Lo que dejaste escrito sin pulsar «Agregar» también se
                  guarda. Queda registrado con tu nombre.
                </p>
              )}
            </Paso>
          )}
        </div>

        {/* Pie: atrás / siguiente */}
        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3 sm:px-7">
          {paso > 0 && k !== "activar" ? (
            <BotonAccion tono="neutro" onClick={atras} disabled={trabajando}>
              ← Atrás
            </BotonAccion>
          ) : k === "activar" ? (
            <BotonAccion
              tono="neutro"
              onClick={() => ir(2)}
              disabled={trabajando || guardando}
            >
              ← Atrás
            </BotonAccion>
          ) : (
            <span />
          )}
          <span className="ml-auto" />
          {k === "correo" ? null : k === "activar" ? (
            <BotonAccion
              onClick={activar}
              cargando={trabajando}
              icono={<Check className="h-4 w-4" />}
            >
              {guardando ? "Continuar activación" : "Activar cliente"}
            </BotonAccion>
          ) : (
            <BotonAccion onClick={siguiente} cargando={trabajando}>
              {k === "datos" && !cuenta
                ? "Enviar código a su correo →"
                : "Siguiente →"}
            </BotonAccion>
          )}
        </div>
      </div>
    </div>
  );
}

/** Los pasos arriba, con el actual resaltado. */
function Pasos({ paso, cuenta }) {
  return (
    <ol
      className="mb-4 flex gap-1.5 overflow-x-auto pb-1"
      aria-label={`Paso ${paso + 1} de ${PASOS.length}`}
    >
      {PASOS.map((p, i) => {
        const hecho = i < paso || (cuenta && i <= 1);
        const actual = i === paso;
        return (
          <li key={p.k} className="flex min-w-[88px] flex-1 flex-col gap-1.5">
            <span
              className={cn(
                "h-1.5 rounded-full transition-colors",
                hecho || actual ? "bg-marca-700" : "bg-border",
              )}
            />
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "cifras flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold",
                  hecho && !actual
                    ? "bg-emerald-500 text-white"
                    : actual
                      ? "bg-marca-700 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {hecho && !actual ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "truncate text-xs font-semibold",
                  actual ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {p.t}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Paso({ titulo, indicacion, children }) {
  return (
    <section>
      <h2 className="font-heading text-xl font-semibold text-foreground">
        {titulo}
      </h2>
      <p className="mt-1 flex items-center gap-2 text-sm text-marca-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-marca-50 text-xs font-bold">
          i
        </span>
        {indicacion}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Seccion({ titulo, extra, children }) {
  return (
    <section className="mt-6 border-t border-border pt-5">
      <h3 className="mb-3 flex items-baseline gap-2 font-heading text-base font-semibold text-foreground">
        {titulo}
        {extra && (
          <span className="text-chico font-normal text-muted-foreground">
            {extra}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function BotonAgregarOtra({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 w-full rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-marca-700 transition hover:border-marca-300 hover:bg-marca-50/40"
    >
      {children}
    </button>
  );
}

function Lista({ items, vacio, onQuitar }) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="space-y-2">
      {items.map((x) => (
        <li
          key={x.id}
          className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5"
        >
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {x.titulo}
            </span>
            <span className="cifras block truncate text-chico text-muted-foreground">
              {x.detalle}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onQuitar(x.id)}
            className="text-chico font-semibold text-red-700 hover:underline"
          >
            Quitar
          </button>
        </li>
      ))}
    </ul>
  );
}

function Fila({ t, v, onEditar }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-2 text-chico text-muted-foreground">
        {t}
        {onEditar && (
          <button
            type="button"
            onClick={onEditar}
            className="font-semibold text-marca-700 hover:underline"
          >
            Editar
          </button>
        )}
      </dt>
      <dd className="break-words font-medium text-foreground">{v || "—"}</dd>
    </div>
  );
}

/**
 * Tarifa estándar o un cupón activo. Cada opción muestra sus tasas
 * agrupadas ("1 %: BCP · BBVA") y, en Scotiabank y BanBif, la de hoy.
 * Lo que un cupón no define se cobra con la tarifa estándar.
 */
function ElegirComision({ cupones, valor, onCambio }) {
  if (cupones === null)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Rueda className="h-4 w-4" /> Cargando tarifas...
      </p>
    );
  const estandar = cupones.find((c) => c.es_default);
  const opciones = [
    {
      id: null,
      nombre: "Tarifa estándar",
      detalle: "La de siempre, sin vencimiento.",
      bancos: estandar?.bancos || [],
    },
    ...cupones
      .filter((c) => !c.es_default)
      .map((c) => ({
        ...c,
        detalle: c.duracion_dias
          ? `Por ${c.duracion_dias} días desde hoy.`
          : "Sin vencimiento.",
      })),
  ];
  const pct = (n) =>
    `${Number(n)
      .toFixed(2)
      .replace(/\.?0+$/, "")} %`;
  const resumen = (bancos) => {
    const grupos = new Map();
    for (const b of bancos) {
      const k = `${b.porcentaje}|${b.porcentaje_hoy ?? ""}`;
      grupos.set(k, [...(grupos.get(k) || []), b.banco]);
    }
    return [...grupos.entries()]
      .sort((a, b) => Number(a[0].split("|")[0]) - Number(b[0].split("|")[0]))
      .map(([k, lista]) => {
        const [p, h] = k.split("|");
        return `${pct(p)}${h ? ` (${pct(h)} hoy)` : ""}: ${lista.map(nombreBanco).join(" · ")}`;
      });
  };

  return (
    <div className="space-y-2.5" role="radiogroup" aria-label="Comisión">
      {opciones.map((o) => {
        const activa = (valor?.id || null) === o.id;
        return (
          <button
            key={o.id || "estandar"}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onCambio(o.id ? o : null)}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition",
              activa
                ? "border-marca-700 bg-marca-50/60"
                : "border-border hover:border-marca-300",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                activa ? "border-marca-700" : "border-border",
              )}
              aria-hidden
            >
              {activa && (
                <span className="h-2.5 w-2.5 rounded-full bg-marca-700" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">
                  {o.nombre}
                </span>
                {!o.id && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Lo normal
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-chico text-muted-foreground">
                {o.detalle}
                {o.descripcion ? ` ${o.descripcion}` : ""}
              </span>
              {o.bancos?.length > 0 && (
                <span className="cifras mt-2 block space-y-0.5 text-chico text-foreground">
                  {resumen(o.bancos).map((linea) => (
                    <span key={linea} className="block">
                      {linea}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </button>
        );
      })}
      {opciones.length === 1 && (
        <p className="text-chico text-muted-foreground">
          No hay cupones activos. Se crean en Comisiones.
        </p>
      )}
      <p className="text-chico text-muted-foreground">
        Lo que un cupón no incluya se cobra con la tarifa estándar. Una comisión
        especial por banco la da administración desde Clientes.
      </p>
    </div>
  );
}

/**
 * Contraseña con "Ver / Ocultar" a la vista: muchos clientes son
 * personas mayores y necesitan comprobar lo que escribieron. Letra
 * grande y un botón amplio, fácil de tocar.
 */
function EntradaClave({ id, valor, onCambio }) {
  const [ver, setVer] = useState(false);
  return (
    <span className="relative flex items-center">
      <input
        id={id}
        type={ver ? "text" : "password"}
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="campo h-12 pr-24 text-lg tracking-wide"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Ocultar contraseña" : "Ver contraseña"}
        aria-pressed={ver}
        className="absolute right-1.5 flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-marca-700 transition hover:bg-marca-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          {ver ? (
            <>
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
            </>
          ) : (
            <>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            </>
          )}
        </svg>
        {ver ? "Ocultar" : "Ver"}
      </button>
    </span>
  );
}
