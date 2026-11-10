import { etiquetaDeSede } from "@/lib/atencion";
import {
  cw,
  lista,
  responder,
  sesionDe,
  chatwootConfigurado,
  ROL_CHATWOOT,
  DISPONIBILIDAD_CHATWOOT,
} from "@/lib/chatwootApi";

/**
 * Lleva a Chatwoot lo que dice Equipo en el panel (migración 071).
 *
 * Para cada persona que ve quien pide (el administrador, todo el
 * personal; el supervisor, su sede):
 *   · "Atiende chat" y activa → existe en Chatwoot con su mismo correo
 *     (si no, se le invita), con su rol (supervisor/admin → jefe,
 *     gestor/pagos → asesor) y su disponibilidad del panel.
 *   · Asesores: dentro del equipo y de las bandejas (reparto). Jefes:
 *     fuera del reparto.
 *   · Sin la marca o bloqueada → sale de Chatwoot.
 *   · Su sede → la regla que etiqueta sus conversaciones (sede-lince…).
 *
 * Se puede correr las veces que haga falta: solo corrige diferencias.
 * Nunca toca la cuenta dueña de la clave de Chatwoot, nunca borra a un
 * administrador de Chatwoot (avisa) y no toca a quien no está en el
 * panel (p. ej. los que se agregan a mano en configurar.rb).
 */
export const dynamic = "force-dynamic";

const BANDEJAS = ["Web AlToque", "App AlToque", "Visitantes web"];
const EQUIPO = "atención al cliente";

/** "ana.torres@x.pe" → "Ana Torres": nombre inicial en Chatwoot. */
const nombreDe = (correo) =>
  correo
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ") || correo;

export async function POST(req) {
  if (!chatwootConfigurado()) {
    return responder({ error: "El chat no está configurado en este servidor (CHATWOOT_URL y CHATWOOT_API_TOKEN)." }, 503);
  }
  const s = await sesionDe(req);
  if (s.error) return s.error;
  if (!["admin", "supervisor"].includes(s.yo.rol)) {
    return responder({ error: "Solo administradores y supervisores sincronizan el chat." }, 403);
  }

  const { data: equipo, error } = await s.sb.rpc("listar_equipo");
  if (error) return responder({ error: "No se pudo leer el equipo: " + error.message }, 500);
  if ((equipo || []).length && !("atiende_chat" in equipo[0])) {
    return responder({ error: "Falta aplicar en Supabase la migración 20261109000071_chat_personal.sql." }, 409);
  }

  const r = { invitados: [], actualizados: [], quitados: [], avisos: [] };
  try {
    const [perfil, agentesRaw, inboxesRaw, teamsRaw, reglasRaw, etiquetasRaw] = await Promise.all([
      cw("/api/v1/profile"),
      cw("/api/v1/accounts/:cuenta/agents"),
      cw("/api/v1/accounts/:cuenta/inboxes"),
      cw("/api/v1/accounts/:cuenta/teams"),
      cw("/api/v1/accounts/:cuenta/automation_rules"),
      cw("/api/v1/accounts/:cuenta/labels"),
    ]);
    const agentes = lista(agentesRaw);
    const porCorreo = new Map(agentes.map((a) => [(a.email || "").toLowerCase(), a]));
    const gestionados = new Set(); // ids de Chatwoot del personal del panel (vigentes o quitados)
    const quieren = []; // { p, agente }

    // ── 1. Personas ──
    for (const p of equipo) {
      const correo = (p.email || "").toLowerCase();
      if (!correo) continue;
      let a = porCorreo.get(correo);
      const quiere = p.atiende_chat && p.estado !== "bloqueado";
      const rol = ROL_CHATWOOT[p.rol];
      if (a) gestionados.add(a.id);

      if (a && a.id === perfil.id) {
        if (quiere) quieren.push({ p, agente: a });
        continue; // la cuenta de la clave no se toca
      }
      if (quiere) {
        if (!a) {
          a = await cw("/api/v1/accounts/:cuenta/agents", {
            metodo: "POST",
            cuerpo: { name: nombreDe(correo), email: correo, role: rol },
          });
          porCorreo.set(correo, a);
          gestionados.add(a.id);
          r.invitados.push(correo);
        } else if (a.role !== rol) {
          a = await cw(`/api/v1/accounts/:cuenta/agents/${a.id}`, { metodo: "PATCH", cuerpo: { role: rol } });
          r.actualizados.push(correo);
        }
        quieren.push({ p, agente: a });
      } else if (a) {
        if (a.role === "administrator") {
          r.avisos.push(`${correo} es administrador en Chatwoot: si ya no debe entrar, quítalo a mano (Ajustes → Agentes).`);
        } else {
          await cw(`/api/v1/accounts/:cuenta/agents/${a.id}`, { metodo: "DELETE" });
          porCorreo.delete(correo);
          r.quitados.push(correo);
        }
      }
    }

    // ── 2. Reparto: asesores dentro, jefes fuera ──
    const asesores = quieren.filter((q) => q.agente.role === "agent").map((q) => q.agente.id);
    const jefes = quieren.filter((q) => q.agente.role === "administrator").map((q) => q.agente.id);
    const bandejas = lista(inboxesRaw).filter((i) => BANDEJAS.includes(i.name));
    for (const i of bandejas) {
      if (asesores.length)
        await cw("/api/v1/accounts/:cuenta/inbox_members", { metodo: "POST", cuerpo: { inbox_id: i.id, user_ids: asesores } });
      if (jefes.length)
        await cw("/api/v1/accounts/:cuenta/inbox_members", { metodo: "DELETE", cuerpo: { inbox_id: i.id, user_ids: jefes } });
    }
    const equipoCw = lista(teamsRaw).find((t) => t.name === EQUIPO);
    if (equipoCw) {
      if (asesores.length)
        await cw(`/api/v1/accounts/:cuenta/teams/${equipoCw.id}/team_members`, { metodo: "POST", cuerpo: { user_ids: asesores } });
      if (jefes.length)
        await cw(`/api/v1/accounts/:cuenta/teams/${equipoCw.id}/team_members`, { metodo: "DELETE", cuerpo: { user_ids: jefes } });
    } else if (asesores.length) {
      r.avisos.push(`No existe el equipo "${EQUIPO}" en Chatwoot: corre configurar.rb.`);
    }

    // ── 3. Sede de cada uno → regla que etiqueta sus conversaciones ──
    const titulos = new Set(lista(etiquetasRaw).map((l) => l.title));
    const sedes = [...new Set(equipo.filter((p) => p.sede).map((p) => p.sede))];
    for (const sede of sedes) {
      const etiqueta = etiquetaDeSede(sede);
      if (!etiqueta) continue;
      if (!titulos.has(etiqueta)) {
        await cw("/api/v1/accounts/:cuenta/labels", {
          metodo: "POST",
          cuerpo: { title: etiqueta, description: `Atendida por alguien de ${sede}`, color: "#3D588F", show_on_sidebar: true },
        });
        titulos.add(etiqueta);
      }
    }
    const etiquetasSede = [...titulos].filter((t) => t.startsWith("sede-"));
    const vigentes = new Set([...porCorreo.values()].map((a) => a.id));
    const reglas = lista(reglasRaw);
    for (const sede of sedes) {
      const etiqueta = etiquetaDeSede(sede);
      if (!etiqueta) continue;
      const nombre = `Sede ${sede.replace(/^sede\s+/i, "")}`;
      const regla = reglas.find((x) => x.name === nombre);
      const deEsta = quieren.filter((q) => q.p.sede === sede).map((q) => q.agente.id);
      // Se conservan los que la regla ya tenía y no son del panel
      // (agregados en configurar.rb), si siguen existiendo.
      const actuales = (regla?.conditions?.[0]?.values || []).map(Number);
      const ids = [...new Set([...actuales.filter((id) => !gestionados.has(id) && vigentes.has(id)), ...deEsta])];
      const cuerpo = {
        name: nombre,
        description: `Conversaciones asignadas a alguien de ${sede}.`,
        event_name: "conversation_updated",
        active: true,
        conditions: [{ attribute_key: "assignee_id", filter_operator: "equal_to", values: ids, query_operator: null }],
        actions: [
          { action_name: "add_label", action_params: [etiqueta] },
          { action_name: "remove_label", action_params: etiquetasSede.filter((t) => t !== etiqueta) },
        ],
      };
      const igual = regla && JSON.stringify([...actuales].sort()) === JSON.stringify([...ids].sort());
      if (!ids.length) {
        if (regla) await cw(`/api/v1/accounts/:cuenta/automation_rules/${regla.id}`, { metodo: "DELETE" });
      } else if (!regla) {
        await cw("/api/v1/accounts/:cuenta/automation_rules", { metodo: "POST", cuerpo });
      } else if (!igual) {
        await cw(`/api/v1/accounts/:cuenta/automation_rules/${regla.id}`, { metodo: "PATCH", cuerpo });
      }
    }

    // ── 4. Disponibilidad del panel → Chatwoot ──
    for (const { p, agente } of quieren) {
      const disponibilidad = DISPONIBILIDAD_CHATWOOT[p.disponibilidad] || "offline";
      await cw(`/api/v1/accounts/:cuenta/agents/${agente.id}`, { metodo: "PATCH", cuerpo: { availability: disponibilidad } });
    }

    return responder({ ok: true, ...r, enChat: quieren.length });
  } catch (e) {
    return responder({ error: "No se pudo sincronizar con Chatwoot. " + e.message, ...r }, 502);
  }
}
