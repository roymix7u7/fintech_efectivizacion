import { etiquetaDeSede, fechaLima } from "@/lib/atencion";
import { chat, CHAT_URL, enlaceConversacion } from "@/lib/chatApi";
import { responder } from "@/lib/chatwootApi";

/**
 * Reporte de Atención al cliente con el chat propio. Devuelve lo mismo
 * que la versión de Chatwoot (app/api/atencion/route.js), para que la
 * página de Atención no cambie.
 *
 * Los números salen de la API de reportes del chat (/v1/reports/…), que
 * cuenta los días en hora de Lima. La sede de cada asesor sale del panel
 * (Equipo → "Atiende chat" y su sede, mismo correo); la sede de cada
 * conversación, de su etiqueta "sede-…".
 */

// Para cruzar con las solicitudes se leen como máximo estas páginas de
// 200 chats; con más volumen, el dato se marca como muestra.
const MAX_PAGINAS = 5;
const POR_PAGINA = 200;
const DIAS_PARA_CONVERTIR = 7;

const segundos = (iso) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : null);

/** Promedio de 1 a 5 y porcentaje de 4 y 5, desde el conteo por nota. */
function satisfaccion(conteo = {}) {
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

const resumirConversacion = (c) => ({
  id: c.id,
  enlace: enlaceConversacion(c.id),
  cliente: c.contact?.name || "Cliente",
  asesor: c.assignee?.name || null,
  prioridad: c.priority,
  desde: segundos(c.waiting_since || c.last_activity_at || c.created_at),
});

/**
 * Cuántos clientes que chatearon hicieron una solicitud en los
 * DIAS_PARA_CONVERTIR días siguientes. El chat trae el id de cuenta del
 * cliente (identidad firmada con HMAC), y con él se buscan sus
 * solicitudes en Supabase con la sesión de quien pide.
 */
async function convertidos(sb, filtros) {
  const chats = [];
  let total = 0;
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const r = await chat("/v1/conversations", { params: { ...filtros, status: "all", sort: "created_desc", per_page: POR_PAGINA, page: pagina } });
    chats.push(...r.data);
    total = r.meta.total;
    if (chats.length >= total) break;
  }

  // Primer chat de cada cliente identificado en el periodo.
  const primerChat = new Map();
  for (const c of chats) {
    const id = c.contact?.identifier;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) continue;
    const creado = segundos(c.created_at);
    if (!primerChat.has(id) || creado < primerChat.get(id)) primerChat.set(id, creado);
  }
  const resultado = { chats: chats.length, clientes: primerChat.size, conSolicitud: 0, dias: DIAS_PARA_CONVERTIR, muestra: total > chats.length };
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
    const inicio = primerChat.get(u);
    const t = new Date(s.created_at).getTime() / 1000;
    if (inicio && t >= inicio && t <= inicio + DIAS_PARA_CONVERTIR * 86400) convertidosSet.add(u);
  }
  resultado.conSolicitud = convertidosSet.size;
  return resultado;
}

export async function reportePropio({ sb, yo, sedes, sede, etiqueta, periodo, since, until }) {
  // Los reportes del chat reciben días de Lima; la lista de conversaciones, instantes.
  const dias = { since: fechaLima(since), until: fechaLima(until) };
  const deSede = etiqueta ? { ...dias, label: etiqueta } : dias;
  // until viene en segundos enteros: se suma uno para no dejar fuera lo creado en este mismo segundo.
  const instantes = { since: new Date(since * 1000).toISOString(), until: new Date((until + 1) * 1000).toISOString(), ...(etiqueta && { label: etiqueta }) };

  try {
    const [agentes, porAgente, periodoSede, abiertas, cola, paraSupervisor, reclamos, bajas, motivos, horas, { data: equipo }] = await Promise.all([
      chat("/v1/agents"),
      chat("/v1/reports/agents", { params: dias }),
      chat("/v1/reports/daily", { params: deSede }),
      chat("/v1/conversations/counts", { params: { status: "open", label: etiqueta } }),
      chat("/v1/conversations/counts", { params: { status: "open" } }),
      chat("/v1/conversations", { params: { status: "open", label: "para-supervisor", per_page: 50 } }),
      chat("/v1/conversations", { params: { status: "open", label: "reclamo", priority: "urgent", per_page: 50 } }),
      chat("/v1/reports/csat", { params: { ...deSede, max_rating: 3, per_page: 50 } }),
      chat("/v1/reports/attribute", { params: { ...deSede, key: "motivo" } }),
      chat("/v1/reports/hours", { params: deSede }),
      sb.rpc("listar_equipo"),
    ]);

    // Asesores de la sede: los del panel con "Atiende chat" y sede (mismo correo).
    const sedeDelPanel = new Map(
      (equipo || [])
        .filter((p) => p.atiende_chat && p.sede && p.estado !== "bloqueado")
        .map((p) => [(p.email || "").toLowerCase(), etiquetaDeSede(p.sede)]),
    );
    const sedeDe = (a) => sedeDelPanel.get((a.email || "").toLowerCase());
    const deLaSede = agentes.filter((a) => (etiqueta ? sedeDe(a) === etiqueta : sedeDe(a)));
    const stats = new Map(porAgente.agents.map((s) => [s.agent_id, s]));
    const t = periodoSede.totals;
    const enLaSede = (c) => !etiqueta || (c.labels || []).includes(etiqueta);

    const negocio = await convertidos(sb, instantes);

    return responder({
      rol: yo.rol,
      sede: sede ? { id: sede.id, nombre: sede.nombre, etiqueta } : null,
      sedes: yo.rol === "admin" ? (sedes || []).filter((s) => s.activa).map((s) => ({ id: s.id, nombre: s.nombre })) : undefined,
      periodo,
      chatwoot: `${CHAT_URL}/app/`, // la página lo usa como enlace al panel del chat
      chatPropio: true,
      resumen: {
        atendidas: t.conversations,
        resueltas: t.conversations_resolved,
        primeraRespuesta: t.avg_first_response_seconds,
        resolucion: t.avg_resolution_seconds,
        abiertas: abiertas.all,
        enCola: cola.unassigned,
        satisfaccion: satisfaccion(t.csat_distribution),
      },
      asesores: deLaSede
        .map((a) => {
          const s = stats.get(a.id) || {};
          return {
            id: a.id,
            nombre: a.name,
            jefe: a.role !== "asesor",
            estado: a.availability, // online | busy | offline
            confirmado: true, // en el chat propio no hay invitación por correo que confirmar
            atendidas: s.conversations ?? 0,
            resueltas: s.conversations_resolved ?? 0,
            primeraRespuesta: s.avg_first_response_seconds ?? null,
            resolucion: s.avg_resolution_seconds ?? null,
            satisfaccion: satisfaccion(s.csat_distribution),
          };
        })
        .sort((x, y) => Number(x.jefe) - Number(y.jefe) || y.atendidas - x.atendidas),
      atencion: {
        paraSupervisor: paraSupervisor.data.filter(enLaSede).map(resumirConversacion),
        reclamosUrgentes: reclamos.data.filter(enLaSede).map(resumirConversacion),
        calificacionesBajas: bajas.data.slice(0, 6).map((r) => ({
          nota: r.rating,
          comentario: r.comment || null,
          asesor: r.agent?.name || null,
          cliente: r.contact?.name || "Cliente",
          fecha: segundos(r.created_at),
          enlace: enlaceConversacion(r.conversation_id),
        })),
      },
      motivos: {
        lista: motivos.values.map((m) => ({ motivo: m.value, total: m.conversations })),
        sinMotivo: motivos.without_value,
        total: motivos.total,
      },
      horas: { celdas: horas.cells, dias: Math.round((until - since) / 86400) || 1 },
      negocio,
      actualizado: Math.floor(Date.now() / 1000),
    });
  } catch (e) {
    return responder({ error: "No se pudo leer el chat. ¿Está prendido? " + e.message, detalle: "chat" }, 502);
  }
}
