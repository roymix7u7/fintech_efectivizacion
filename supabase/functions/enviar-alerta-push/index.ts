/**
 * Manda una alerta como notificación a los teléfonos de los clientes.
 *
 * Por qué vive en el servidor y no en el panel: hay que leer los
 * tokens de los treinta mil clientes, y esa tabla está cerrada por
 * política a cada dueño. Traerla al navegador exigiría abrirla a todo
 * el que tenga sesión, que es justo lo que no se quiere.
 *
 * La función comprueba por su cuenta que quien llama es administrador.
 * No se fía de lo que diga el panel.
 *
 * Despliegue:
 *   npx supabase functions deploy enviar-alerta-push
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

// Expo acepta como máximo 100 mensajes por petición.
const LOTE = 100;

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Canal de Android y prioridad según la gravedad de la alerta. */
function ajustesDe(tipo: string) {
  const urgente = tipo === "critico";
  return {
    priority: urgente ? "high" : "normal",
    channelId: "alertas",
    sound: "default",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
        error: "Solo un administrador puede mandar notificaciones.",
        detalle: "rol_insuficiente",
      },
      403,
    );
  }

  // ── Qué se manda ──
  let cuerpo: { alerta_id?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "Cuerpo inválido.", detalle: "json_invalido" }, 400);
  }

  const alertaId = cuerpo.alerta_id;
  if (!alertaId) {
    return responder(
      { error: "Falta alerta_id.", detalle: "sin_alerta" },
      400,
    );
  }

  const { data: alerta, error: errorAlerta } = await admin
    .from("alertas_sistema")
    .select("id, titulo, mensaje, tipo, activa, fecha_inicio, fecha_fin")
    .eq("id", alertaId)
    .maybeSingle();

  if (errorAlerta) {
    return responder(
      { error: "No se pudo leer la alerta: " + errorAlerta.message, detalle: "fallo_consulta" },
      500,
    );
  }
  if (!alerta) {
    return responder({ error: "Esa alerta no existe.", detalle: "sin_fila" }, 404);
  }

  // No se manda algo que el cliente no podría abrir: tocaría la
  // notificación y encontraría una lista vacía.
  const ahora = Date.now();
  if (
    !alerta.activa ||
    (alerta.fecha_fin && new Date(alerta.fecha_fin).getTime() <= ahora)
  ) {
    return responder(
      {
        error: "La alerta está apagada o vencida. Actívala antes de notificar.",
        detalle: "no_vigente",
      },
      409,
    );
  }

  // ── A quién ──
  // Una promoción solo llega a quien aceptó recibirlas (casilla del
  // registro o Mi cuenta → Recibir promociones; migración 58). Las
  // alertas del servicio llegan a todos.
  let consulta = admin.from("push_tokens").select("token, user_id");
  if (alerta.tipo === "promocion") {
    const { data: aceptan } = await admin
      .from("perfiles_cliente")
      .select("user_id")
      .eq("acepta_promociones", true);
    consulta = consulta.in("user_id", (aceptan ?? []).map((f) => f.user_id));
  }
  const { data: filas, error: errorTokens } = await consulta;

  if (errorTokens) {
    return responder(
      { error: "No se pudieron leer los teléfonos: " + errorTokens.message, detalle: "fallo_consulta" },
      500,
    );
  }

  const tokens = (filas ?? [])
    .map((f) => f.token as string)
    .filter((t) => t?.startsWith("ExponentPushToken"));

  if (tokens.length === 0) {
    return responder({
      enviados: 0,
      invalidos: 0,
      total: 0,
      aviso:
        "Ningún cliente tiene el teléfono registrado todavía. Se registran al abrir el app instalada desde el APK.",
    });
  }

  const ajustes = ajustesDe(alerta.tipo);
  let enviados = 0;
  const muertos: string[] = [];
  const errores: string[] = [];

  for (let i = 0; i < tokens.length; i += LOTE) {
    const lote = tokens.slice(i, i + LOTE);
    const mensajes = lote.map((to) => ({
      to,
      title: alerta.titulo,
      body: alerta.mensaje,
      // Lo que lee el app al tocar la notificación para saber a dónde ir.
      data: { seccion: "alertas", alerta_id: alerta.id },
      ...ajustes,
    }));

    try {
      const res = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(mensajes),
      });

      const json = await res.json();
      const tickets = json?.data ?? [];

      tickets.forEach((t: { status: string; details?: { error?: string } }, j: number) => {
        if (t.status === "ok") {
          enviados++;
          return;
        }
        // Un teléfono desinstalado devuelve esto para siempre. Si no se
        // borra, la lista de tokens solo crece y cada envío tarda más.
        if (t.details?.error === "DeviceNotRegistered") muertos.push(lote[j]);
        else if (t.details?.error) errores.push(t.details.error);
      });
    } catch (e) {
      errores.push((e as Error).message);
    }
  }

  if (muertos.length > 0) {
    await admin.from("push_tokens").delete().in("token", muertos);
  }

  await admin
    .from("alertas_sistema")
    .update({
      push_enviado_en: new Date().toISOString(),
      push_alcance: enviados,
    })
    .eq("id", alerta.id);

  return responder({
    enviados,
    invalidos: muertos.length,
    total: tokens.length,
    // Los motivos se devuelven sin repetir, para que el panel diga algo
    // útil en vez de una lista de mil líneas iguales.
    errores: [...new Set(errores)].slice(0, 5),
  });
});
