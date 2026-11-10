import { cw, lista, responder, sesionDe, chatwootConfigurado, DISPONIBILIDAD_CHATWOOT } from "@/lib/chatwootApi";

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
  if (!chatwootConfigurado()) return responder({ ok: true, chatwoot: null });
  const s = await sesionDe(req);
  if (s.error) return s.error;

  const [{ data: d }, { data: c }] = await Promise.all([
    s.sb.from("disponibilidad_personal").select("estado").eq("user_id", s.user.id).maybeSingle(),
    s.sb.from("chat_personal").select("activo").eq("user_id", s.user.id).maybeSingle(),
  ]);
  if (!c?.activo) return responder({ ok: true, chatwoot: null }); // no atiende el chat

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
