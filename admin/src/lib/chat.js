/**
 * Chat de atención en el navegador, para las dos puertas de la web:
 *   · "web": Mi cuenta (components/cliente/soporte.jsx), clientes con
 *     sesión e identidad firmada.
 *   · "visitantes": la landing (components/sitio/contacto.jsx), sin cuenta.
 *
 * Hay dos proveedores y esta es la única pieza que sabe cuál se usa:
 *   · El chat propio (AlToque Chat), si existe NEXT_PUBLIC_CHAT_URL.
 *   · Chatwoot (lib/chatwoot.js), si no.
 * Para volver a Chatwoot basta quitar NEXT_PUBLIC_CHAT_URL y desplegar.
 *
 * Las pantallas no tocan window.chat ni window.$chatwoot: usan lo que
 * devuelve cargarChat() y los eventos de EVENTOS.
 */
import { chatDisponible as cwDisponible, cargarChatwoot, esconderChatwoot, olvidarChatwoot } from "./chatwoot";

const PROPIO = process.env.NEXT_PUBLIC_CHAT_URL?.replace(/\/$/, "");
export const CHAT_PROPIO = Boolean(PROPIO);

const TOKENS = CHAT_PROPIO
  ? { web: process.env.NEXT_PUBLIC_CHAT_WEB_TOKEN, visitantes: process.env.NEXT_PUBLIC_CHAT_VISITANTES_TOKEN }
  : { web: process.env.NEXT_PUBLIC_CHATWOOT_WEB_TOKEN, visitantes: process.env.NEXT_PUBLIC_CHATWOOT_VISITANTES_TOKEN };

/** Qué firma pedir a la función chatwoot-identidad: cada proveedor tiene su clave. */
export const PROVEEDOR = CHAT_PROPIO ? "propio" : "chatwoot";

export const chatDisponible = (canal) => (CHAT_PROPIO ? Boolean(TOKENS[canal]) : cwDisponible(TOKENS[canal]));

/** Eventos en window, iguales para los dos proveedores. */
export const EVENTOS = { abierto: "atk-chat:abierto", cerrado: "atk-chat:cerrado", uso: "atk-chat:uso" };

const PUENTE = {
  "chatwoot:opened": EVENTOS.abierto,
  "chatwoot:closed": EVENTOS.cerrado,
  "chatwoot:on-start-conversation": EVENTOS.uso,
  "chat:opened": EVENTOS.abierto,
  "chat:closed": EVENTOS.cerrado,
  "chat:sent": EVENTOS.uso,
};
if (typeof window !== "undefined" && !window.__atkChatPuente) {
  window.__atkChatPuente = true;
  for (const [origen, destino] of Object.entries(PUENTE)) {
    window.addEventListener(origen, () => window.dispatchEvent(new CustomEvent(destino)));
  }
}

let actual = null; // { canal, promesa, api }

/** El chat cargado en esta pestaña, o null. */
export const chatActual = () => actual?.api || null;

// ───────────────────────── Chat propio ─────────────────────────

let scriptPropio = null;
function cargarScript() {
  if (window.chat?.__sdk) return Promise.resolve();
  if (scriptPropio) return scriptPropio;
  scriptPropio = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${PROPIO}/widget.js`;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      scriptPropio = null;
      reject(new Error("No se pudo cargar el chat."));
    };
    document.body.appendChild(s);
  });
  return scriptPropio;
}

/**
 * "Atrás" cierra el chat en vez de salir de la página (en el celular el
 * chat ocupa toda la pantalla). Misma idea que en lib/chatwoot.js: al
 * abrirse se agrega un paso al historial; atrás lo consume y cierra.
 */
let atrasListo = false;
function cerrarConAtras() {
  if (atrasListo) return;
  atrasListo = true;
  let pasoDelChat = false;
  let ignorarProximo = false;
  window.addEventListener("chat:opened", () => {
    if (pasoDelChat) return;
    window.history.pushState({ ...(window.history.state || {}), atkChat: true }, "");
    pasoDelChat = true;
  });
  window.addEventListener("chat:closed", () => {
    if (!pasoDelChat) return;
    pasoDelChat = false;
    if (window.history.state?.atkChat) {
      ignorarProximo = true;
      window.history.back();
    }
  });
  window.addEventListener("popstate", () => {
    if (ignorarProximo) {
      ignorarProximo = false;
      return;
    }
    if (pasoDelChat) {
      pasoDelChat = false;
      try {
        window.chat?.close();
      } catch {}
    }
  });
}

const apiPropia = () => ({
  abrir: () => window.chat?.open(),
  cerrar: () => window.chat?.close(),
  mostrarBurbuja: () => window.chat?.showBubble(),
  ocultarBurbuja: () => window.chat?.hideBubble(),
  /** datos: lo que devuelve la función chatwoot-identidad. */
  identificar: ({ identifier, identifier_hash, name, email, phone_number }) =>
    window.chat?.setUser(identifier, { identifier_hash, name, email, phone: phone_number || undefined }),
  atributos: (valores) => window.chat?.setAttributes(valores),
});

async function cargarPropio(canal, titulo) {
  await cargarScript();
  cerrarConAtras();
  await new Promise((resolve, reject) => {
    const listo = () => {
      window.removeEventListener("chat:error", fallo);
      resolve();
    };
    const fallo = (e) => {
      window.removeEventListener("chat:ready", listo);
      reject(new Error(e.detail?.message || "No se pudo cargar el chat."));
    };
    window.addEventListener("chat:ready", listo, { once: true });
    window.addEventListener("chat:error", fallo, { once: true });
    window.chat.init({ token: TOKENS[canal], baseUrl: PROPIO, hideBubble: true, launcherTitle: titulo });
  });
  return apiPropia();
}

// ───────────────────────── Chatwoot ─────────────────────────

const apiChatwoot = (cw) => ({
  abrir: () => cw.toggle("open"),
  cerrar: () => cw.toggle("close"),
  mostrarBurbuja: () => cw.toggleBubbleVisibility("show"),
  ocultarBurbuja: () => cw.toggleBubbleVisibility("hide"),
  identificar: ({ identifier, phone_number, ...datos }) => cw.setUser(identifier, phone_number ? { ...datos, phone_number } : datos),
  atributos: (valores) => cw.setCustomAttributes(valores),
});

// ───────────────────────── Lo que usan las pantallas ─────────────────────────

/**
 * Carga el chat de ese canal (una sola vez por pestaña) y devuelve
 * { abrir, cerrar, mostrarBurbuja, ocultarBurbuja, identificar, atributos }.
 * La burbuja nace oculta. Si en la pestaña estaba el otro canal (de la
 * landing a Mi cuenta sin recargar), se desmonta y se olvida su
 * conversación antes de cargar el nuevo.
 */
export function cargarChat(canal, { titulo } = {}) {
  if (actual?.canal === canal) return actual.promesa;
  const registro = { canal, api: null };
  if (CHAT_PROPIO) {
    if (actual) {
      try {
        window.chat?.destroy();
      } catch {}
    }
    registro.promesa = cargarPropio(canal, titulo);
  } else {
    // lib/chatwoot.js ya desmonta el anterior cuando cambia el token.
    registro.promesa = cargarChatwoot(TOKENS[canal], { launcherTitle: titulo }).then(apiChatwoot);
  }
  registro.promesa = registro.promesa.then(
    (api) => {
      registro.api = api;
      return api;
    },
    (e) => {
      if (actual === registro) actual = null;
      throw e;
    },
  );
  actual = registro;
  return registro.promesa;
}

/** Cierra la ventana y oculta la burbuja, sin olvidar la conversación. */
export function esconderChat() {
  if (!CHAT_PROPIO) return esconderChatwoot();
  try {
    window.chat?.close();
    window.chat?.hideBubble();
  } catch {}
}

/** Olvida la conversación (cerrar sesión): el siguiente no la ve. */
export function olvidarChat() {
  if (!CHAT_PROPIO) return olvidarChatwoot();
  esconderChat();
  try {
    window.chat?.reset();
  } catch {}
}
