import { io } from "socket.io-client";
import { supabase } from "./supabase";

/**
 * Chat de atención dentro del app (pantalla app/chat.js).
 *
 * Habla con el chat propio (AlToque Chat) por su API de clientes, la
 * misma que usa el chat de la web: no hay página web incrustada, la
 * pantalla es del app.
 *
 *   1. Identidad: la función chatwoot-identidad de Supabase firma quién
 *      es el cliente (canal "app") con la clave secreta de la bandeja.
 *      Con esa firma el chat abre su sesión: nadie puede escribir
 *      haciéndose pasar por otro, y el cliente ve el mismo historial que
 *      tendría en cualquier otro teléfono.
 *   2. Mensajes: se leen y se envían por la API; los nuevos llegan en
 *      vivo por una conexión abierta mientras la pantalla está a la vista.
 *   3. Con el app cerrado, el aviso llega como notificación del teléfono
 *      (función chatwoot-avisos → tabla notificaciones → push).
 *
 * La sesión del chat vive solo en memoria: al cerrar sesión se olvida
 * (olvidarChat, lo llama lib/sesion.js).
 */
export const CHAT_URL = "https://chat2.panel-admin-atk-mobil.com";
// Token público de la bandeja "App AlToque" (no es secreto: solo dice a qué bandeja se escribe).
const BANDEJA = "qEDI4P0IrqYSal-85aq9TPQB";

let sesion = null; // { token, userId, contacto }
let abriendo = null;
let conexion = null;

class ErrorChat extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

async function pedir(ruta, { metodo = "GET", cuerpo, form, token } = {}) {
  let r;
  try {
    r = await fetch(`${CHAT_URL}/api/widget${ruta}`, {
      method: metodo,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(cuerpo && { "Content-Type": "application/json" }),
      },
      body: form || (cuerpo ? JSON.stringify(cuerpo) : undefined),
    });
  } catch {
    throw new ErrorChat("No hay conexión con el chat. Revisa tu internet e inténtalo de nuevo.", "sin_red");
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401) sesion = null; // la sesión caducó: la próxima vez se vuelve a abrir
    throw new ErrorChat(j?.message || "El chat no está disponible en este momento.", j?.error || String(r.status));
  }
  return j;
}

/** Abre (o reutiliza) la sesión del chat para el cliente que tiene la sesión del app. */
export async function abrirSesion() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ErrorChat("Ingresa a tu cuenta para escribirnos.", "sin_sesion");
  if (sesion?.userId === user.id) return sesion;
  if (!abriendo) {
    abriendo = (async () => {
      const { data, error } = await supabase.functions.invoke("chatwoot-identidad", {
        body: { canal: "app", proveedor: "propio" },
      });
      if (error || !data?.identifier_hash) throw new ErrorChat("No pudimos confirmar tu identidad para el chat. Inténtalo de nuevo.", "identidad");
      const r = await pedir("/session", {
        metodo: "POST",
        cuerpo: {
          token: BANDEJA,
          identifier: data.identifier,
          identifier_hash: data.identifier_hash,
          name: data.name,
          email: data.email,
          phone: data.phone_number,
        },
      });
      sesion = { token: r.session_token, userId: user.id, contacto: r.contact };
      return sesion;
    })().finally(() => {
      abriendo = null;
    });
  }
  return abriendo;
}

/** Con sesión, y si caducó a mitad de camino, la abre otra vez y reintenta. */
async function conSesion(fn) {
  const s = await abrirSesion();
  try {
    return await fn(s.token);
  } catch (e) {
    if (e.codigo !== "session_invalid") throw e;
    const nueva = await abrirSesion();
    return fn(nueva.token);
  }
}

/** Horario, mensaje fuera de horario, nombre con el que atienden y límites de la bandeja. */
export const configuracion = () => pedir(`/config?token=${BANDEJA}`);

/** Historial (hasta 80) y la conversación actual. antes: id del mensaje más viejo ya cargado. */
export const leerMensajes = (antes) =>
  conSesion((token) => pedir(`/messages?limit=80${antes ? `&before=${antes}` : ""}`, { token }));

/**
 * Envía un mensaje. fotos: [{ uri, nombre, tipo }] ya preparadas (lib/imagen.js).
 * pantalla: desde dónde escribe ("App · Solicitudes"), para que el asesor lo vea.
 */
export function enviarMensaje({ texto = "", fotos = [], pantalla }) {
  return conSesion((token) => {
    const contexto = { pagina: pantalla || "App", navegador: "App AlToque" };
    if (!fotos.length) return pedir("/messages", { metodo: "POST", cuerpo: { content: texto, context: contexto }, token });
    const form = new FormData();
    form.append("content", texto);
    form.append("context", JSON.stringify(contexto));
    for (const f of fotos) form.append("files", { uri: f.uri, name: f.nombre, type: f.tipo });
    return pedir("/messages", { metodo: "POST", form, token });
  });
}

/** El cliente vio la conversación: al asesor le sale "Visto". */
export const marcarVisto = () => conSesion((token) => pedir("/seen", { metodo: "POST", token })).catch(() => {});

/** Calificación de la atención (1 a 5), cuando el asesor cierra la conversación. */
export const calificar = (conversacion, nota) =>
  conSesion((token) => pedir("/csat", { metodo: "POST", cuerpo: { conversation_id: conversacion, rating: nota }, token }));

/**
 * Conexión en vivo. alEvento(tipo, dato) recibe:
 *   "mensaje" (nuevo), "cambio" (editado o borrado), "escribiendo" (bool),
 *   "conversacion" ({ id, status }), "conectado" (bool).
 * Devuelve una función para desconectar (al salir de la pantalla).
 */
export async function conectar(alEvento) {
  const s = await abrirSesion();
  conexion?.disconnect();
  const socket = io(CHAT_URL, { auth: { widgetToken: s.token }, transports: ["websocket"], reconnectionDelayMax: 8000 });
  conexion = socket;
  socket.on("connect", () => alEvento("conectado", true));
  socket.on("disconnect", () => alEvento("conectado", false));
  socket.on("message.created", (m) => alEvento("mensaje", m));
  socket.on("message.updated", (m) => alEvento("cambio", m));
  socket.on("typing", (d) => alEvento("escribiendo", Boolean(d?.on)));
  socket.on("conversation.updated", (c) => alEvento("conversacion", c));
  return () => {
    socket.disconnect();
    if (conexion === socket) conexion = null;
  };
}

/** Avisa al asesor que el cliente está escribiendo (o dejó de hacerlo). */
export function avisarEscribiendo(si) {
  conexion?.emit("typing", { on: Boolean(si) });
}

/** Al cerrar sesión: el siguiente en este teléfono no hereda el chat. */
export function olvidarChat() {
  conexion?.disconnect();
  conexion = null;
  sesion = null;
}
