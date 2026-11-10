/**
 * Avisa al cliente cuando su asesor le responde por el chat, aunque haya
 * cerrado la página: notificación del navegador (web push) y aviso en la
 * campana de Mi cuenta (que además llega al app por el disparador de
 * notificaciones).
 *
 * La llama Chatwoot (webhook "message_created" de la cuenta, lo crea
 * configurar.rb) y firma cada llamada: aquí se comprueba la firma antes de
 * leer nada. Solo cuenta cuando un asesor escribe de verdad: no las notas
 * privadas, ni los saludos automáticos, ni la encuesta.
 *
 * El cliente sale del identificador del contacto, que es el id de su
 * cuenta (lo firma chatwoot-identidad). Los visitantes sin cuenta no
 * tienen identificador: a ellos no se les avisa por aquí.
 *
 * Secretos:
 *   npx supabase secrets set CHATWOOT_AVISOS_SECRETO=... \
 *     VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
 *     VAPID_SUBJECT=mailto:contacto@altoqueperu.com \
 *     SITIO_URL=https://www.panel-admin-atk-mobil.com
 *
 * Despliegue (Chatwoot no manda sesión de Supabase; la seguridad es la firma):
 *   npx supabase functions deploy chatwoot-avisos --no-verify-jwt
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// La firma vale 5 minutos: una llamada vieja copiada no sirve.
const VENTANA_SEGUNDOS = 300;
// Varios mensajes seguidos del asesor dejan un solo aviso en la campana.
const CAMPANA_CADA_MINUTOS = 15;

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacHex(clave: string, mensaje: string) {
  const llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compara sin filtrar por tiempo cuántos caracteres coinciden. */
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

async function firmaValida(req: Request, cuerpo: string, secreto: string) {
  const ts = req.headers.get("x-chatwoot-timestamp") ?? "";
  const firma = req.headers.get("x-chatwoot-signature") ?? "";
  const segundos = Number(ts);
  if (!Number.isFinite(segundos) || Math.abs(Date.now() / 1000 - segundos) > VENTANA_SEGUNDOS) return false;
  const esperada = `sha256=${await hmacHex(secreto, `${ts}.${cuerpo}`)}`;
  return iguales(firma, esperada);
}

/** Lo que dice la notificación: el inicio del mensaje, o qué envió. */
function textoDe(m: Record<string, any>) {
  const texto = String(m.content ?? "").replace(/\s+/g, " ").trim();
  if (texto) return texto.length > 140 ? `${texto.slice(0, 137)}...` : texto;
  const adjunto = m.attachments?.[0]?.file_type;
  if (adjunto === "image") return "Te envió una foto.";
  if (adjunto) return "Te envió un archivo.";
  return "Tienes un mensaje nuevo.";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const secreto = Deno.env.get("CHATWOOT_AVISOS_SECRETO");
  const vapidPublica = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivada = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!secreto || !vapidPublica || !vapidPrivada) {
    console.error("chatwoot-avisos: faltan secretos");
    return responder({ error: "Sin configurar" }, 500);
  }

  const cuerpo = await req.text();
  if (cuerpo.length > 200_000 || !(await firmaValida(req, cuerpo, secreto))) {
    return responder({ error: "Firma inválida" }, 401);
  }

  let m: Record<string, any>;
  try {
    m = JSON.parse(cuerpo);
  } catch {
    return responder({ error: "JSON inválido" }, 400);
  }

  // Solo un mensaje de un asesor, visible para el cliente.
  const esDelAsesor =
    m.event === "message_created" &&
    m.message_type === "outgoing" &&
    !m.private &&
    m.sender?.type === "user";
  const cliente = m.conversation?.meta?.sender?.identifier;
  if (!esDelAsesor || typeof cliente !== "string" || !UUID.test(cliente)) {
    return responder({ ok: true, omitido: true });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const texto = textoDe(m);
  const titulo = "Tu asesor te respondió";

  // Campana de Mi cuenta (y el app): uno cada tanto, no uno por mensaje.
  const desde = new Date(Date.now() - CAMPANA_CADA_MINUTOS * 60_000).toISOString();
  const { count } = await sb
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("user_id", cliente)
    .eq("tipo", "chat")
    .eq("leida", false)
    .gte("created_at", desde);
  if (!count) {
    const { error } = await sb.from("notificaciones").insert({
      user_id: cliente,
      tipo: "chat",
      titulo,
      cuerpo: `${texto} Ábrelo en el chat de Mi cuenta.`,
      canales_enviados: ["web"],
    });
    if (error) console.error("chatwoot-avisos: campana", error.message);
  }

  // Notificación del navegador, a cada navegador donde la activó.
  const { data: navegadores, error } = await sb
    .from("avisos_navegador")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", cliente);
  if (error) {
    console.error("chatwoot-avisos: navegadores", error.message);
    return responder({ ok: false }, 500);
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:contacto@altoqueperu.com",
    vapidPublica,
    vapidPrivada,
  );
  const sitio = (Deno.env.get("SITIO_URL") ?? "").replace(/\/$/, "");
  const aviso = JSON.stringify({
    titulo,
    cuerpo: texto,
    url: `${sitio}/cuenta?chat=1`,
    etiqueta: `chat-${m.conversation?.id ?? ""}`,
  });

  let enviados = 0;
  const vencidos: string[] = [];
  const usados: string[] = [];
  await Promise.all(
    (navegadores ?? []).map(async (n) => {
      try {
        await webpush.sendNotification(
          { endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } },
          aviso,
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
        enviados++;
        usados.push(n.id);
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode;
        // 404/410: el navegador ya no existe o quitó el permiso.
        if (estado === 404 || estado === 410) vencidos.push(n.id);
        else console.error("chatwoot-avisos: envío", estado, (e as Error).message);
      }
    }),
  );
  if (vencidos.length) await sb.from("avisos_navegador").delete().in("id", vencidos);
  if (usados.length) {
    await sb.from("avisos_navegador").update({ usado_en: new Date().toISOString() }).in("id", usados);
  }

  return responder({ ok: true, enviados, vencidos: vencidos.length });
});
