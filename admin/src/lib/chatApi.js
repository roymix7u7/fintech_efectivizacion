/**
 * Solo servidor: llamadas a la API del chat propio (AlToque Chat) con un
 * token de administrador (CHAT_API_TOKEN), que no puede llegar al
 * navegador. La usan las rutas de /api/atencion cuando el chat propio
 * está configurado; si no, esas rutas siguen hablando con Chatwoot
 * (lib/chatwootApi.js).
 *
 * La sesión del panel de quien pide se comprueba igual en los dos casos:
 * sesionDe() y responder() salen de lib/chatwootApi.js.
 */
export const CHAT_URL = (process.env.CHAT_URL || process.env.NEXT_PUBLIC_CHAT_URL || "").replace(/\/$/, "");
const CHAT_TOKEN = process.env.CHAT_API_TOKEN;

export const chatPropioConfigurado = () => Boolean(CHAT_URL && CHAT_TOKEN);

/** Llama a la API del chat: chat("/v1/agents"), chat("/sso", { metodo: "POST", cuerpo }). */
export async function chat(ruta, { metodo = "GET", cuerpo, params } = {}) {
  const url = new URL(`${CHAT_URL}/api${ruta}`);
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") url.searchParams.set(k, v);
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${CHAT_TOKEN}`, ...(cuerpo && { "Content-Type": "application/json" }) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  if (!r.ok) {
    let detalle = "";
    try {
      detalle = (await r.json()).message || "";
    } catch {}
    throw new Error(`El chat respondió ${r.status} en ${metodo} ${ruta}${detalle ? `: ${detalle}` : ""}`);
  }
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}

/** Enlace a una conversación en el panel del chat. */
export const enlaceConversacion = (id) => `${CHAT_URL}/app/?c=${id}`;

/**
 * Rol en el chat según el rol del panel. "jefe" ve todas las
 * conversaciones y los reportes, y no recibe chats solos; "asesor" entra
 * al reparto.
 */
export const ROL_CHAT = { admin: "jefe", supervisor: "jefe", gestor: "asesor", pagos: "asesor" };

/** Disponibilidad del panel → la del chat. */
export const DISPONIBILIDAD_CHAT = { en_linea: "online", ocupado: "busy", desconectado: "offline" };

/** El asesor del chat con ese correo, o undefined. */
export async function agentePorCorreo(correo) {
  const agentes = await chat("/v1/agents");
  return agentes.find((a) => (a.email || "").toLowerCase() === String(correo || "").toLowerCase());
}
