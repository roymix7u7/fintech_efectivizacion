import { createClient } from "@supabase/supabase-js";
import { etiquetaDeSede, rangoDe, MOTIVOS, fechaLima, diaYHoraLima } from "@/lib/atencion";

/**
 * Reporte de Atención al cliente por sede, para el supervisor (jefe de
 * sede) y el administrador.
 *
 * Corre en el servidor porque pregunta a Chatwoot con la clave de un
 * administrador (CHATWOOT_API_TOKEN), que no puede llegar al navegador.
 * Quién pide se comprueba con su sesión del panel: el supervisor solo
 * recibe su sede (la de users.sede_id), sin poder pedir otra; el
 * administrador elige la sede o todas.
 *
 * Del cliente solo sale el nombre: ni correo ni teléfono.
 */
export const dynamic = "force-dynamic";

const CW_URL = (process.env.CHATWOOT_URL || process.env.NEXT_PUBLIC_CHATWOOT_URL || "").replace(/\/$/, "");
const CW_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CW_CUENTA = process.env.CHATWOOT_ACCOUNT_ID || "1";

const responder = (cuerpo, status = 200) => Response.json(cuerpo, { status });

async function chatwoot(ruta, params = {}) {
  const url = new URL(`${CW_URL}${ruta.replace(":cuenta", CW_CUENTA)}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(`${k}[]`, x));
    else if (v != null) url.searchParams.set(k, v);
  }
  const r = await fetch(url, { headers: { api_access_token: CW_TOKEN }, cache: "no-store" });
  if (!r.ok) throw new Error(`Chatwoot respondió ${r.status} en ${ruta}`);
  return r.json();
}

/**
 * Conversaciones que cumplen todas las condiciones (API de filtros de
 * Chatwoot). Devuelve el total y una página de 25.
 */
async function filtrar(condiciones, pagina = 1) {
  const payload = condiciones.map((c, i) => ({ ...c, query_operator: i < condiciones.length - 1 ? "and" : null }));
  const url = `${CW_URL}/api/v1/accounts/${CW_CUENTA}/conversations/filter?page=${pagina}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { api_access_token: CW_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Chatwoot respondió ${r.status} al filtrar`);
  const j = await r.json();
  return { total: j.meta?.all_count ?? 0, items: j.payload || [] };
}

// Para cruzar con las solicitudes se leen como máximo estas páginas de
// 25 chats (los más recientes): alcanza para un día o una semana; en 30
// días con mucho volumen el dato se marca como muestra.
const MAX_PAGINAS = 20;
const DIAS_PARA_CONVERTIR = 7;

/** Promedio de 1 a 5 y porcentaje de 4 y 5, desde el conteo por nota. */
function satisfaccion(metricas) {
  const conteo = metricas?.ratings_count || {};
  let total = 0;
  let suma = 0;
  let contentos = 0;
  for (const [nota, n] of Object.entries(conteo)) {
    total += n;
    suma += Number(nota) * n;
    if (Number(nota) >= 4) contentos += n;
  }
  return total
    ? { promedio: Math.round((suma / total) * 10) / 10, contentos: Math.round((contentos / total) * 100), respuestas: total }
    : { promedio: null, contentos: null, respuestas: 0 };
}

const enlace = (id) => `${CW_URL}/app/accounts/${CW_CUENTA}/conversations/${id}`;

function resumirConversacion(c) {
  return {
    id: c.id,
    enlace: enlace(c.id),
    cliente: c.meta?.sender?.name || "Cliente",
    asesor: c.meta?.assignee?.name || null,
    prioridad: c.priority,
    desde: c.waiting_since || c.last_activity_at || c.created_at,
  };
}

/**
 * Cuántos clientes que chatearon hicieron una solicitud en los
 * DIAS_PARA_CONVERTIR días siguientes. El chat trae el id de cuenta del
 * cliente (identidad firmada con HMAC), y con él se buscan sus
 * solicitudes en Supabase con la sesión de quien pide.
 */
async function convertidos(sb, primera, condiciones) {
  const chats = [...primera.items];
  const paginas = Math.min(MAX_PAGINAS, Math.ceil(primera.total / 25));
  for (let p = 2; p <= paginas; p++) chats.push(...(await filtrar(condiciones, p)).items);

  // Primer chat de cada cliente identificado en el periodo.
  const primerChat = new Map();
  for (const c of chats) {
    const id = c.meta?.sender?.identifier;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) continue;
    if (!primerChat.has(id) || c.created_at < primerChat.get(id)) primerChat.set(id, c.created_at);
  }
  const resultado = {
    chats: chats.length,
    clientes: primerChat.size,
    conSolicitud: 0,
    dias: DIAS_PARA_CONVERTIR,
    muestra: primera.total > chats.length,
  };
  if (primerChat.size === 0) return resultado;

  const usuarios = [...primerChat.keys()];
  const perfiles = [];
  for (let i = 0; i < usuarios.length; i += 100) {
    const { data, error } = await sb.from("perfiles_cliente").select("id, user_id").in("user_id", usuarios.slice(i, i + 100));
    if (error) throw new Error("No se pudieron leer los clientes: " + error.message);
    perfiles.push(...(data || []));
  }
  const desde = new Date(Math.min(...primerChat.values()) * 1000).toISOString();
  const solicitudes = [];
  for (let i = 0; i < perfiles.length; i += 100) {
    const { data, error } = await sb
      .from("solicitudes")
      .select("cliente_id, created_at")
      .in("cliente_id", perfiles.slice(i, i + 100).map((p) => p.id))
      .gte("created_at", desde);
    if (error) throw new Error("No se pudieron leer las solicitudes: " + error.message);
    solicitudes.push(...(data || []));
  }
  const usuarioDe = new Map(perfiles.map((p) => [p.id, p.user_id]));
  const convertidosSet = new Set();
  for (const s of solicitudes) {
    const u = usuarioDe.get(s.cliente_id);
    const chat = primerChat.get(u);
    const t = new Date(s.created_at).getTime() / 1000;
    if (chat && t >= chat && t <= chat + DIAS_PARA_CONVERTIR * 86400) convertidosSet.add(u);
  }
  resultado.conSolicitud = convertidosSet.size;
  return resultado;
}

export async function GET(req) {
  if (!CW_URL || !CW_TOKEN) {
    return responder(
      { error: "El reporte no está configurado en este servidor: faltan CHATWOOT_URL y CHATWOOT_API_TOKEN.", detalle: "sin_configurar" },
      503,
    );
  }

  // ── Quién pide ──
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return responder({ error: "Falta la sesión." }, 401);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await sb.auth.getUser(token);
  if (!user) return responder({ error: "Tu sesión caducó. Vuelve a ingresar." }, 401);

  const [{ data: yo }, { data: sedes }] = await Promise.all([
    sb.from("users").select("rol, estado, sede_id").eq("id", user.id).maybeSingle(),
    sb.from("sedes").select("id, nombre, activa").order("nombre"),
  ]);
  if (!yo || yo.estado === "bloqueado" || !["admin", "supervisor"].includes(yo.rol)) {
    return responder({ error: "Este reporte es para supervisores y administradores." }, 403);
  }

  // ── Qué sede ──
  const url = new URL(req.url);
  const pedida = url.searchParams.get("sede");
  let sede = null; // null = todas (solo administrador)
  if (yo.rol === "supervisor") {
    sede = (sedes || []).find((s) => s.id === yo.sede_id);
    if (!sede) return responder({ error: "Tu usuario no tiene una sede asignada. Pídele al administrador que te asigne una en Equipo." }, 409);
  } else if (pedida && pedida !== "todas") {
    sede = (sedes || []).find((s) => s.id === pedida);
    if (!sede) return responder({ error: "Esa sede no existe." }, 404);
  }
  const etiqueta = sede ? etiquetaDeSede(sede.nombre) : null;
  const periodo = ["hoy", "7d", "30d"].includes(url.searchParams.get("periodo")) ? url.searchParams.get("periodo") : "hoy";
  const { since, until } = rangoDe(periodo);

  try {
    const [agentes, porAgente, porEtiqueta, total, abiertas, cola, paraSupervisor, reclamos] = await Promise.all([
      chatwoot("/api/v1/accounts/:cuenta/agents"),
      chatwoot("/api/v2/accounts/:cuenta/summary_reports/agent", { since, until }),
      chatwoot("/api/v2/accounts/:cuenta/summary_reports/label", { since, until }),
      etiqueta ? null : chatwoot("/api/v2/accounts/:cuenta/reports/summary", { type: "account", since, until }),
      chatwoot("/api/v1/accounts/:cuenta/conversations", { status: "open", assignee_type: "all", labels: etiqueta ? [etiqueta] : undefined }),
      chatwoot("/api/v1/accounts/:cuenta/conversations", { status: "open", assignee_type: "unassigned" }),
      chatwoot("/api/v1/accounts/:cuenta/conversations", { status: "open", assignee_type: "all", labels: ["para-supervisor"] }),
      chatwoot("/api/v1/accounts/:cuenta/conversations", { status: "open", assignee_type: "all", labels: ["reclamo"] }),
    ]);

    // Asesores de la sede: por el panel (Equipo → "Atiende chat" y su
    // sede, mismo correo) o por configurar.rb (SEDES), para quien no está
    // en el panel.
    const { data: equipo } = await sb.rpc("listar_equipo");
    const sedeDelPanel = new Map(
      (equipo || [])
        .filter((p) => p.atiende_chat && p.sede && p.estado !== "bloqueado")
        .map((p) => [(p.email || "").toLowerCase(), etiquetaDeSede(p.sede)]),
    );
    const sedeDe = (a) => sedeDelPanel.get((a.email || "").toLowerCase()) || a.custom_attributes?.sede;
    const deLaSede = (agentes || []).filter((a) => (etiqueta ? sedeDe(a) === etiqueta : sedeDe(a)));
    const ids = deLaSede.map((a) => a.id);
    const stats = new Map((porAgente || []).map((s) => [s.id, s]));

    const [csatSede, csatLista, ...csatPorAsesor] = await Promise.all([
      etiqueta && ids.length === 0
        ? null
        : chatwoot("/api/v1/accounts/:cuenta/csat_survey_responses/metrics", { since, until, user_ids: etiqueta ? ids : undefined }),
      etiqueta && ids.length === 0
        ? []
        : chatwoot("/api/v1/accounts/:cuenta/csat_survey_responses", { since, until, user_ids: etiqueta ? ids : undefined }),
      ...ids.map((id) => chatwoot("/api/v1/accounts/:cuenta/csat_survey_responses/metrics", { since, until, user_ids: [id] })),
    ]);

    const fila = etiqueta ? (porEtiqueta || []).find((l) => l.name === etiqueta) : null;
    const resumen = etiqueta
      ? {
          atendidas: fila?.conversations_count ?? 0,
          resueltas: fila?.resolved_conversations_count ?? 0,
          primeraRespuesta: fila?.avg_first_response_time ?? null,
          resolucion: fila?.avg_resolution_time ?? null,
        }
      : {
          atendidas: total?.conversations_count ?? 0,
          resueltas: total?.resolutions_count ?? 0,
          primeraRespuesta: total?.avg_first_response_time ?? null,
          resolucion: total?.avg_resolution_time ?? null,
        };

    const enLaSede = (c) => !etiqueta || (c.labels || []).includes(etiqueta);

    // ── Por qué escriben, horas pico y qué pasó después ──
    // "Mayor que el día anterior" = desde el primer día del periodo.
    const base = [
      { attribute_key: "created_at", filter_operator: "is_greater_than", values: [fechaLima(since - 86400)] },
      ...(etiqueta ? [{ attribute_key: "labels", filter_operator: "equal_to", values: [etiqueta] }] : []),
    ];
    const idEtiqueta = fila?.id;
    const [delPeriodo, porMotivo, porHora] = await Promise.all([
      filtrar(base),
      Promise.all(
        MOTIVOS.map((m) =>
          filtrar([
            ...base,
            { attribute_key: "motivo", filter_operator: "equal_to", values: [m], custom_attribute_type: "conversation_attribute" },
          ]).then((x) => ({ motivo: m, total: x.total })),
        ),
      ),
      etiqueta && !idEtiqueta
        ? []
        : chatwoot("/api/v2/accounts/:cuenta/reports", {
            metric: "conversations_count",
            type: etiqueta ? "label" : "account",
            id: etiqueta ? idEtiqueta : undefined,
            group_by: "hour",
            since,
            until,
            timezone_offset: -5,
          }),
    ]);

    // Mapa de calor: 7 días × 24 horas, en hora de Lima.
    const celdas = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const p of porHora || []) {
      if (!p.value) continue;
      const { dia, hora } = diaYHoraLima(p.timestamp);
      celdas[dia][hora] += p.value;
    }

    const negocio = await convertidos(sb, delPeriodo, base);

    const conMotivo = porMotivo.reduce((s, m) => s + m.total, 0);

    return responder({
      rol: yo.rol,
      sede: sede ? { id: sede.id, nombre: sede.nombre, etiqueta } : null,
      sedes: yo.rol === "admin" ? (sedes || []).filter((s) => s.activa).map((s) => ({ id: s.id, nombre: s.nombre })) : undefined,
      periodo,
      chatwoot: CW_URL,
      resumen: {
        ...resumen,
        abiertas: abiertas?.data?.meta?.all_count ?? 0,
        enCola: cola?.data?.meta?.unassigned_count ?? 0,
        satisfaccion: satisfaccion(csatSede),
      },
      asesores: deLaSede
        .map((a, i) => {
          const s = stats.get(a.id) || {};
          return {
            id: a.id,
            nombre: a.available_name || a.name,
            jefe: a.role === "administrator",
            estado: a.availability_status, // online | busy | offline
            confirmado: a.confirmed,
            atendidas: s.conversations_count ?? 0,
            resueltas: s.resolved_conversations_count ?? 0,
            primeraRespuesta: s.avg_first_response_time ?? null,
            resolucion: s.avg_resolution_time ?? null,
            satisfaccion: satisfaccion(csatPorAsesor[i]),
          };
        })
        .sort((x, y) => Number(x.jefe) - Number(y.jefe) || y.atendidas - x.atendidas),
      atencion: {
        paraSupervisor: (paraSupervisor?.data?.payload || []).filter(enLaSede).map(resumirConversacion),
        reclamosUrgentes: (reclamos?.data?.payload || [])
          .filter((c) => enLaSede(c) && c.priority === "urgent")
          .map(resumirConversacion),
        calificacionesBajas: (csatLista || [])
          .filter((r) => r.rating <= 3)
          .slice(0, 6)
          .map((r) => ({
            nota: r.rating,
            comentario: r.feedback_message || null,
            asesor: r.assigned_agent?.name || null,
            cliente: r.contact?.name || "Cliente",
            fecha: r.created_at,
            enlace: r.conversation_id ? enlace(r.conversation_id) : null,
          })),
      },
      motivos: {
        lista: porMotivo.filter((m) => m.total > 0).sort((a, b) => b.total - a.total),
        sinMotivo: Math.max(0, delPeriodo.total - conMotivo),
        total: delPeriodo.total,
      },
      horas: { celdas, dias: Math.round((until - since) / 86400) || 1 },
      negocio,
      actualizado: Math.floor(Date.now() / 1000),
    });
  } catch (e) {
    return responder({ error: "No se pudo leer Chatwoot. ¿Está prendido? " + e.message, detalle: "chatwoot" }, 502);
  }
}
