/**
 * Carga del chat de Chatwoot en el navegador, compartida por las dos
 * puertas de la web:
 *   · Mi cuenta (components/cliente/soporte.jsx): clientes con sesión,
 *     identidad firmada.
 *   · La landing (components/sitio/contacto.jsx): visitantes sin cuenta.
 *
 * Son bandejas distintas pero el SDK de Chatwoot es uno solo por página.
 * Si se pasa de una a otra sin recargar (de la landing a Mi cuenta), se
 * desmonta la anterior y se olvida su conversación antes de cargar la
 * nueva: así un visitante nunca termina escribiendo en la bandeja de
 * clientes verificados, ni al revés.
 */
const BASE = process.env.NEXT_PUBLIC_CHATWOOT_URL?.replace(/\/$/, "");

export const chatDisponible = (token) => Boolean(BASE && token);

let actual = null; // { token, promesa }

function desmontar() {
  try {
    window.$chatwoot?.reset();
  } catch {}
  document
    .querySelectorAll(".woot-widget-holder, .woot--bubble-holder, script[data-chatwoot]")
    .forEach((el) => el.remove());
  delete window.$chatwoot;
  delete window.chatwootSDK;
  actual = null;
}

/**
 * "Atrás" cierra el chat en vez de salir de la página. En el celular el
 * chat ocupa toda la pantalla y la gente aprieta atrás (no la X) para
 * volver a su cuenta.
 *
 * Al abrirse el chat se agrega un paso al historial (misma dirección, con
 * el estado de Next intacto). Atrás consume ese paso y cierra el chat; si
 * se cierra con la X, se quita el paso para que el siguiente atrás haga lo
 * de siempre.
 */
let atrasListo = false;
function cerrarConAtras() {
  if (atrasListo || typeof window === "undefined") return;
  atrasListo = true;
  let pasoDelChat = false;
  let ignorarProximo = false;

  window.addEventListener("chatwoot:opened", () => {
    if (pasoDelChat) return;
    window.history.pushState({ ...(window.history.state || {}), atkChat: true }, "");
    pasoDelChat = true;
  });
  window.addEventListener("chatwoot:closed", () => {
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
        window.$chatwoot?.toggle("close");
      } catch {}
    }
  });
}

/** Carga el chat de esa bandeja (una sola vez por pestaña) y devuelve $chatwoot. */
export function cargarChatwoot(token, ajustes = {}) {
  cerrarConAtras();
  if (actual?.token === token) return actual.promesa;
  if (actual) desmontar();
  const promesa = new Promise((resolve, reject) => {
    window.chatwootSettings = {
      hideMessageBubble: true,
      locale: "es",
      position: "right",
      type: "standard",
      ...ajustes,
    };
    window.addEventListener("chatwoot:ready", () => resolve(window.$chatwoot), { once: true });
    const s = document.createElement("script");
    s.src = `${BASE}/packs/js/sdk.js`;
    s.async = true;
    s.dataset.chatwoot = "1";
    s.onload = () => window.chatwootSDK.run({ websiteToken: token, baseUrl: BASE });
    s.onerror = () => {
      actual = null;
      reject(new Error("No se pudo cargar el chat."));
    };
    document.body.appendChild(s);
  });
  actual = { token, promesa };
  return promesa;
}

/** Cierra la ventana y oculta la burbuja, sin olvidar la conversación. */
export function esconderChatwoot() {
  try {
    window.$chatwoot?.toggle("close");
    window.$chatwoot?.toggleBubbleVisibility("hide");
  } catch {}
}

/** Olvida la conversación (cerrar sesión): el siguiente no la ve. */
export function olvidarChatwoot() {
  esconderChatwoot();
  try {
    window.$chatwoot?.reset();
  } catch {}
}
