/**
 * Elimina una cuenta del personal desde Equipo.
 *
 * Solo un administrador. La base decide qué pasa (dar_de_baja_personal,
 * migración 074):
 *   · Si la persona nunca hizo nada (cuenta de prueba sin uso), se borra
 *     por completo, también su acceso.
 *   · Si ya tiene trabajo registrado, se da de baja: no puede entrar más,
 *     sale de Equipo y su correo queda libre; su historial se conserva.
 *
 * Antes de llamar, el panel la saca del chat (Chatwoot). Nadie puede
 * eliminarse a sí mismo ni dejar el sistema sin administrador.
 *
 * Se puede repetir si algo falla a mitad.
 *
 * Despliegue:
 *   npx supabase functions deploy eliminar-staff
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Quién pide ──
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return responder({ error: "Falta la sesión." }, 401);
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const {
    data: { user: quien },
  } = await comoUsuario.auth.getUser();
  if (!quien) return responder({ error: "Tu sesión caducó. Vuelve a ingresar." }, 401);

  const admin = createClient(url, servicio, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: yo } = await admin.from("users").select("rol, estado, baja_en").eq("id", quien.id).maybeSingle();
  if (!yo || yo.rol !== "admin" || yo.estado === "bloqueado" || yo.baja_en) {
    return responder({ error: "Solo un administrador puede eliminar cuentas del personal." }, 403);
  }

  // ── A quién ──
  let id = "";
  try {
    id = String((await req.json())?.id ?? "");
  } catch {
    // sin cuerpo
  }
  if (!UUID.test(id)) return responder({ error: "Falta la persona a eliminar." }, 400);
  if (id === quien.id) return responder({ error: "No puedes eliminar tu propia cuenta." }, 400);

  const { data: persona } = await admin.from("users").select("email, rol").eq("id", id).maybeSingle();
  if (!persona) return responder({ error: "Esa persona ya no existe." }, 404);
  if (persona.rol === "cliente") return responder({ error: "Esta cuenta es de un cliente, no del personal." }, 400);

  if (persona.rol === "admin") {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("rol", "admin")
      .eq("estado", "activo")
      .is("baja_en", null)
      .neq("id", id);
    if (!count) return responder({ error: "Es el único administrador activo: crea otro antes de eliminarlo." }, 400);
  }

  // ── La base decide: borrar o dar de baja ──
  const { data: resultado, error } = await admin.rpc("dar_de_baja_personal", { p_user: id });
  if (error) return responder({ error: "No se pudo eliminar: " + error.message }, 500);

  if (resultado === "borrar" || resultado === "no_existe") {
    const { error: e } = await admin.auth.admin.deleteUser(id);
    if (e && !/not.*found/i.test(e.message)) {
      return responder({ error: "Se quitó del sistema, pero no su acceso: " + e.message + ". Vuelve a intentarlo." }, 500);
    }
    return responder({ ok: true, resultado: "borrada", email: persona.email });
  }

  // Baja: su correo queda libre y ya no puede ingresar.
  const { error: e } = await admin.auth.admin.updateUserById(id, {
    email: `baja-${id}@baja.altoque.invalid`,
    email_confirm: true,
    ban_duration: "876000h",
  });
  if (e) return responder({ error: "Quedó de baja, pero no se pudo cerrar su acceso: " + e.message + ". Vuelve a intentarlo." }, 500);
  return responder({ ok: true, resultado: "baja", email: persona.email });
});
