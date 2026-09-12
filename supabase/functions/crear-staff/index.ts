/**
 * Crea una cuenta de personal desde el panel.
 *
 * Por qué hace falta esta función en vez de hacerlo en el navegador:
 * crear usuarios exige la clave service_role, que puede todo y salta
 * cualquier política. Esa clave no puede viajar al navegador, porque
 * cualquiera abriría las herramientas de desarrollo y la copiaría.
 * Aquí vive en el servidor de Supabase y nunca sale de él.
 *
 * La función comprueba por su cuenta que quien llama es administrador.
 * No se fía de lo que diga el panel.
 *
 * Despliegue:
 *   npx supabase functions deploy crear-staff
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES_VALIDOS = ["gestor", "supervisor", "admin"];

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Contraseña temporal legible, sin caracteres que se confundan. */
function claveTemporal() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const min = "abcdefghijkmnopqrstuvwxyz";
  const num = "23456789";
  const sim = "!@#$%&*";
  const al = (s: string) => s[Math.floor(Math.random() * s.length)];
  let clave = al(abc) + al(min) + al(num) + al(sim);
  for (let i = 0; i < 8; i++) clave += al(abc + min + num);
  return clave
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Si falta una variable, decirlo por su nombre. Antes un fallo así
  // terminaba mostrando "solo un administrador puede", que culpa al
  // usuario equivocado.
  const faltantes = [
    !url && "SUPABASE_URL",
    !anon && "SUPABASE_ANON_KEY",
    !servicio && "SUPABASE_SERVICE_ROLE_KEY",
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
  });
  const {
    data: { user: quienLlama },
    error: errorSesion,
  } = await comoUsuario.auth.getUser();

  if (errorSesion || !quienLlama) {
    return responder(
      {
        error:
          "Tu sesión no es válida o caducó: " +
          (errorSesion?.message ?? "sin usuario"),
        detalle: "sesion_invalida",
      },
      401,
    );
  }

  const admin = createClient(url!, servicio!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Solo un administrador puede crear personal ──
  // El error de esta consulta se revisa aparte, porque antes se
  // descartaba y cualquier fallo acababa en el mismo mensaje.
  const { data: perfil, error: errorPerfil } = await admin
    .from("users")
    .select("rol, estado")
    .eq("id", quienLlama.id)
    .maybeSingle();

  if (errorPerfil) {
    return responder(
      {
        error: "No se pudo leer tu perfil: " + errorPerfil.message,
        detalle: "fallo_consulta",
      },
      500,
    );
  }
  if (!perfil) {
    return responder(
      {
        error:
          "Tu sesión existe pero no hay ninguna fila en users con tu identificador.",
        detalle: "sin_fila",
        usuario_id: quienLlama.id,
      },
      403,
    );
  }
  if (perfil.estado === "bloqueado") {
    return responder(
      { error: "Tu cuenta está bloqueada.", detalle: "bloqueado" },
      403,
    );
  }
  if (perfil.rol !== "admin") {
    return responder(
      {
        error:
          "Tu cuenta figura con el rol " +
          perfil.rol +
          ", y crear personal es solo del administrador.",
        detalle: "rol_insuficiente",
        rol_detectado: perfil.rol,
        usuario_id: quienLlama.id,
      },
      403,
    );
  }

  // ── Datos de entrada ──
  let cuerpo: { email?: string; rol?: string; sede_id?: string | null };
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "Cuerpo inválido." }, 400);
  }

  const email = (cuerpo.email ?? "").trim().toLowerCase();
  const rol = cuerpo.rol ?? "gestor";
  const sedeId = cuerpo.sede_id || null;

  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) {
    return responder({ error: "El correo no tiene un formato válido." }, 400);
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return responder({ error: `Rol no válido: ${rol}` }, 400);
  }

  // ── Crear la cuenta de acceso ──
  const clave = claveTemporal();
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true, // sin esto tendría que confirmar por correo antes de entrar
  });

  if (errorAuth) {
    const yaExiste = /already|registered|exists/i.test(errorAuth.message);
    return responder(
      {
        error: yaExiste
          ? "Ese correo ya tiene una cuenta. Búscalo en la lista de equipo y asígnale el rol desde ahí."
          : errorAuth.message,
        detalle: yaExiste ? "correo_repetido" : "fallo_alta",
      },
      yaExiste ? 409 : 400,
    );
  }

  const id = creado.user!.id;

  // ── Fila en users con su rol y su sede ──
  // Se usa la clave de servicio a propósito: los triggers que fuerzan
  // rol cliente miran quién hace la escritura desde el navegador, y
  // aquí ya se comprobó que quien pide es administrador.
  const { error: errorAlta } = await admin
    .from("users")
    .upsert(
      { id, email, rol, estado: "activo", sede_id: sedeId },
      { onConflict: "id" },
    );

  if (errorAlta) {
    // Si no se pudo completar, se borra la cuenta para no dejar a
    // medias un usuario que no puede entrar a ningún sitio.
    await admin.auth.admin.deleteUser(id);
    return responder(
      {
        error: "No se pudo asignar el rol: " + errorAlta.message,
        detalle: "fallo_rol",
      },
      500,
    );
  }

  await admin.from("auditoria_logs").insert({
    usuario_id: quienLlama.id,
    accion: "CREAR_STAFF",
    entidad: "users",
    entidad_id: id,
    datos_despues: { email, rol, sede_id: sedeId },
  });

  return responder({
    ok: true,
    id,
    email,
    rol,
    clave_temporal: clave,
    aviso: "Entrégale esta contraseña. No se vuelve a mostrar.",
  });
});
