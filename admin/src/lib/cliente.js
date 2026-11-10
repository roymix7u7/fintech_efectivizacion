"use client";

import { createClient } from "@supabase/supabase-js";
import { olvidarChat } from "@/components/cliente/soporte";
import { quitarAvisosNavegador } from "@/lib/avisosNavegador";

/**
 * Sesión del CLIENTE en la web (registro, ingreso y Mi cuenta).
 *
 * Es la misma base y las mismas tablas que usa la app: una cuenta creada
 * aquí entra en la app y al revés. Va con su propia llave de
 * almacenamiento ("atk-cliente") para no mezclarse con la sesión del
 * panel del equipo si ambas se abren en el mismo navegador.
 */
let instancia = null;

export function supabaseCliente() {
  if (!instancia) {
    instancia = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: "atk-cliente",
        },
      },
    );
  }
  return instancia;
}

/**
 * Duración máxima de la sesión: dos horas desde que se escribió la
 * contraseña, igual que en la app (app/src/lib/sesion.js). Es un plazo
 * absoluto: usar la página no lo renueva.
 */
export const DURACION_SESION_MS = 2 * 60 * 60 * 1000;
const CLAVE = "atk-cliente:inicio";

export function marcarInicioSesion() {
  try {
    localStorage.setItem(CLAVE, String(Date.now()));
  } catch {}
}

export function tiempoRestante() {
  try {
    const guardado = Number(localStorage.getItem(CLAVE));
    if (!guardado) return 0;
    return Math.max(0, guardado + DURACION_SESION_MS - Date.now());
  } catch {
    return 0;
  }
}

export async function cerrarSesionCliente() {
  // El chat también se olvida: el siguiente en esta PC no ve la
  // conversación del anterior.
  olvidarChat();
  // Y deja de recibir los avisos del chat en este navegador (antes de
  // cerrar la sesión: hace falta para quitarlo).
  // Con tope: si el servicio de avisos tarda, la salida no espera.
  await Promise.race([quitarAvisosNavegador(supabaseCliente()), new Promise((r) => setTimeout(r, 1500))]);
  try {
    await supabaseCliente().auth.signOut();
  } catch {}
  try {
    localStorage.removeItem(CLAVE);
  } catch {}
}

/**
 * Motivo del bloqueo. Se lee con la sesión todavía abierta: después,
 * las políticas ya no dejan ver el perfil.
 */
export async function motivoDelBloqueo(userId) {
  try {
    const { data } = await supabaseCliente()
      .from("perfiles_cliente")
      .select("motivo_bloqueo")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.motivo_bloqueo || null;
  } catch {
    return null;
  }
}

/** Desde dónde se aceptaron los documentos legales. */
export function datosDispositivo() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Otro";
  const sistema = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "macOS"
          : "Otro";
  return { plataforma: "web", sistema, modelo: navegador, app: "web" };
}

/** Documentos legales vigentes (se leen sin sesión). */
export async function documentosVigentes() {
  const { data, error } = await supabaseCliente()
    .from("documentos_vigentes")
    .select("id, tipo, version, titulo, resumen, borrador, publicado_en");
  if (error) throw error;
  return data || [];
}

export async function aceptarDocumentos(ids) {
  const limpios = [...new Set((ids || []).filter(Boolean))];
  if (!limpios.length) return { ok: true };
  const { data, error } = await supabaseCliente().rpc("aceptar_documentos", {
    p_documentos: limpios,
    p_dispositivo: datosDispositivo(),
  });
  if (error) throw error;
  return data;
}

const BUCKET_KYC = "kyc-documentos";

/**
 * Sube las tres fotos de identidad. Si una falla, borra las ya subidas:
 * no se deja a nadie con documentos a medias. Devuelve los paths
 * (nunca URLs firmadas, que caducan).
 */
export async function subirFotosIdentidad(userId, fotos, conSufijo = false) {
  const sb = supabaseCliente();
  const subidos = [];
  const paths = {};
  try {
    for (const key of ["dni_frontal", "dni_posterior", "selfie"]) {
      const path = conSufijo
        ? `${userId}/${key}-${Date.now()}.jpg`
        : `${userId}/${key}.jpg`;
      const { error } = await sb.storage
        .from(BUCKET_KYC)
        .upload(path, fotos[key].blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (error) throw error;
      subidos.push(path);
      paths[key] = path;
    }
    return paths;
  } catch (e) {
    if (subidos.length)
      await sb.storage
        .from(BUCKET_KYC)
        .remove(subidos)
        .catch(() => {});
    throw e;
  }
}

/** Errores de Supabase en palabras que se entienden (igual que la app). */
export function mensajeError(error) {
  if (!error) return "Ocurrió un error inesperado.";
  const msg = error.message || String(error);
  const traducciones = {
    "Invalid login credentials": "Correo o contraseña incorrectos.",
    "Email not confirmed": "Debes confirmar tu correo antes de ingresar.",
    "User already registered": "Ese correo ya tiene una cuenta.",
    "Token has expired or is invalid": "El código expiró o no es válido.",
    "For security purposes, you can only request this after":
      "Espera un minuto antes de pedir otro código.",
    "Email rate limit exceeded":
      "Pediste muchos códigos seguidos. Espera unos minutos.",
    "New password should be different":
      "La contraseña nueva debe ser distinta de la anterior.",
    "Failed to fetch": "Sin conexión con el servidor. Revisa tu internet.",
  };
  for (const [clave, texto] of Object.entries(traducciones)) {
    if (msg.includes(clave)) return texto;
  }
  if (msg.includes("perfiles_cliente_dni_unico"))
    return "Ese documento ya está registrado en otra cuenta.";
  if (msg.includes("users_email_key")) return "Ese correo ya tiene una cuenta.";
  return msg;
}

/** Sube una imagen ya convertida a JPEG a la carpeta del cliente. */
export async function subirImagen(bucket, path, blob) {
  const { error } = await supabaseCliente()
    .storage.from(bucket)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

export async function borrarImagenes(bucket, paths) {
  const lista = (paths || []).filter(Boolean);
  if (lista.length)
    await supabaseCliente()
      .storage.from(bucket)
      .remove(lista)
      .catch(() => {});
}

/** Código legible de la solicitud, igual que la app: SOL-AAAAMMDD-XXXXXX. */
export function generarCodigo() {
  const d = new Date();
  const fecha = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const azar = crypto.getRandomValues(new Uint32Array(6));
  return `SOL-${fecha}-${Array.from(azar, (n) => abc[n % abc.length]).join("")}`;
}

/** Lo que se le dice sobre cuándo se le deposita (hora de Lima, lunes a sábado de 9 a 18). */
export function plazoDeposito(ahora = new Date()) {
  const lima = new Date(ahora.getTime() - 5 * 3600 * 1000);
  const dia = lima.getUTCDay();
  const hora = lima.getUTCHours();
  const laborable = dia >= 1 && dia <= 6;
  if (laborable && hora >= 9 && hora < 18)
    return "Normalmente te depositamos en 1 hora.";
  const cuando =
    laborable && hora < 9
      ? "hoy"
      : dia === 6 || dia === 0
        ? "el lunes"
        : "mañana";
  return `Estamos fuera de horario: la atendemos ${cuando} en el transcurso de la mañana.`;
}

/**
 * Alertas del servicio al aire ("el BCP no está procesando hoy"), con la
 * marca de si este cliente ya las vio. Igual que app/src/lib/alertas.js:
 * la vigencia la filtra la base y alertas_vistas solo trae las propias.
 * Nunca lanza: no poder leerlas no puede tumbar la página.
 */
export async function listarAlertas() {
  try {
    const { data, error } = await supabaseCliente()
      .from("alertas_sistema")
      .select(
        "id, titulo, mensaje, tipo, fecha_inicio, fecha_fin, alertas_vistas(vista_en)",
      )
      .eq("categoria", "alerta")
      .order("fecha_inicio", { ascending: false });
    if (error) return [];
    return (data || []).map((a) => ({
      ...a,
      vista: (a.alertas_vistas || []).length > 0,
    }));
  } catch {
    return [];
  }
}

/** Las marca como vistas (las mismas que la app deja de resaltar). */
export async function marcarAlertasVistas(userId, ids) {
  const limpios = [...new Set((ids || []).filter(Boolean))];
  if (!userId || !limpios.length) return;
  await supabaseCliente()
    .from("alertas_vistas")
    .upsert(
      limpios.map((alerta_id) => ({ alerta_id, user_id: userId })),
      { onConflict: "alerta_id,user_id", ignoreDuplicates: true },
    )
    .then(
      () => {},
      () => {},
    );
}

/**
 * ¿El correo o el documento ya tienen una cuenta? Responde solo sí o no
 * (función verificar_registro de la base, sin datos de la cuenta).
 * Devuelve { email, dni } con true / false / null, o null si no se pudo
 * consultar: en ese caso el formulario sigue y la base lo frena al final.
 */
export async function verificarRegistro({ email = null, dni = null }) {
  try {
    const { data, error } = await supabaseCliente().rpc("verificar_registro", {
      p_email: email,
      p_dni: dni,
    });
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
