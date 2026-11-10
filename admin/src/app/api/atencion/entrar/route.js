import {
  cw,
  cwPlataforma,
  lista,
  responder,
  sesionDe,
  chatwootConfigurado,
  plataformaConfigurada,
  claveAlAzar,
} from "@/lib/chatwootApi";

/**
 * "Abrir chat de atención": deja al personal dentro de Chatwoot sin una
 * segunda contraseña. La única que usan es la del panel.
 *
 *   1. Comprueba la sesión del panel de quien pide (y que no esté bloqueado).
 *   2. Comprueba que en Equipo tenga "Atiende chat" (chat_personal).
 *   3. Comprueba que ya esté en la cuenta de Chatwoot (lo pone Sincronizar).
 *   4. Pide a Chatwoot un enlace de entrada: sirve una sola vez y caduca a
 *      los 5 minutos. La web lo abre de inmediato.
 *
 * Quien deja de atender el chat (o es bloqueado) ya no puede entrar por
 * aquí desde ese momento.
 */
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!chatwootConfigurado() || !plataformaConfigurada()) {
    return responder(
      { error: "La entrada desde el panel no está configurada (CHATWOOT_PLATFORM_TOKEN). Entra a Chatwoot con tu usuario y contraseña." },
      503,
    );
  }
  const s = await sesionDe(req);
  if (s.error) return s.error;

  const { data: marca, error } = await s.sb.from("chat_personal").select("activo").eq("user_id", s.user.id).maybeSingle();
  if (error) return responder({ error: "No se pudo comprobar tu acceso al chat." }, 500);
  if (!marca?.activo) {
    return responder({ error: "No tienes acceso al chat. Pide a un supervisor que active \"Chat\" para ti en Equipo." }, 403);
  }

  const correo = (s.user.email || "").toLowerCase();
  try {
    const agentes = lista(await cw("/api/v1/accounts/:cuenta/agents"));
    const agente = agentes.find((a) => (a.email || "").toLowerCase() === correo);
    if (!agente) {
      return responder(
        { error: "Todavía no estás en el chat. Pide a un supervisor que toque \"Sincronizar chat\" en Equipo." },
        409,
      );
    }
    // Con su correo, Chatwoot encuentra a la persona y la deja a cargo de
    // esta app (no cambia su contraseña si ya tenía una).
    const usuario = await cwPlataforma("/users", {
      metodo: "POST",
      cuerpo: { email: correo, name: agente.name, password: claveAlAzar() },
    });
    const { url } = await cwPlataforma(`/users/${usuario.id}/login`);
    if (!url) throw new Error("Chatwoot no devolvió el enlace.");
    return responder({ url });
  } catch (e) {
    return responder({ error: "No se pudo abrir el chat. " + e.message }, 502);
  }
}
