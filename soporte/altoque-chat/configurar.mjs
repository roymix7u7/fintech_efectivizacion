// Deja el chat propio (AlToque Chat) configurado como estaba Chatwoot:
// bandejas, horario, respuestas rápidas, etiquetas, reglas, equipo, macros,
// atributos, la ficha del cliente y el aviso al cliente cuando le responden.
// Es el equivalente de soporte/chatwoot/configurar.rb.
//
// Se puede correr las veces que haga falta: actualiza lo que ya existe y
// no duplica nada. Necesita Node 18 o superior y nada más.
//
//   CHAT_URL=https://chat2.tudominio.com CHAT_API_TOKEN=atk_... \
//   FICHA_URL=https://<panel>/soporte/ficha DOMINIOS=www.tudominio.com,tudominio.com \
//   AVISOS_URL=https://<proyecto>.supabase.co/functions/v1/chatwoot-avisos AVISOS_SECRETO=... \
//   node configurar.mjs
//
// Los textos de comisiones, plazos, horario y locales salen de
// admin/src/components/sitio/datos.js: si cambian allá, se cambian aquí.
// Quién atiende, con qué rol y de qué sede lo lleva el panel (Equipo →
// "Sincronizar chat"), no este script.

const CHAT_URL = (process.env.CHAT_URL || "http://localhost:4000").replace(/\/$/, "");
const TOKEN = process.env.CHAT_API_TOKEN;
const FICHA_URL = process.env.FICHA_URL || "http://localhost:3000/soporte/ficha";
// Dominios (sin https://) desde donde se puede mostrar el chat de la web y el de visitantes.
const DOMINIOS = (process.env.DOMINIOS || "localhost").split(",").map((d) => d.trim().replace(/^https?:\/\//, "").replace(/[/:].*$/, "")).filter(Boolean);
const LOGO_URL = process.env.LOGO_URL || "";
if (!TOKEN) {
  console.error("Falta CHAT_API_TOKEN (Ajustes → Tokens de API, o node src/cli.js create-token en el servidor del chat).");
  process.exit(1);
}

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(`${CHAT_URL}/api/v1${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(cuerpo && { "Content-Type": "application/json" }) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${j.message || ""}`);
  return j;
}
const hecho = (texto) => console.log(`  ✓ ${texto}`);

/** Crea o actualiza por una clave (nombre, título, atajo…). Devuelve la fila. */
async function guardar(ruta, clave, valor, cuerpo, lista) {
  const actual = (lista || (await api("GET", ruta))).find((x) => x[clave] === valor);
  return actual ? api("PATCH", `${ruta}/${actual.id}`, cuerpo) : api("POST", ruta, { [clave]: valor, ...cuerpo });
}

// ── 1. Bandejas: imagen del chat, identidad, horario ──────────────────
console.log("Bandejas");
const VISITANTES = "Visitantes web";
const BANDEJAS = ["Web AlToque", "App AlToque", VISITANTES];
// El chat recién instalado trae "Clientes" y "Visitantes": se renombran.
const ANTES = { "Web AlToque": "Clientes", [VISITANTES]: "Visitantes" };
// 0 = domingo. Lunes a sábado de 9:00 a 18:00; domingo cerrado.
const HORARIO = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ enabled: d !== 0, open: "09:00", close: "18:00" }));
// Celular peruano: 9 dígitos que empiezan con 9; se aceptan espacios y el +51 delante.
const CELULAR = "^(\\+?51 ?)?9\\d{2} ?\\d{3} ?\\d{3}$";

let bandejas = await api("GET", "/inboxes");
const ids = {};
for (const nombre of BANDEJAS) {
  const visitantes = nombre === VISITANTES;
  const actual = bandejas.find((i) => i.name === nombre) || bandejas.find((i) => i.name === ANTES[nombre]);
  const ajustes = {
    name: nombre,
    channel: "web",
    widget_color: "#0F1B33",
    welcome_title: "Hola, somos AlToque 👋",
    welcome_text: visitantes
      ? "¿Quieres efectivizar tu tarjeta? Déjanos tu nombre y celular para poder responderte. Atendemos de lunes a sábado, de 9:00 a. m. a 6:00 p. m."
      : "Escríbenos tu consulta. Atendemos de lunes a sábado, de 9:00 a. m. a 6:00 p. m.",
    reply_time: "few_minutes",
    // Web y app: solo con identidad firmada (HMAC). Visitantes: abierto,
    // pero con nombre y celular antes de escribir y límite por IP.
    require_identity: !visitantes,
    prechat_enabled: visitantes,
    prechat_fields: [
      { key: "name", label: "Nombre", type: "text", required: true },
      { key: "phone", label: "Celular", type: "phone", required: true },
    ],
    phone_regex: CELULAR,
    phone_max_len: 15,
    rate_chats_per_min: visitantes ? 10 : 0,
    rate_msgs_per_min: visitantes ? 30 : 0,
    // El app no es una página web: no se limita por dominio.
    allowed_domains: nombre === "App AlToque" ? [] : DOMINIOS,
    max_attachment_mb: 40,
    // El cliente ve "Asesor AlToque" y el logo, no el nombre ni la foto de quien lo atiende.
    anonymize_agent: true,
    public_agent_name: "Asesor AlToque",
    public_avatar_url: LOGO_URL,
    timezone: "America/Lima",
    business_hours_enabled: true,
    business_hours: HORARIO,
    out_of_office_message: "Ahora estamos fuera de horario. Te respondemos desde las 9:00 a. m. Atendemos de lunes a sábado, de 9:00 a. m. a 6:00 p. m.",
    // El saludo solo sale dentro del horario; fuera de él va el aviso de arriba.
    greeting_enabled: true,
    greeting_message: "Hola, recibimos tu mensaje. Un asesor te responderá por aquí mismo.",
    csat_enabled: true,
    auto_assign: true,
    allow_emoji: true,
    allow_attachments: true,
  };
  const fila = actual ? await api("PATCH", `/inboxes/${actual.id}`, ajustes) : await api("POST", "/inboxes", ajustes);
  ids[nombre] = fila.id;
  hecho(`${nombre}: ${visitantes ? "formulario de nombre y celular, 10 chats y 30 mensajes por minuto por IP" : "identidad firmada obligatoria"}, horario L-S 9:00–18:00`);
}
bandejas = await api("GET", "/inboxes");

// ── 2. Respuestas rápidas (se usan escribiendo / en el chat) ──────────
console.log("Respuestas rápidas");
const RESPUESTAS = {
  saludo: "Hola, {{contact.first_name}}. Gracias por escribirnos, te atiende {{agent.first_name}}. ¿En qué te ayudo?",
  horario: "Atendemos de lunes a sábado, de 9:00 a. m. a 6:00 p. m. (refrigerio de 1:00 a 2:00 p. m.).",
  plazos:
    "Así depositamos:\n• Normalmente en 1 hora, desde que aprobamos tu comprobante.\n• De 2 a 3 horas en días de alta demanda.\n" +
    "• Al siguiente día hábil si fallan los sistemas bancarios.\n• En la mañana siguiente si nos envías fuera de horario.",
  comisiones:
    "Nuestras comisiones por operación:\n• BCP y BBVA: 1 %. Mínimo S/ 12 en montos menores a S/ 1,200.\n" +
    "• BanBif: 1 % con depósito al día siguiente (1.5 % si lo quieres hoy). Mínimo S/ 12 bajo S/ 1,200.\n" +
    "• Scotiabank: 1 % con depósito al día siguiente (1.5 % si lo quieres hoy). Mínimo S/ 20 bajo S/ 2,000.\n" +
    "• Interbank y CMR: 2 %, con código. Mínimo S/ 30 bajo S/ 1,500.\n• iO: 2 %, con código. Mínimo S/ 30 bajo S/ 1,000.",
  bcp: "Con tarjeta BCP la comisión es 1 %. En montos menores a S/ 1,200 se cobra el mínimo de S/ 12.",
  bbva: "Con tarjeta BBVA la comisión es 1 %. En montos menores a S/ 1,200 se cobra el mínimo de S/ 12.",
  banbif: "Con tarjeta BanBif la comisión es 1 % si el depósito es al día siguiente, o 1.5 % si lo quieres hoy. En montos menores a S/ 1,200 se cobra el mínimo de S/ 12.",
  scotiabank: "Con tarjeta Scotiabank la comisión es 1 % si el depósito es al día siguiente, o 1.5 % si lo quieres hoy. En montos menores a S/ 2,000 se cobra el mínimo de S/ 20.",
  interbank: "Con tarjeta Interbank la comisión es 2 % y la operación se hace con código. En montos menores a S/ 1,500 se cobra el mínimo de S/ 30.",
  cmr: "Con tarjeta CMR la comisión es 2 % y la operación se hace con código. En montos menores a S/ 1,500 se cobra el mínimo de S/ 30.",
  io: "Con tarjeta iO la comisión es 2 % y la operación se hace con código. En montos menores a S/ 1,000 se cobra el mínimo de S/ 30.",
  locales:
    "Te atendemos en persona en:\n• Lince: Jr. Manuel Candamo 278, 2.° piso (a media cuadra del Edificio El Almirante).\n" +
    "• San Juan de Miraflores: Calle Algarrobos 103 (frente a la Estación Atocongo).\n• Los Olivos: Santa Cruz de Pachacútec 214 (frente a Mega Plaza).",
  requisitos: "Para operar necesitas tu DNI o carnet de extranjería, una selfie con tu documento, la foto de tu tarjeta y una cuenta de ahorros a tu nombre.",
  "que-es": "Efectivizar tu tarjeta es convertir parte de la línea de tu tarjeta de crédito en dinero en tu cuenta. Operas con tu tarjeta, nos envías el comprobante y te depositamos.",
  terceros: "Por tu seguridad, solo depositamos en cuentas a tu nombre, nunca a terceros. Lo normal es tu cuenta de ahorros; si en algún caso no se puede, usamos tu CCI y te avisamos.",
  seguridad: "Tus datos están protegidos: verificamos tu identidad, tus documentos se guardan cifrados y solo depositamos en cuentas a tu nombre.",
  independientes: "Somos una empresa independiente, no estamos afiliados a los bancos. Los nombres de los bancos solo indican qué tarjetas aceptamos.",
  verificacion: "Estamos revisando tus datos. Apenas terminemos te avisamos en la app y en tu cuenta web.",
  reclamo: "Lamentamos lo ocurrido. Si quieres dejar constancia formal, puedes registrar tu reclamo en nuestro Libro de Reclamaciones: en la web, al pie de la página, o en la app, desde el menú.",
  clave: "Por tu seguridad, nunca te pediremos la clave de tu tarjeta, el código CVV ni claves de tu banca por internet. No los compartas con nadie, ni con nosotros.",
  contacto: "También puedes escribirnos por WhatsApp al 993 918 842 o llamarnos al 926 518 180.",
  despedida: "Gracias por escribirnos, {{contact.first_name}}. Si necesitas algo más, aquí estamos.",
  // Para el chat de visitantes (sin cuenta): nada de datos de cuentas ahí.
  ingresa: "Por tu seguridad, los datos de tu cuenta solo te los damos desde tu cuenta. Ingresa a la app o a la web y escríbenos desde Ayuda: te atendemos ahí mismo.",
  registro: 'Crear tu cuenta toma unos minutos: descarga la app AlToque o entra a nuestra web y elige "Crear cuenta". Ten a mano tu DNI y la tarjeta que vas a usar. Apenas validemos tus datos, ya puedes hacer tu primera solicitud.',
};
const respuestas = await api("GET", "/canned-responses");
for (const [codigo, texto] of Object.entries(RESPUESTAS)) await guardar("/canned-responses", "short_code", codigo, { content: texto }, respuestas);
hecho(`${Object.keys(RESPUESTAS).length} respuestas (escribe / en una conversación)`);

// ── 3. Etiquetas ──────────────────────────────────────────────────────
console.log("Etiquetas");
const ETIQUETAS = {
  solicitud: ["#3D588F", "Consultas sobre una solicitud"],
  deposito: ["#0F9D58", "Depósitos y plazos"],
  tarjeta: ["#C49B00", "Tarjetas y cuentas bancarias"],
  verificacion: ["#7C3AED", "Revisión de identidad y documentos"],
  comisiones: ["#0891B2", "Precios y comisiones"],
  reclamo: ["#DC2626", "Reclamos y quejas"],
  prospecto: ["#E8B800", "Visitante sin cuenta (chat de la landing)"],
  spam: ["#6B7280", "Mensajes basura o abuso: se resuelven sin responder"],
  "documentos-registrados": ["#0F766E", "Las fotos del cliente ya se cargaron al panel"],
  "para-supervisor": ["#B45309", "El asesor pidió que la vea un supervisor"],
};
const etiquetas = await api("GET", "/labels");
for (const [titulo, [color, descripcion]] of Object.entries(ETIQUETAS)) await guardar("/labels", "title", titulo, { color, description: descripcion }, etiquetas);
hecho(Object.keys(ETIQUETAS).join(", "));

// ── 4. Equipo único con reparto automático ────────────────────────────
// Un solo equipo: responde el asesor que esté libre, sea de la sede que
// sea. Los miembros los pone el panel (Equipo → "Sincronizar chat").
console.log("Equipo");
const equipo = await guardar("/teams", "name", "atención al cliente", { description: "Asesores del chat de la web y el app." });
hecho("atención al cliente");

// ── 5. Reglas automáticas ─────────────────────────────────────────────
console.log("Reglas automáticas");
const reglas = await api("GET", "/automation-rules");
const regla = (nombre, cuerpo) => guardar("/automation-rules", "name", nombre, { active: true, match: "all", ...cuerpo }, reglas);
// Etiquetan según lo que escribe el cliente (basta con una de las palabras).
const porPalabras = (nombre, palabras, acciones) =>
  regla(nombre, {
    event: "message_created",
    conditions: [
      { attribute: "message_type", operator: "equals", value: "incoming" },
      { attribute: "content", operator: "contains", value: palabras },
    ],
    actions: acciones,
  });
const etiqueta = (t) => ({ type: "add_label", value: t });

await porPalabras("Reclamo: etiqueta y prioridad urgente", ["reclamo", "reclamar", "queja", "denuncia", "indecopi", "estafa"], [etiqueta("reclamo"), { type: "set_priority", value: "urgent" }]);
await porPalabras("Depósito: etiqueta", ["depósito", "deposito", "depositaron", "depositan", "transferencia", "abono", "llegó", "llego", "plata"], [etiqueta("deposito")]);
await porPalabras("Solicitud: etiqueta", ["solicitud", "operación", "operacion", "comprobante", "voucher"], [etiqueta("solicitud")]);
await porPalabras("Tarjeta: etiqueta", ["tarjeta", "cuenta bancaria", "cci"], [etiqueta("tarjeta")]);
await porPalabras("Verificación: etiqueta", ["verificación", "verificacion", "verificar", "dni", "selfie", "revisión", "revision", "observad", "documento"], [etiqueta("verificacion")]);
await porPalabras("Comisiones: etiqueta", ["comisión", "comision", "cuánto cobran", "cuanto cobran", "porcentaje", "tarifa"], [etiqueta("comisiones")]);
await regla("Toda conversación nueva al equipo", {
  event: "conversation_created",
  conditions: [{ attribute: "inbox_id", operator: "equals", value: BANDEJAS.map((n) => String(ids[n])) }],
  actions: [{ type: "assign_team", value: String(equipo.id) }],
});
await regla("Visitante sin cuenta: prospecto", {
  event: "conversation_created",
  conditions: [{ attribute: "inbox_id", operator: "equals", value: String(ids[VISITANTES]) }],
  actions: [etiqueta("prospecto")],
});
hecho("6 reglas por palabras, conversaciones nuevas al equipo, visitantes como prospecto");

// ── 6. Macros ─────────────────────────────────────────────────────────
// Las fotos del DNI o la tarjeta que llegan por el chat se registran en
// el panel (Alta presencial) y después se borran de aquí, para que no
// queden copias sueltas.
console.log("Macros");
const MACROS = {
  "Documentos registrados": [
    { type: "send_message", value: "Listo, ya registramos tus documentos en el sistema. Gracias por enviarlos." },
    { type: "add_note", value: "✅ Documentos cargados al panel. Ahora borra de este chat los mensajes con fotos del DNI o de la tarjeta (pasa el mouse sobre el mensaje → Eliminar)." },
    { type: "add_label", value: "documentos-registrados" },
  ],
  "Cerrar con despedida": [
    { type: "send_message", value: "Gracias por escribirnos, {{contact.first_name}}. Si necesitas algo más, aquí estamos." },
    { type: "set_status", value: "resolved" },
  ],
  "Pasar a supervisor": [
    { type: "set_priority", value: "urgent" },
    { type: "add_label", value: "para-supervisor" },
    { type: "add_note", value: "⚠️ Pasado a supervisor. Antes de soltarla, deja aquí una nota con lo que pasó y lo que pide el cliente." },
    { type: "unassign" },
  ],
  // Basura o abuso: fuera de la bandeja sin gastar una respuesta. Si
  // insiste, el asesor bloquea el contacto (panel derecho → Bloquear).
  "Marcar como spam": [{ type: "add_label", value: "spam" }, { type: "set_status", value: "resolved" }],
  // Pospuesta vuelve sola a la bandeja cuando el cliente responde.
  "Esperando al cliente": [
    { type: "send_message", value: "Quedo atento a lo que me envíes (el comprobante, la foto o el dato que te pedí). Apenas llegue, seguimos por aquí." },
    { type: "set_status", value: "snoozed" },
  ],
};
const macros = await api("GET", "/macros");
for (const [nombre, acciones] of Object.entries(MACROS)) await guardar("/macros", "name", nombre, { actions: acciones }, macros);
hecho(Object.keys(MACROS).join(", "));

// ── 7. Atributos ──────────────────────────────────────────────────────
console.log("Atributos");
// Por qué escribe el cliente. Lo elige el asesor en el panel derecho de
// la conversación y sale en el reporte de Atención (admin/src/lib/atencion.js).
const MOTIVOS = ["Solicitud", "Depósito", "Tarjeta o cuenta", "Verificación de cuenta", "Comisiones", "Reclamo", "Problema con la app o la web", "Información general", "Otro"];
const atributos = await api("GET", "/custom-attributes");
const atributo = async (model, key, cuerpo) => {
  const actual = atributos.find((a) => a.model === model && a.key === key);
  return actual ? api("PATCH", `/custom-attributes/${actual.id}`, cuerpo) : api("POST", "/custom-attributes", { model, key, ...cuerpo });
};
await atributo("conversation", "motivo", { label: "Motivo de contacto", type: "list", options: MOTIVOS });
// Dónde está el cliente en la web o la app (lo informa su navegador).
await atributo("contact", "pantalla", { label: "Pantalla actual", type: "text" });
hecho(`Motivo de contacto (${MOTIVOS.length} opciones), Pantalla actual`);

// ── 8. Cuenta y ficha del cliente, junto a cada conversación ──────────
console.log("Ficha del cliente");
await api("PUT", "/settings", { account: { name: "AlToque Perú WK", auto_resolve_days: 0 }, dashboard_app: { title: "Ficha del cliente", url: FICHA_URL } });
hecho(`pestaña "Ficha del cliente" → ${FICHA_URL}`);

// ── 9. Avisos al cliente cuando el asesor responde ────────────────────
// El chat avisa a la función chatwoot-avisos de Supabase, que manda la
// notificación del navegador y deja el aviso en la campana. Va firmado con
// AVISOS_SECRETO (el mismo que CHATWOOT_AVISOS_SECRETO en Supabase).
console.log("Avisos al cliente");
const avisosUrl = (process.env.AVISOS_URL || "").trim();
const avisosSecreto = (process.env.AVISOS_SECRETO || "").trim();
if (!avisosUrl || !avisosSecreto) {
  console.log("  · sin AVISOS_URL y AVISOS_SECRETO: no se tocan los avisos");
} else {
  // Uno solo: si cambió la dirección, se reemplaza el anterior.
  const ganchos = await api("GET", "/webhooks");
  for (const g of ganchos) if (g.url.includes("/functions/v1/chatwoot-avisos") && g.url !== avisosUrl) await api("DELETE", `/webhooks/${g.id}`);
  await guardar("/webhooks", "url", avisosUrl, { secret: avisosSecreto, events: ["message_created"], active: true }, ganchos);
  hecho(`el chat avisa a ${avisosUrl} (firmado)`);
}

// ── Lo que hay que copiar al panel ────────────────────────────────────
const token = (nombre) => bandejas.find((i) => i.name === nombre)?.widget_token;
console.log("\nVariables para el panel (Vercel). Los tokens del widget son públicos:");
console.log(`  NEXT_PUBLIC_CHAT_URL=${CHAT_URL}`);
console.log(`  NEXT_PUBLIC_CHAT_WEB_TOKEN=${token("Web AlToque")}`);
console.log(`  NEXT_PUBLIC_CHAT_VISITANTES_TOKEN=${token(VISITANTES)}`);
console.log("  CHAT_API_TOKEN=<el token de administrador que usaste aquí>");
if (process.env.MOSTRAR_CLAVES === "1") {
  console.log("\nClaves para firmar la identidad (secretas: solo para Supabase):");
  const clave = (nombre) => bandejas.find((i) => i.name === nombre)?.hmac_secret;
  console.log(`  npx supabase secrets set CHAT_HMAC_WEB=${clave("Web AlToque")} CHAT_HMAC_APP=${clave("App AlToque")}`);
} else {
  console.log("\nLas claves para firmar la identidad (CHAT_HMAC_WEB y CHAT_HMAC_APP) están en Ajustes → Bandejas → Editar,");
  console.log("o vuelve a correr este script con MOSTRAR_CLAVES=1 para verlas aquí.");
}
console.log("Listo.");
