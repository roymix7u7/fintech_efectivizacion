import { etiquetaDeSede } from "@/lib/atencion";
import { chat, ROL_CHAT, DISPONIBILIDAD_CHAT } from "@/lib/chatApi";
import { responder } from "@/lib/chatwootApi";

/**
 * Lleva al chat propio lo que dice Equipo en el panel. Hace lo mismo que
 * la sincronización con Chatwoot (app/api/atencion/sincronizar/route.js):
 *
 *   · "Atiende chat" y activa → existe en el chat con su mismo correo,
 *     con su rol (supervisor/admin → jefe, gestor/pagos → asesor) y su
 *     disponibilidad del panel. Se da de alta sin correo ni contraseña:
 *     entra con "Abrir chat de atención".
 *   · Asesores: dentro del equipo y de las bandejas (reparto). Jefes: fuera.
 *   · Sin la marca o bloqueada → sale del chat.
 *   · Su sede → la regla que etiqueta sus conversaciones (sede-lince…).
 *
 * Se puede correr las veces que haga falta: solo corrige diferencias.
 * No borra a un administrador del chat (avisa) y no toca a quien no está
 * en el panel.
 */
const BANDEJAS = ["Web AlToque", "App AlToque", "Visitantes web"];
const EQUIPO = "atención al cliente";

/** "ana.torres@x.pe" → "Ana Torres": nombre inicial en el chat. */
const nombreDe = (correo) =>
  correo
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ") || correo;

/** Ids de asesores que una regla de sede ya tenía en su condición. */
const idsDeRegla = (regla) => [regla?.conditions?.[0]?.value ?? []].flat().map(Number).filter(Number.isInteger);

export async function sincronizarPropio(equipo) {
  const r = { altas: [], invitados: [], actualizados: [], quitados: [], avisos: [] };
  try {
    const [agentes, bandejasTodas, equipos, reglas, etiquetas] = await Promise.all([
      chat("/v1/agents"),
      chat("/v1/inboxes"),
      chat("/v1/teams"),
      chat("/v1/automation-rules"),
      chat("/v1/labels"),
    ]);
    const porCorreo = new Map(agentes.map((a) => [(a.email || "").toLowerCase(), a]));
    const gestionados = new Set(); // ids del chat del personal del panel (vigentes o quitados)
    const quieren = []; // { p, agente }

    // ── 1. Personas ──
    for (const p of equipo) {
      const correo = (p.email || "").toLowerCase();
      if (!correo) continue;
      let a = porCorreo.get(correo);
      const quiere = p.atiende_chat && p.estado !== "bloqueado";
      const rol = ROL_CHAT[p.rol];
      if (a) gestionados.add(a.id);

      if (quiere) {
        if (!a) {
          a = await chat("/v1/agents", { metodo: "POST", cuerpo: { email: correo, name: nombreDe(correo), role: rol } });
          r.altas.push(correo);
          porCorreo.set(correo, a);
          gestionados.add(a.id);
        } else if (a.role === "administrador") {
          // Un administrador del chat no se baja de rol desde aquí.
        } else if (a.role !== rol) {
          a = await chat(`/v1/agents/${a.id}`, { metodo: "PATCH", cuerpo: { role: rol } });
          r.actualizados.push(correo);
        }
        quieren.push({ p, agente: a });
      } else if (a) {
        if (a.role === "administrador") {
          r.avisos.push(`${correo} es administrador en el chat: si ya no debe entrar, quítalo a mano (Ajustes → Asesores).`);
        } else {
          await chat(`/v1/agents/${a.id}`, { metodo: "DELETE" });
          porCorreo.delete(correo);
          r.quitados.push(correo);
        }
      }
    }

    // ── 2. Reparto: asesores dentro, jefes fuera ──
    const asesores = quieren.filter((q) => q.agente.role === "asesor").map((q) => q.agente.id);
    const jefes = quieren.filter((q) => q.agente.role !== "asesor").map((q) => q.agente.id);
    const bandejas = bandejasTodas.filter((i) => BANDEJAS.includes(i.name));
    if (bandejas.length < BANDEJAS.length) {
      const faltan = BANDEJAS.filter((n) => !bandejas.some((i) => i.name === n));
      r.avisos.push(`Faltan bandejas en el chat (${faltan.join(", ")}): corre soporte/altoque-chat/configurar.mjs.`);
    }
    for (const i of bandejas) {
      if (asesores.length) await chat(`/v1/inboxes/${i.id}/members`, { metodo: "POST", cuerpo: { user_ids: asesores } });
      for (const id of jefes) await chat(`/v1/inboxes/${i.id}/members/${id}`, { metodo: "DELETE" });
    }
    const equipoChat = equipos.find((t) => t.name === EQUIPO);
    if (equipoChat) {
      if (asesores.length) await chat(`/v1/teams/${equipoChat.id}/members`, { metodo: "POST", cuerpo: { user_ids: asesores } });
      for (const id of jefes) await chat(`/v1/teams/${equipoChat.id}/members/${id}`, { metodo: "DELETE" });
    } else if (asesores.length) {
      r.avisos.push(`No existe el equipo "${EQUIPO}" en el chat: corre soporte/altoque-chat/configurar.mjs.`);
    }

    // ── 3. Sede de cada uno → regla que etiqueta sus conversaciones ──
    const titulos = new Set(etiquetas.map((l) => l.title));
    const sedes = [...new Set(equipo.filter((p) => p.sede).map((p) => p.sede))];
    for (const sede of sedes) {
      const etiqueta = etiquetaDeSede(sede);
      if (!etiqueta || titulos.has(etiqueta)) continue;
      await chat("/v1/labels", { metodo: "POST", cuerpo: { title: etiqueta, description: `Atendida por alguien de ${sede}`, color: "#3D588F" } });
      titulos.add(etiqueta);
    }
    const etiquetasSede = [...titulos].filter((t) => t.startsWith("sede-"));
    const vigentes = new Set([...porCorreo.values()].map((a) => a.id));
    for (const sede of sedes) {
      const etiqueta = etiquetaDeSede(sede);
      if (!etiqueta) continue;
      const nombre = `Sede ${sede.replace(/^sede\s+/i, "")}`;
      const regla = reglas.find((x) => x.name === nombre);
      const deEsta = quieren.filter((q) => q.p.sede === sede).map((q) => q.agente.id);
      // Se conservan los que la regla ya tenía y no son del panel, si siguen existiendo.
      const actuales = idsDeRegla(regla);
      const ids = [...new Set([...actuales.filter((id) => !gestionados.has(id) && vigentes.has(id)), ...deEsta])];
      const cuerpo = {
        name: nombre,
        event: "conversation_assigned",
        match: "all",
        active: true,
        conditions: [{ attribute: "assignee_id", operator: "equals", value: ids.map(String) }],
        actions: [
          { type: "add_label", value: etiqueta },
          ...etiquetasSede.filter((t) => t !== etiqueta).map((t) => ({ type: "remove_label", value: t })),
        ],
      };
      const igual = regla && JSON.stringify([...actuales].sort()) === JSON.stringify([...ids].sort()) && regla.actions.length === cuerpo.actions.length;
      if (!ids.length) {
        if (regla) await chat(`/v1/automation-rules/${regla.id}`, { metodo: "DELETE" });
      } else if (!regla) {
        await chat("/v1/automation-rules", { metodo: "POST", cuerpo });
      } else if (!igual) {
        await chat(`/v1/automation-rules/${regla.id}`, { metodo: "PATCH", cuerpo });
      }
    }

    // ── 4. Disponibilidad del panel → chat ──
    for (const { p, agente } of quieren) {
      const disponibilidad = DISPONIBILIDAD_CHAT[p.disponibilidad] || "offline";
      if (agente.availability !== disponibilidad) await chat(`/v1/agents/${agente.id}`, { metodo: "PATCH", cuerpo: { availability: disponibilidad } });
    }

    return responder({ ok: true, ...r, enChat: quieren.length });
  } catch (e) {
    return responder({ error: "No se pudo sincronizar con el chat. " + e.message, ...r }, 502);
  }
}
