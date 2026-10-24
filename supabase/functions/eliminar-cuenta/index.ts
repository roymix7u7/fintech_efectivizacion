/**
 * Elimina la cuenta de un cliente que lo pidió desde la app.
 *
 * Vive en el servidor porque hace dos cosas que la base no puede:
 *   1. Borrar las fotos del documento, la selfie y las tarjetas (Storage
 *      no deja borrar archivos con SQL).
 *   2. Quitar el acceso: borra el usuario de Auth.
 * Lo del medio, anonimizar los datos personales, lo hace la base
 * (anonimizar_cliente) con la sesión del administrador que llama, así
 * queda en la auditoría con su nombre.
 *
 * Se conservan los comprobantes y el registro de operaciones: la
 * prevención del lavado de activos obliga a guardarlos.
 *
 * Se puede volver a llamar si algo falla a mitad: cada paso tolera que
 * el anterior ya se haya hecho.
 *
 * La función comprueba por su cuenta que quien llama es administrador.
 * No se fía de lo que diga el panel.
 *
 * Despliegue:
 *   npx supabase functions deploy eliminar-cuenta
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Lo que identifica a la persona. Los comprobantes NO van aquí.
const BUCKETS_PERSONALES = ["kyc-documentos", "tarjetas-fotos"];

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !servicio) {
    return responder({ error: "Faltan variables de entorno en la función." }, 500);
  }

  // ── Quién llama ──
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return responder({ error: "Falta la sesión." }, 401);

  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const {
    data: { user: quienLlama },
  } = await comoUsuario.auth.getUser();
  if (!quienLlama) return responder({ error: "Tu sesión no es válida o caducó." }, 401);

  const admin = createClient(url, servicio, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: yo } = await admin.from("users").select("rol, estado").eq("id", quienLlama.id).maybeSingle();
  if (yo?.rol !== "admin" || yo?.estado !== "activo") {
    return responder({ error: "Eliminar cuentas es del administrador." }, 403);
  }

  // ── Qué solicitud ──
  let cuerpo: { solicitud_id?: string } = {};
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "Cuerpo inválido." }, 400);
  }
  const solicitudId = cuerpo.solicitud_id;
  if (!solicitudId) return responder({ error: "Falta solicitud_id." }, 400);

  const { data: sol, error: eSol } = await admin
    .from("solicitudes_datos")
    .select("id, user_id, tipo, estado")
    .eq("id", solicitudId)
    .maybeSingle();
  if (eSol || !sol) return responder({ error: "Esa solicitud no existe." }, 404);
  if (sol.tipo !== "eliminacion") return responder({ error: "No es un pedido de eliminación." }, 400);
  if (!["pendiente", "en_proceso", "completada"].includes(sol.estado)) {
    return responder({ error: `La solicitud está ${sol.estado}.` }, 409);
  }

  // Antes de tocar nada: si tiene operaciones abiertas, la base se va a
  // negar a anonimizar. Mejor saberlo antes de borrar las fotos.
  const { data: perfil } = await admin.from("perfiles_cliente").select("id").eq("user_id", sol.user_id).maybeSingle();
  if (perfil && sol.estado !== "completada") {
    const { count } = await admin
      .from("solicitudes")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", perfil.id)
      .in("estado", ["pendiente", "aprobado"]);
    if (count) {
      return responder(
        { error: `Tiene ${count} solicitud(es) en curso. Resuélvelas antes de eliminar la cuenta.` },
        409,
      );
    }
  }

  // ── 1. Fotos ──
  // Cada cliente sube a su propia carpeta: <user_id>/...
  let borradas = 0;
  for (const bucket of BUCKETS_PERSONALES) {
    const { data: archivos, error: eLista } = await admin.storage.from(bucket).list(sol.user_id, { limit: 1000 });
    if (eLista) return responder({ error: `No se pudieron listar las fotos de ${bucket}: ${eLista.message}` }, 500);
    const rutas = (archivos || []).filter((a) => a.name).map((a) => `${sol.user_id}/${a.name}`);
    if (rutas.length) {
      const { error: eBorrar } = await admin.storage.from(bucket).remove(rutas);
      if (eBorrar) return responder({ error: `No se pudieron borrar las fotos de ${bucket}: ${eBorrar.message}` }, 500);
      borradas += rutas.length;
    }
  }

  // ── 2. Datos personales (con la sesión del administrador) ──
  const { data: anon_, error: eAnon } = await comoUsuario.rpc("anonimizar_cliente", { p_solicitud: sol.id });
  if (eAnon) return responder({ error: eAnon.message }, 409);

  // ── 3. Acceso ──
  const { error: eAuth } = await admin.auth.admin.deleteUser(sol.user_id);
  // Si ya no existía (segundo intento), no es un error.
  if (eAuth && !/not found/i.test(eAuth.message)) {
    return responder({ error: `Datos anonimizados, pero no se pudo quitar el acceso: ${eAuth.message}` }, 500);
  }

  return responder({ ok: true, fotos_borradas: borradas, resultado: anon_ });
});
