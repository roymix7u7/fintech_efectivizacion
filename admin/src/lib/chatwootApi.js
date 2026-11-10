import { createClient } from "@supabase/supabase-js";

/**
 * Solo servidor: llamadas a la API de Chatwoot con la clave de un
 * administrador (CHATWOOT_API_TOKEN) y comprobación de la sesión del
 * panel de quien pide. La usan las rutas de /api/atencion.
 */
export const CW_URL = (process.env.CHATWOOT_URL || process.env.NEXT_PUBLIC_CHATWOOT_URL || "").replace(/\/$/, "");
const CW_TOKEN = process.env.CHATWOOT_API_TOKEN;
export const CW_CUENTA = process.env.CHATWOOT_ACCOUNT_ID || "1";

export const chatwootConfigurado = () => Boolean(CW_URL && CW_TOKEN);

export const responder = (cuerpo, status = 200) => Response.json(cuerpo, { status });

/** Llama a la API de Chatwoot. ":cuenta" en la ruta se reemplaza por la cuenta. */
export async function cw(ruta, { metodo = "GET", cuerpo, params } = {}) {
  const url = new URL(`${CW_URL}${ruta.replace(":cuenta", CW_CUENTA)}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(`${k}[]`, x));
    else if (v != null) url.searchParams.set(k, v);
  }
  const r = await fetch(url, {
    method: metodo,
    headers: { api_access_token: CW_TOKEN, ...(cuerpo && { "Content-Type": "application/json" }) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  if (!r.ok) {
    let detalle = "";
    try {
      const j = await r.json();
      detalle = j.message || j.error || (Array.isArray(j.errors) ? j.errors.join(", ") : "");
    } catch {}
    throw new Error(`Chatwoot respondió ${r.status} en ${metodo} ${ruta.split("?")[0]}${detalle ? `: ${detalle}` : ""}`);
  }
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}

/** Lista de una respuesta de Chatwoot, venga como arreglo o como { payload }. */
export const lista = (x) => (Array.isArray(x) ? x : x?.payload || []);

/**
 * Quién pide, según su sesión del panel. Devuelve { sb, user, yo } o
 * { error: Response } listo para devolver.
 */
export async function sesionDe(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: responder({ error: "Falta la sesión." }, 401) };
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await sb.auth.getUser(token);
  if (!user) return { error: responder({ error: "Tu sesión caducó. Vuelve a ingresar." }, 401) };
  const { data: yo } = await sb.from("users").select("rol, estado, sede_id").eq("id", user.id).maybeSingle();
  if (!yo || yo.estado === "bloqueado" || yo.rol === "cliente") {
    return { error: responder({ error: "Esto es solo para el personal." }, 403) };
  }
  return { sb, user, yo };
}

/** Rol en Chatwoot según el rol del panel. */
export const ROL_CHATWOOT = { admin: "administrator", supervisor: "administrator", gestor: "agent", pagos: "agent" };

/** Disponibilidad del panel → la de Chatwoot. */
export const DISPONIBILIDAD_CHATWOOT = { en_linea: "online", ocupado: "busy", desconectado: "offline" };
