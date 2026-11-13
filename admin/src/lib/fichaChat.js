import { supabase } from "@/lib/supabase";
import { nombreBanco } from "@/lib/bancos";

/**
 * La ficha del cliente para el panel lateral del chat.
 *
 * El chat (incrustado en /chat) pregunta por el contacto de la conversación
 * abierta y components/chatIncrustado.jsx le responde con lo que arma esta
 * función. Se lee con la sesión del asesor: las políticas de la base
 * deciden qué ve cada rol (igual que en /soporte/ficha), y el chat nunca
 * toca la base.
 *
 * Devuelve una "tarjeta" que el chat dibuja tal cual (no sabe de AlToque):
 *   { title, subtitle, badges[], alerts[], facts[], stats[], actions[], sections[] }
 * o null si no hay nada que mostrar (el chat deja su tarjeta de contacto).
 *
 * Tonos (tone): "ok" | "warn" | "danger" | "soft" | "".
 */
const fecha = (f, conHora = false) =>
  f
    ? new Date(String(f).length === 10 ? `${f}T12:00:00` : f).toLocaleString("es-PE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(conHora && { hour: "numeric", minute: "2-digit" }),
      })
    : "";

const nueveDigitos = (t) => {
  const d = String(t || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
};
const celularLegible = (t) => {
  const d = nueveDigitos(t);
  return d ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : t || "";
};
const agrupar = (n) =>
  String(n || "")
    .replace(/\s/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const ESTADO_CUENTA = {
  activo: { text: "Cuenta activa", tone: "ok" },
  pendiente: { text: "En revisión", tone: "warn" },
  observado: { text: "Observada", tone: "warn" },
  bloqueado: { text: "Bloqueada", tone: "danger" },
};
const ESTADO_SOLICITUD = {
  pendiente: { text: "En revisión", tone: "warn" },
  aprobado: { text: "Aprobada", tone: "soft" },
  pagado: { text: "Pagada", tone: "ok" },
  rechazado: { text: "Rechazada", tone: "danger" },
};
const ESTADO_TARJETA = {
  pendiente: { text: "En revisión", tone: "warn" },
  aprobado: { text: "Aprobada", tone: "ok" },
  aprobada: { text: "Aprobada", tone: "ok" },
  activo: { text: "Aprobada", tone: "ok" },
  rechazado: { text: "Rechazada", tone: "danger" },
  rechazada: { text: "Rechazada", tone: "danger" },
};

/** Quien escribe sin cuenta: lo que se sabe y qué hacer. */
function tarjetaVisitante(contacto, celular) {
  return {
    title: contacto.name || "Visitante",
    subtitle: "Todavía no es cliente",
    badges: [{ text: "Sin cuenta", tone: "" }],
    alerts: [
      {
        tone: "info",
        title: "Solo información general.",
        text: "No tiene cuenta en AlToque (o escribe sin haber ingresado). Para ver datos de una cuenta, pídele que ingrese y escriba desde Mi cuenta.",
      },
    ],
    facts: [
      celular && { label: "Celular", value: celularLegible(celular), copy: nueveDigitos(celular) || celular },
      contacto.email && { label: "Correo", value: contacto.email, copy: contacto.email },
      contacto.custom_attributes?.pagina && { label: "Escribe desde", value: String(contacto.custom_attributes.pagina) },
    ].filter(Boolean),
    actions: [{ label: "Registrarlo como cliente", href: "/alta-presencial" }],
    sections: [],
  };
}

export async function tarjetaDelCliente(contacto) {
  if (!contacto) return null;
  const celular = contacto.phone || contacto.phone_number || contacto.custom_attributes?.celular || null;
  const columnas =
    "id, user_id, nombres, apellidos, tipo_documento, dni, telefono, created_at, fecha_validacion, " +
    "motivo_observacion, motivo_bloqueo, tasa_comision, cupon_desde, cupon_hasta, origen";

  // ── Quién es: por su cuenta (identidad firmada) o, si no, por su celular ──
  let perfil = null;
  let porTelefono = false;
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contacto.identifier || "");
  if (esUuid) {
    const { data, error } = await supabase.from("perfiles_cliente").select(columnas).eq("user_id", contacto.identifier).maybeSingle();
    if (error) return null; // este rol no ve fichas: el chat deja su tarjeta de contacto
    perfil = data;
  }
  const cel = nueveDigitos(celular);
  if (!perfil && cel) {
    const { data, error } = await supabase
      .from("perfiles_cliente")
      .select(columnas)
      .or(`telefono.eq.${cel},telefono.eq.+51${cel},telefono.eq.51${cel}`)
      .limit(2);
    if (error) return null;
    // Dos cuentas con el mismo celular: no se adivina cuál es.
    if (data?.length === 1) {
      perfil = data[0];
      porTelefono = true;
    }
  }
  if (!perfil) return tarjetaVisitante(contacto, celular);

  const [cuenta, solicitudes, tarjetas, cuentas, gestiones, reclamos] = await Promise.all([
    supabase.from("users").select("email, estado").eq("id", perfil.user_id).maybeSingle(),
    supabase
      .from("solicitudes")
      .select("id, codigo, banco, estado, motivo_rechazo, created_at, modalidad, fecha_deposito, deposito_banco, deposito_ultimos4, pagado_en")
      .eq("cliente_id", perfil.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("tarjetas").select("id, banco, ultimos_4, estado, activa, motivo_rechazo").eq("cliente_id", perfil.id).order("created_at", { ascending: false }),
    supabase.from("cuentas_bancarias").select("id, banco, tipo, numero_cuenta, activa").eq("cliente_id", perfil.id).order("created_at", { ascending: false }),
    supabase.rpc("ficha_cliente", { p_cliente: perfil.id }),
    supabase.from("reclamaciones").select("id, codigo, estado, creado_en, vence_en, respondido_en").eq("user_id", perfil.user_id).order("creado_en", { ascending: false }).limit(5),
  ]);
  const sols = solicitudes.data || [];
  const tarj = tarjetas.data || [];
  const ctas = cuentas.data || [];
  const recl = reclamos.data || [];
  const gest = (gestiones.data?.seguimientos || []).filter((g) => g.canal !== "recordatorio").slice(0, 3);
  const estado = cuenta.data?.estado;
  const nombre = `${perfil.nombres || ""} ${perfil.apellidos || ""}`.trim() || contacto.name || "Sin nombre";
  const hoy = new Date().toISOString().slice(0, 10);
  const cupon = perfil.tasa_comision != null && perfil.cupon_hasta && perfil.cupon_hasta.slice(0, 10) >= hoy;
  const cuantas = (k) => sols.filter((s) => s.estado === k).length;
  const enCurso = sols.filter((s) => s.estado === "pendiente" || s.estado === "aprobado");
  const reclamosAbiertos = recl.filter((r) => !r.respondido_en);

  // ── Lo que hay que saber antes de responder ──
  const alerts = [];
  if (porTelefono) {
    alerts.push({ tone: "warn", title: "Encontrado por su celular.", text: "Confirma su DNI antes de darle datos de su cuenta." });
  }
  if (estado === "bloqueado") alerts.push({ tone: "danger", title: "Cuenta bloqueada.", text: perfil.motivo_bloqueo || "Sin motivo registrado." });
  if (estado === "observado") alerts.push({ tone: "warn", title: "Debe corregir sus datos.", text: perfil.motivo_observacion || "Sin motivo registrado." });
  if (estado === "pendiente") alerts.push({ tone: "info", title: "Cuenta en revisión.", text: "Todavía no puede operar; se le avisa apenas se apruebe." });
  if (reclamosAbiertos.length) {
    alerts.push({
      tone: "danger",
      title: `${plural(reclamosAbiertos.length, "reclamo", "reclamos")} sin responder.`,
      text: reclamosAbiertos.map((r) => `${r.codigo}${r.vence_en ? ` (vence ${fecha(r.vence_en)})` : ""}`).join(" · "),
    });
  }

  const detalleSolicitud = (s) => {
    if (s.estado === "pagado" && s.pagado_en) {
      return `Pagada el ${fecha(s.pagado_en, true)}${s.deposito_banco ? ` en ${nombreBanco(s.deposito_banco)} •••• ${String(s.deposito_ultimos4 || "").slice(-4)}` : ""}`;
    }
    if (s.fecha_deposito) return `Depósito ${fecha(s.fecha_deposito)} · ${s.modalidad === "siguiente" ? "al día siguiente" : "para hoy"}`;
    return `Enviada el ${fecha(s.created_at, true)}`;
  };
  const ordenadas = [...enCurso, ...sols.filter((s) => !enCurso.includes(s))];

  return {
    title: nombre,
    subtitle: `${(perfil.tipo_documento || "dni").toUpperCase()} ${perfil.dni}${perfil.origen === "presencial" ? " · Registrado en local" : ""}`,
    badges: [
      ESTADO_CUENTA[estado] || { text: estado || "Sin estado", tone: "" },
      !porTelefono && { text: "Identidad confirmada", tone: "ok" },
      cupon && { text: `Cupón ${Number(perfil.tasa_comision).toLocaleString("es-PE")} %`, tone: "soft" },
    ].filter(Boolean),
    alerts,
    facts: [
      { label: perfil.tipo_documento === "ce" ? "CE" : "DNI", value: perfil.dni, copy: perfil.dni },
      { label: "Celular", value: celularLegible(perfil.telefono), copy: nueveDigitos(perfil.telefono) || perfil.telefono },
      cuenta.data?.email && { label: "Correo", value: cuenta.data.email, copy: cuenta.data.email },
      { label: "Cliente desde", value: fecha(perfil.created_at) },
      cupon && { label: "Comisión", value: `${Number(perfil.tasa_comision).toLocaleString("es-PE")} % hasta ${fecha(perfil.cupon_hasta)}` },
      contacto.custom_attributes?.pantalla && { label: "Está en", value: String(contacto.custom_attributes.pantalla) },
    ].filter(Boolean),
    stats: [
      { label: "En curso", value: enCurso.length },
      { label: "Pagadas", value: cuantas("pagado") },
      { label: "Rechazadas", value: cuantas("rechazado") },
    ],
    actions: [],
    sections: [
      {
        id: "solicitudes",
        title: "Solicitudes",
        count: sols.length,
        open: enCurso.length > 0,
        empty: "Todavía no hizo ninguna solicitud.",
        more: sols.length > 6 ? `Se muestran 6 de ${sols.length}. Las demás están en Clientes del panel.` : "",
        items: ordenadas.slice(0, 6).map((s) => ({
          title: s.codigo,
          mono: true,
          badge: ESTADO_SOLICITUD[s.estado] || { text: s.estado, tone: "" },
          detail: `Tarjeta ${nombreBanco(s.banco)} · ${detalleSolicitud(s)}`,
          note: s.estado === "rechazado" && s.motivo_rechazo ? `Motivo: ${s.motivo_rechazo}` : "",
          noteTone: "danger",
        })),
      },
      {
        id: "tarjetas",
        title: "Tarjetas",
        count: tarj.length,
        empty: "Sin tarjetas registradas.",
        items: tarj.map((t) => ({
          title: `${nombreBanco(t.banco)} •••• ${String(t.ultimos_4 || "").slice(-4)}`,
          badge: t.activa ? ESTADO_TARJETA[t.estado] || { text: t.estado, tone: "" } : { text: "De baja", tone: "" },
          note: t.estado?.startsWith("rechaz") && t.motivo_rechazo ? `Motivo: ${t.motivo_rechazo}` : "",
          noteTone: "danger",
          dim: !t.activa,
        })),
      },
      {
        id: "cuentas",
        title: "Cuentas para depósito",
        count: ctas.length,
        empty: "Sin cuentas registradas.",
        items: ctas.map((c) => ({
          title: `${nombreBanco(c.banco)} · ${c.tipo === "interbancaria" ? "CCI" : "Ahorros"}`,
          detail: agrupar(c.numero_cuenta),
          mono: false,
          copy: c.numero_cuenta,
          badge: c.activa ? null : { text: "De baja", tone: "" },
          dim: !c.activa,
        })),
      },
      gest.length > 0 && {
        id: "gestiones",
        title: "Últimas gestiones",
        count: gest.length,
        empty: "",
        items: gest.map((g) => ({
          title: [g.canal, g.resultado].filter(Boolean).join(" · ") || "Gestión",
          detail: fecha(g.created_at || g.creado_en, true),
          note: g.nota || "",
        })),
      },
      recl.length > 0 && {
        id: "reclamos",
        title: "Reclamos",
        count: recl.length,
        empty: "",
        items: recl.map((r) => ({
          title: r.codigo,
          mono: true,
          badge: r.respondido_en ? { text: "Respondido", tone: "ok" } : { text: "Sin responder", tone: "danger" },
          detail: `Registrado el ${fecha(r.creado_en)}${!r.respondido_en && r.vence_en ? ` · vence ${fecha(r.vence_en)}` : ""}`,
        })),
      },
    ].filter(Boolean),
  };
}
