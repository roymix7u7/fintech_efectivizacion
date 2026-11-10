/**
 * Firma la identidad del cliente para el chat de atención (Chatwoot).
 *
 * El chat solo es para clientes con sesión. Para que Chatwoot sepa con
 * certeza quién escribe, cada bandeja exige un HMAC del identificador
 * hecho con su token secreto. Ese token no puede ir al navegador ni al
 * app: quien lo tuviera podría hacerse pasar por cualquier cliente. Por
 * eso la firma se hace aquí.
 *
 * El identificador es el id de la cuenta (uuid): no cambia y no es un
 * dato personal. Con el mismo id, la web y el app caen en el mismo
 * contacto de Chatwoot.
 *
 * Lee el perfil con la sesión de quien llama, no con la clave de
 * servicio: solo necesita ver lo suyo, y así las políticas siguen
 * mandando.
 *
 * Secretos (uno por bandeja; se copian de Chatwoot → bandeja →
 * Configuración → Validación de identidad):
 *   npx supabase secrets set CHATWOOT_HMAC_WEB=... CHATWOOT_HMAC_APP=...
 *
 * Despliegue:
 *   npx supabase functions deploy chatwoot-identidad
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cada canal tiene su bandeja y su token.
const SECRETOS: Record<string, string> = {
  web: "CHATWOOT_HMAC_WEB",
  app: "CHATWOOT_HMAC_APP",
};

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
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
  const firma = await crypto.subtle.sign(
    "HMAC",
    llave,
    new TextEncoder().encode(mensaje),
  );
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Celular peruano en formato internacional (+519XXXXXXXX). Chatwoot
 * rechaza teléfonos que no estén así; si el guardado no calza, mejor
 * no mandarlo que romper la identificación.
 */
function celularE164(telefono: string | null) {
  const d = (telefono ?? "").replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, "");
  return /^9\d{8}$/.test(d) ? `+51${d}` : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");

  let canal = "";
  try {
    canal = (await req.json())?.canal ?? "";
  } catch {
    // Sin cuerpo: se responde abajo como canal desconocido.
  }
  const nombreSecreto = SECRETOS[canal];
  if (!nombreSecreto) {
    return responder(
      { error: 'Indica el canal: "web" o "app".', detalle: "canal_invalido" },
      400,
    );
  }

  const secreto = Deno.env.get(nombreSecreto);
  const faltantes = [
    !url && "SUPABASE_URL",
    !anon && "SUPABASE_ANON_KEY",
    !secreto && nombreSecreto,
  ].filter(Boolean);
  if (faltantes.length > 0) {
    return responder(
      {
        error: "Faltan variables de entorno en la función: " + faltantes.join(", "),
        detalle: "sin_variables",
      },
      500,
    );
  }

  // ── Quién está llamando ──
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return responder({ error: "Falta la sesión.", detalle: "sin_cabecera" }, 401);
  }

  const comoUsuario = createClient(url!, anon!, {
    global: { headers: { Authorization: auth } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error: errorSesion,
  } = await comoUsuario.auth.getUser();

  if (errorSesion || !user) {
    return responder(
      { error: "Tu sesión no es válida o caducó.", detalle: "sesion_invalida" },
      401,
    );
  }

  const [{ data: cuenta, error: e1 }, { data: perfil, error: e2 }] =
    await Promise.all([
      comoUsuario.from("users").select("rol, estado").eq("id", user.id).maybeSingle(),
      comoUsuario
        .from("perfiles_cliente")
        .select("nombres, apellidos, telefono")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (e1 || e2) {
    return responder(
      {
        error: "No se pudo leer tu perfil: " + (e1 ?? e2)!.message,
        detalle: "fallo_consulta",
      },
      500,
    );
  }
  // El chat es para clientes. El personal atiende desde Chatwoot.
  if (!cuenta || cuenta.rol !== "cliente") {
    return responder(
      { error: "El chat es solo para clientes.", detalle: "no_cliente" },
      403,
    );
  }
  if (cuenta.estado === "bloqueado") {
    return responder(
      { error: "Tu cuenta está bloqueada.", detalle: "bloqueado" },
      403,
    );
  }

  const nombre = perfil
    ? `${perfil.nombres ?? ""} ${perfil.apellidos ?? ""}`.trim()
    : "";

  return responder({
    identifier: user.id,
    identifier_hash: await hmacHex(secreto!, user.id),
    name: nombre || user.email,
    email: user.email,
    phone_number: celularE164(perfil?.telefono ?? null),
  });
});
