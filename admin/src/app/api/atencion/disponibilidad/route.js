import { cw, lista, responder, sesionDe, chatwootConfigurado, DISPONIBILIDAD_CHATWOOT } from "@/lib/chatwootApi";
import { chat, chatPropioConfigurado, agentePorCorreo, DISPONIBILIDAD_CHAT } from "@/lib/chatApi";

/**
 * Lleva la disponibilidad del panel (en línea / ocupado / desconectado)
 * al chat, para quien atiende el chat: un solo interruptor para los dos.
 *
 * Lo llama el panel después de cada cambio (lib/disponibilidad.js). El
 * estado se lee de la base, no de lo que mande el navegador.
 *
 * Chatwoot además pone "desconectado" a quien no tiene el chat abierto:
 * marcarse en línea en el panel no asigna chats si Chatwoot está cerrado.
 */
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!chatwootConfigurado() && !chatPropioConfigurado()) return responder({ ok: true, chatwoot: null });
  const s = await sesionDe(req);
  if (s.error) return s.error;

  const [{ data: d }, { data: c }] = await Promise.all([
    s.sb.from("disponibilidad_personal").select("estado").eq("user_id", s.user.id).maybeSingle(),
    s.sb.from("chat_personal").select("activo").eq("user_id", s.user.id).maybeSingle(),
  ]);
  if (!c?.activo) return responder({ ok: true, chatwoot: null }); // no atiende el chat

  // Chat propio: la disponibilidad la fija el panel y nada más (el chat no
  // desconecta a nadie por tener su pestaña cerrada).
  if (chatPropioConfigurado()) {
    try {
      const agente = await agentePorCorreo(s.user.email);
      if (!agente) return responder({ ok: true, chatwoot: null, aviso: "Todavía no está en el chat: sincroniza desde Equipo." });
      const disponibilidad = DISPONIBILIDAD_CHAT[d?.estado] || "offline";
      await chat(`/v1/agents/${agente.id}`, { metodo: "PATCH", cuerpo: { availability: disponibilidad } });
      return responder({ ok: true, chatwoot: disponibilidad });
    } catch (e) {
      return responder({ ok: false, error: "No se pudo actualizar el chat: " + e.message }, 502);
    }
  }

  try {
    const correo = (s.user.email || "").toLowerCase();
    const agente = lista(await cw("/api/v1/accounts/:cuenta/agents")).find((a) => (a.email || "").toLowerCase() === correo);
    if (!agente) return responder({ ok: true, chatwoot: null, aviso: "Todavía no está en Chatwoot: sincroniza desde Equipo." });
    const disponibilidad = DISPONIBILIDAD_CHATWOOT[d?.estado] || "offline";
    await cw(`/api/v1/accounts/:cuenta/agents/${agente.id}`, { metodo: "PATCH", cuerpo: { availability: disponibilidad } });
    return responder({ ok: true, chatwoot: disponibilidad });
  } catch (e) {
    return responder({ ok: false, error: "No se pudo actualizar el chat: " + e.message }, 502);
  }
}
