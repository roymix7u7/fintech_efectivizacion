import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

/**
 * Entrar con la huella o el rostro.
 *
 * El correo y la contraseña se guardan en la caja segura del teléfono
 * (Keystore en Android, Keychain en iPhone) atados a la biometría: el
 * sistema solo los entrega después de que el dueño pone su huella o su
 * rostro. Con eso el app ingresa como siempre (signInWithPassword), así
 * que la base, el bloqueo del app y el resto del ingreso no
 * cambian.
 *
 * Cuándo deja de servir, y por qué:
 *   · Se agrega o se quita una huella (o cambia el rostro): el sistema
 *     invalida la llave y la lectura devuelve null. Así nadie puede
 *     registrar su dedo en un teléfono ajeno y entrar.
 *   · Cambia la contraseña: el ingreso falla y se apaga.
 *   · El cliente la apaga en Mi cuenta.
 * En los tres casos se borra lo guardado y se pide la contraseña.
 *
 * No usa el prefijo "atk:" a propósito: limpiarCache borra todo lo que
 * lo lleva al cerrar sesión, y la biometría tiene que sobrevivir a eso
 * (es justo para volver a entrar).
 */

// expo-local-authentication no existe en web: se carga solo en el teléfono.
const LA = Platform.OS === "web" ? null : require("expo-local-authentication");
const SecureStore = Platform.OS === "web" ? null : require("expo-secure-store");

// Lo que queda a la vista sin pedir la huella: de quién es y si está
// activa. La contraseña nunca va aquí.
const ESTADO = "bio:estado";
// Quien dijo "Ahora no" a la oferta, por correo: no se le vuelve a preguntar.
const RECHAZOS = "bio:rechazos";

// Lo protegido. Va en su propio servicio del Keychain: la documentación
// de SecureStore pide no mezclar llaves con y sin autenticación.
const LLAVE = "bio-acceso";
const OPCIONES = {
  keychainService: "altoque-biometria",
  requireAuthentication: true,
  // Solo en este teléfono y solo si tiene bloqueo de pantalla: no viaja
  // a copias de seguridad ni a otro iPhone.
  keychainAccessible: SecureStore?.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
};

/**
 * Qué ofrece este teléfono.
 *
 * Devuelve { disponible, tipo, nombre, icono, motivo }:
 *   tipo    "huella" | "rostro"
 *   nombre  cómo se le dice al cliente ("tu huella", "Face ID")
 *   motivo  por qué no está disponible, si no lo está
 *
 * Solo cuenta la biometría fuerte (la que acepta la caja segura): en
 * muchos Android el desbloqueo con la cara es una foto 2D y el sistema
 * no deja proteger datos con él.
 */
export async function capacidad() {
  const no = (motivo) => ({ disponible: false, tipo: "huella", nombre: "tu huella", icono: "finger-print", motivo });
  if (!LA || !SecureStore) return no("web");
  try {
    const [hardware, inscrito, tipos] = await Promise.all([
      LA.hasHardwareAsync(),
      LA.isEnrolledAsync(),
      LA.supportedAuthenticationTypesAsync(),
    ]);
    if (!hardware) return no("sin_hardware");
    if (!inscrito) return no("sin_inscribir");
    if (!SecureStore.canUseBiometricAuthentication()) return no("debil");

    const huella = tipos.includes(LA.AuthenticationType.FINGERPRINT);
    const rostro = tipos.includes(LA.AuthenticationType.FACIAL_RECOGNITION);
    // En iPhone, con Face ID no hay huella. En Android se prefiere la
    // huella: es la que casi siempre es fuerte.
    if (rostro && (Platform.OS === "ios" || !huella)) {
      return {
        disponible: true,
        tipo: "rostro",
        nombre: Platform.OS === "ios" ? "Face ID" : "tu rostro",
        icono: "scan-outline",
        motivo: null,
      };
    }
    return {
      disponible: true,
      tipo: "huella",
      nombre: Platform.OS === "ios" ? "Touch ID" : "tu huella",
      icono: "finger-print",
      motivo: null,
    };
  } catch {
    return no("error");
  }
}

/** { email, nombre, activadaEn } si está activa en este teléfono; si no, null. */
export async function estadoBiometria() {
  try {
    const crudo = await AsyncStorage.getItem(ESTADO);
    const e = crudo ? JSON.parse(crudo) : null;
    return e?.email ? e : null;
  } catch {
    return null;
  }
}

/**
 * Traduce lo que devuelve el sistema a un motivo que la pantalla sabe
 * explicar. Los textos vienen del módulo nativo (Android: "User canceled
 * the authentication", "Lockout"; iPhone: "User canceled the operation").
 */
function motivoDe(error) {
  const m = String(error?.message || error || "").toLowerCase();
  if (/cancel|negative|user fallback|app_cancel|system_cancel/.test(m)) return "cancelado";
  if (/lockout permanent|biometry is locked|biometrylockout/.test(m)) return "bloqueo_total";
  if (/lockout|too many/.test(m)) return "bloqueo";
  if (/nsfaceidusagedescription|missingplistkey/.test(m)) return "sin_permiso_faceid";
  if (/no biometrics|not enrolled|no device credential|passcode not set/.test(m)) return "sin_inscribir";
  if (/timeout/.test(m)) return "tiempo";
  return "error";
}

/**
 * Activa la biometría para este correo y contraseña.
 *
 * Pide la huella para confirmar: en Android la pide el propio guardado
 * (la llave se crea atada a ella); en iPhone el Keychain solo la exige
 * al leer, así que se pide antes para que activar también la confirme.
 */
export async function activarBiometria({ email, clave, nombre }) {
  const cap = await capacidad();
  if (!cap.disponible) return { ok: false, motivo: cap.motivo };
  try {
    if (Platform.OS === "ios") {
      const r = await LA.authenticateAsync({
        promptMessage: `Activa ${cap.nombre} para entrar a AlToque`,
        cancelLabel: "Cancelar",
        disableDeviceFallback: true,
      });
      if (!r.success) return { ok: false, motivo: motivoDe(r.error) };
    }
    // Lo anterior se borra primero: si la llave quedó invalidada por un
    // cambio de huellas, escribir encima falla.
    await SecureStore.deleteItemAsync(LLAVE, OPCIONES).catch(() => {});
    await SecureStore.setItemAsync(
      LLAVE,
      JSON.stringify({ email: email.trim().toLowerCase(), clave }),
      { ...OPCIONES, authenticationPrompt: `Confirma con ${cap.nombre} para activarla` },
    );
    await AsyncStorage.setItem(
      ESTADO,
      JSON.stringify({ email: email.trim().toLowerCase(), nombre: nombre || null, activadaEn: Date.now() }),
    );
    await olvidarRechazo(email);
    return { ok: true, motivo: null };
  } catch (e) {
    return { ok: false, motivo: motivoDe(e) };
  }
}

/**
 * Pide la huella y devuelve el acceso guardado.
 *
 * { ok: true, email, clave } o { ok: false, motivo }. Si la llave ya no
 * sirve (cambiaron las huellas del teléfono), la apaga aquí mismo.
 */
export async function leerAcceso() {
  const estado = await estadoBiometria();
  if (!estado) return { ok: false, motivo: "inactiva" };

  const cap = await capacidad();
  if (!cap.disponible) {
    // Quitó todas sus huellas o el bloqueo de pantalla: lo guardado ya
    // no se puede leer nunca más.
    if (cap.motivo === "sin_inscribir" || cap.motivo === "debil") {
      await desactivarBiometria();
      return { ok: false, motivo: "invalidada" };
    }
    return { ok: false, motivo: cap.motivo };
  }

  try {
    const crudo = await SecureStore.getItemAsync(LLAVE, {
      ...OPCIONES,
      authenticationPrompt: "Ingresa a AlToque",
    });
    if (!crudo) {
      await desactivarBiometria();
      return { ok: false, motivo: "invalidada" };
    }
    const datos = JSON.parse(crudo);
    if (!datos?.email || !datos?.clave) {
      await desactivarBiometria();
      return { ok: false, motivo: "invalidada" };
    }
    return { ok: true, email: datos.email, clave: datos.clave };
  } catch (e) {
    return { ok: false, motivo: motivoDe(e) };
  }
}

/** Borra lo guardado. Nunca falla: si no había nada, no pasa nada. */
export async function desactivarBiometria() {
  try {
    await SecureStore?.deleteItemAsync(LLAVE, OPCIONES);
  } catch {}
  try {
    await AsyncStorage.removeItem(ESTADO);
  } catch {}
}

/** Apaga la biometría solo si es de este correo (al cambiar su contraseña). */
export async function desactivarSiEsDe(email) {
  const e = await estadoBiometria();
  if (e && e.email === String(email || "").trim().toLowerCase()) await desactivarBiometria();
}

/** "rosa.perez@gmail.com" -> "ro•••@gmail.com": se reconoce sin mostrarse entero. */
export function correoOculto(email) {
  const [usuario, dominio] = String(email || "").split("@");
  if (!dominio) return email || "";
  return `${usuario.slice(0, Math.min(2, usuario.length))}•••@${dominio}`;
}

/** El error de Supabase cuando la contraseña no es la correcta (o ya cambió). */
export const esClaveIncorrecta = (error) =>
  error?.code === "invalid_credentials" || /invalid login credentials/i.test(error?.message || "");

/**
 * Comprueba la contraseña sin tocar la sesión abierta.
 *
 * Para activar desde Mi cuenta: hay que saber que la contraseña es la
 * correcta antes de guardarla. Se usa un cliente aparte y sin memoria,
 * así la sesión del app no cambia, y esa sesión de
 * prueba se cierra enseguida.
 */
export async function verificarClave(email, clave) {
  const prueba = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await prueba.auth.signInWithPassword({
    email: String(email || "").trim().toLowerCase(),
    password: clave,
  });
  if (error) return { ok: false, error };
  await prueba.auth.signOut({ scope: "local" }).catch(() => {});
  return { ok: true, error: null };
}

/** El cliente dijo "Ahora no": no se le vuelve a ofrecer al ingresar. */
export async function recordarRechazo(email) {
  try {
    const lista = JSON.parse((await AsyncStorage.getItem(RECHAZOS)) || "[]");
    const correo = String(email || "").trim().toLowerCase();
    if (!lista.includes(correo)) await AsyncStorage.setItem(RECHAZOS, JSON.stringify([...lista, correo]));
  } catch {}
}

async function olvidarRechazo(email) {
  try {
    const lista = JSON.parse((await AsyncStorage.getItem(RECHAZOS)) || "[]");
    const correo = String(email || "").trim().toLowerCase();
    await AsyncStorage.setItem(RECHAZOS, JSON.stringify(lista.filter((c) => c !== correo)));
  } catch {}
}

/** ¿Se le ofrece activar a quien acaba de ingresar con su contraseña? */
export async function convieneOfrecer(email) {
  const cap = await capacidad();
  if (!cap.disponible) return null;
  const correo = String(email || "").trim().toLowerCase();
  const estado = await estadoBiometria();
  if (estado?.email === correo) return null;
  try {
    const lista = JSON.parse((await AsyncStorage.getItem(RECHAZOS)) || "[]");
    if (lista.includes(correo)) return null;
  } catch {}
  return cap;
}

/**
 * Qué decirle al cliente según el motivo. null = no decir nada (canceló
 * él mismo).
 */
export function mensajeBiometria(motivo, nombre = "tu huella") {
  switch (motivo) {
    case "cancelado":
      return null;
    case "invalidada":
      return `Cambiaron las huellas o el rostro de este teléfono. Por seguridad, ingresa con tu contraseña y vuelve a activar ${nombre}.`;
    case "clave_cambio":
      return `Tu contraseña cambió. Ingresa con la nueva y vuelve a activar ${nombre}.`;
    case "bloqueo":
      return "Demasiados intentos. Espera unos segundos o ingresa con tu contraseña.";
    case "bloqueo_total":
      return "Tu teléfono bloqueó la biometría por demasiados intentos. Desbloquéalo con tu PIN y vuelve a intentar, o ingresa con tu contraseña.";
    case "sin_inscribir":
      return "Tu teléfono no tiene huella ni rostro registrado. Agrégalo en los ajustes del teléfono.";
    case "debil":
      return "El desbloqueo de este teléfono no es lo bastante seguro para proteger tu acceso. Usa una huella.";
    case "sin_hardware":
      return "Este teléfono no tiene lector de huella ni de rostro.";
    case "sin_permiso_faceid":
      return "Face ID no está disponible en esta versión del app. Ingresa con tu contraseña.";
    case "tiempo":
      return "Se acabó el tiempo para poner tu huella. Vuelve a intentarlo.";
    default:
      return "No pudimos usar tu huella. Ingresa con tu contraseña.";
  }
}
