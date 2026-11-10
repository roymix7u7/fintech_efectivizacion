# Deja Chatwoot configurado para AlToque: imagen del chat, horario,
# respuestas rápidas, etiquetas, reglas automáticas, el dato de la
# pantalla del cliente y la ficha del cliente.
#
# Se puede correr las veces que haga falta: actualiza lo que ya existe y
# no duplica nada. Ver README.md (sección "Configurar").
#
# Los textos de comisiones, plazos, horario y locales salen de
# admin/src/components/sitio/datos.js: si cambian allá, se cambian aquí.

FICHA_URL = ENV.fetch("FICHA_URL", "http://localhost:3000/soporte/ficha")
AVATAR = ENV.fetch("AVATAR", "/tmp/altoque-avatar.png")
VISITANTES = "Visitantes web"
BANDEJAS = ["Web AlToque", "App AlToque", VISITANTES].freeze
# Páginas desde donde se puede mostrar el chat de la web y el de
# visitantes (separadas por coma). En el servidor: las direcciones reales,
# p. ej. "https://www.panel-admin-atk-mobil.com". Nadie más puede
# incrustar estos chats en otra página.
DOMINIOS = ENV.fetch("DOMINIOS", "http://localhost:3000")
# Celular peruano: 9 dígitos que empiezan con 9; se aceptan espacios
# ("987 654 321") y el +51 delante. Nada más largo pasa.
CELULAR = {
  clave: "celular",
  patron: '/^(\+?51 ?)?9\d{2} ?\d{3} ?\d{3}$/',
  aviso: "Escribe tu celular de 9 dígitos, empezando con 9 (ej. 987 654 321)."
}.freeze

account = Account.first or abort("No hay cuenta: crea la cuenta del administrador primero.")
admin = account.administrators.first

def hecho(texto) = puts("  ✓ #{texto}")

# Chat de la landing para quien todavía no tiene cuenta. Sin identidad
# firmada: por eso ahí solo se da información general (ver /ingresa).
unless account.inboxes.exists?(name: VISITANTES)
  canal = Channel::WebWidget.create!(account: account, website_url: DOMINIOS.split(",").first.strip)
  account.inboxes.create!(name: VISITANTES, channel: canal)
end

# Funciones de Chatwoot que no usamos: se apagan para toda la cuenta y
# salen del menú (también del de los asesores). Capitán y Llamadas son de
# pago: Chatwoot las muestra igual como aviso de "mejora tu plan".
FUNCIONES_APAGADAS = %w[help_center companies captain_tasks contact_chatwoot_support_team mobile_voice_push].freeze
account.disable_features!(*FUNCIONES_APAGADAS)
hecho_inicial = "Funciones apagadas: centro de ayuda, empresas, tareas de Capitán, soporte de Chatwoot"

# ── 1. Imagen del chat y horario ──────────────────────────────────────
puts hecho_inicial.sub(/^/, "  ✓ ")
puts "Bandejas"
BANDEJAS.each do |nombre|
  inbox = account.inboxes.find_by(name: nombre) or next puts("  · falta la bandeja #{nombre}")
  canal = inbox.channel
  visitantes = nombre == VISITANTES

  canal.update!(
    widget_color: "#0F1B33",
    welcome_title: "Hola, somos AlToque 👋",
    welcome_tagline: visitantes ?
      "¿Quieres efectivizar tu tarjeta? Pregúntanos lo que necesites. Atendemos de lunes a sábado, de 9:00 a. m. a 6:00 p. m." :
      "Escríbenos tu consulta. Atendemos de lunes a sábado, de 9:00 a. m. a 6:00 p. m.",
    reply_time: "in_a_few_minutes",
    # Web y app: solo con identidad firmada (HMAC). Visitantes: abierto,
    # pero con nombre y celular antes de escribir.
    hmac_mandatory: !visitantes && canal.hmac_mandatory,
    pre_chat_form_enabled: visitantes,
    pre_chat_form_options: visitantes ? {
      pre_chat_message: "Déjanos tu nombre y celular para poder responderte.",
      require_email: false,
      pre_chat_fields: [
        { field_type: "standard", label: "Nombre", placeholder: "Tu nombre", name: "fullName",
          type: "text", required: true, enabled: true },
        # El celular estándar de Chatwoot solo pide "+" y 5 dígitos como mínimo,
        # sin máximo. Por eso va como atributo propio, con patrón: celular
        # peruano de 9 dígitos que empieza con 9 (acepta espacios y +51).
        { field_type: "standard", label: "Celular", name: "phoneNumber", type: "text", required: false, enabled: false },
        { field_type: "contact_attribute", label: "Celular", placeholder: "987 654 321", name: CELULAR[:clave],
          type: "text", required: true, enabled: true,
          regex_pattern: CELULAR[:patron], regex_cue: CELULAR[:aviso] },
        { field_type: "standard", label: "Correo", name: "emailAddress", type: "email", required: false, enabled: false }
      ]
    } : canal.pre_chat_form_options,
    allowed_domains: nombre == "App AlToque" ? canal.allowed_domains : DOMINIOS
  )

  inbox.update!(
    business_name: "AlToque Perú WK",
    # El cliente ya llega con su correo (identidad firmada): no se le pide.
    enable_email_collect: false,
    timezone: "America/Lima",
    # Fuera de horario Chatwoot manda este saludo y además el aviso de
    # fuera de horario: por eso no promete "en unos minutos".
    greeting_enabled: true,
    greeting_message: "Hola, recibimos tu mensaje. Un asesor te responderá por aquí mismo.",
    working_hours_enabled: true,
    out_of_office_message: "Ahora estamos fuera de horario. Te respondemos desde las 9:00 a. m. " \
                           "Atendemos de lunes a sábado, de 9:00 a. m. a 6:00 p. m."
  )

  # 0 = domingo. Lunes a sábado de 9:00 a 18:00; domingo cerrado.
  inbox.working_hours.each do |wh|
    if wh.day_of_week.zero?
      wh.update!(closed_all_day: true, open_all_day: false)
    else
      wh.update!(closed_all_day: false, open_all_day: false,
                 open_hour: 9, open_minutes: 0, close_hour: 18, close_minutes: 0)
    end
  end

  if File.exist?(AVATAR)
    inbox.avatar.attach(io: File.open(AVATAR), filename: "altoque.png", content_type: "image/png")
  end
  hecho "#{nombre}: colores, bienvenida, horario L-S 9:00–18:00#{File.exist?(AVATAR) ? ', logo' : ''}"
end

# ── 2. Respuestas rápidas (se usan escribiendo / en el chat) ──────────
puts "Respuestas rápidas"
RESPUESTAS = {
  "saludo" => "Hola, {{contact.first_name}}. Gracias por escribirnos, te atiende {{agent.first_name}}. ¿En qué te ayudo?",
  "horario" => "Atendemos de lunes a sábado, de 9:00 a. m. a 6:00 p. m. (refrigerio de 1:00 a 2:00 p. m.).",
  "plazos" => "Así depositamos:\n" \
              "• Normalmente en 1 hora, desde que aprobamos tu comprobante.\n" \
              "• De 2 a 3 horas en días de alta demanda.\n" \
              "• Al siguiente día hábil si fallan los sistemas bancarios.\n" \
              "• En la mañana siguiente si nos envías fuera de horario.",
  "comisiones" => "Nuestras comisiones por operación:\n" \
                  "• BCP y BBVA: 1 %. Mínimo S/ 12 en montos menores a S/ 1,200.\n" \
                  "• BanBif: 1 % con depósito al día siguiente (1.5 % si lo quieres hoy). Mínimo S/ 12 bajo S/ 1,200.\n" \
                  "• Scotiabank: 1 % con depósito al día siguiente (1.5 % si lo quieres hoy). Mínimo S/ 20 bajo S/ 2,000.\n" \
                  "• Interbank y CMR: 2 %, con código. Mínimo S/ 30 bajo S/ 1,500.\n" \
                  "• iO: 2 %, con código. Mínimo S/ 30 bajo S/ 1,000.",
  "bcp" => "Con tarjeta BCP la comisión es 1 %. En montos menores a S/ 1,200 se cobra el mínimo de S/ 12.",
  "bbva" => "Con tarjeta BBVA la comisión es 1 %. En montos menores a S/ 1,200 se cobra el mínimo de S/ 12.",
  "banbif" => "Con tarjeta BanBif la comisión es 1 % si el depósito es al día siguiente, o 1.5 % si lo quieres hoy. " \
              "En montos menores a S/ 1,200 se cobra el mínimo de S/ 12.",
  "scotiabank" => "Con tarjeta Scotiabank la comisión es 1 % si el depósito es al día siguiente, o 1.5 % si lo quieres hoy. " \
                  "En montos menores a S/ 2,000 se cobra el mínimo de S/ 20.",
  "interbank" => "Con tarjeta Interbank la comisión es 2 % y la operación se hace con código. " \
                 "En montos menores a S/ 1,500 se cobra el mínimo de S/ 30.",
  "cmr" => "Con tarjeta CMR la comisión es 2 % y la operación se hace con código. " \
           "En montos menores a S/ 1,500 se cobra el mínimo de S/ 30.",
  "io" => "Con tarjeta iO la comisión es 2 % y la operación se hace con código. " \
          "En montos menores a S/ 1,000 se cobra el mínimo de S/ 30.",
  "locales" => "Te atendemos en persona en:\n" \
               "• Lince: Jr. Manuel Candamo 278, 2.° piso (a media cuadra del Edificio El Almirante).\n" \
               "• San Juan de Miraflores: Calle Algarrobos 103 (frente a la Estación Atocongo).\n" \
               "• Los Olivos: Santa Cruz de Pachacútec 214 (frente a Mega Plaza).",
  "requisitos" => "Para operar necesitas tu DNI o carnet de extranjería, una selfie con tu documento, " \
                  "la foto de tu tarjeta y una cuenta de ahorros a tu nombre.",
  "que-es" => "Efectivizar tu tarjeta es convertir parte de la línea de tu tarjeta de crédito en dinero en tu cuenta. " \
              "Operas con tu tarjeta, nos envías el comprobante y te depositamos.",
  "terceros" => "Por tu seguridad, solo depositamos en cuentas a tu nombre, nunca a terceros. " \
                "Lo normal es tu cuenta de ahorros; si en algún caso no se puede, usamos tu CCI y te avisamos.",
  "seguridad" => "Tus datos están protegidos: verificamos tu identidad, tus documentos se guardan cifrados " \
                 "y solo depositamos en cuentas a tu nombre.",
  "independientes" => "Somos una empresa independiente, no estamos afiliados a los bancos. " \
                      "Los nombres de los bancos solo indican qué tarjetas aceptamos.",
  "verificacion" => "Estamos revisando tus datos. Apenas terminemos te avisamos en la app y en tu cuenta web.",
  "reclamo" => "Lamentamos lo ocurrido. Si quieres dejar constancia formal, puedes registrar tu reclamo en nuestro " \
               "Libro de Reclamaciones: en la web, al pie de la página, o en la app, desde el menú.",
  "clave" => "Por tu seguridad, nunca te pediremos la clave de tu tarjeta, el código CVV ni claves de tu banca por internet. " \
             "No los compartas con nadie, ni con nosotros.",
  "contacto" => "También puedes escribirnos por WhatsApp al 993 918 842 o llamarnos al 926 518 180.",
  "despedida" => "Gracias por escribirnos, {{contact.first_name}}. Si necesitas algo más, aquí estamos.",
  # Para el chat de visitantes (sin cuenta): nada de datos de cuentas ahí.
  "ingresa" => "Por tu seguridad, los datos de tu cuenta solo te los damos desde tu cuenta. " \
               "Ingresa a la app o a la web y escríbenos desde Ayuda: te atendemos ahí mismo.",
  "registro" => "Crear tu cuenta toma unos minutos: descarga la app AlToque o entra a nuestra web y elige " \
                "\"Crear cuenta\". Ten a mano tu DNI y la tarjeta que vas a usar. Apenas validemos tus datos, " \
                "ya puedes hacer tu primera solicitud."
}.freeze

RESPUESTAS.each do |codigo, texto|
  account.canned_responses.find_or_initialize_by(short_code: codigo).update!(content: texto)
end
hecho "#{RESPUESTAS.size} respuestas (escribe / en una conversación)"

# ── 3. Etiquetas ──────────────────────────────────────────────────────
puts "Etiquetas"
ETIQUETAS = {
  "solicitud" => ["#3D588F", "Consultas sobre una solicitud"],
  "deposito" => ["#0F9D58", "Depósitos y plazos"],
  "tarjeta" => ["#C49B00", "Tarjetas y cuentas bancarias"],
  "verificacion" => ["#7C3AED", "Revisión de identidad y documentos"],
  "comisiones" => ["#0891B2", "Precios y comisiones"],
  "reclamo" => ["#DC2626", "Reclamos y quejas"],
  "prospecto" => ["#E8B800", "Visitante sin cuenta (chat de la landing)"],
  "spam" => ["#6B7280", "Mensajes basura o abuso: se resuelven sin responder"]
}.freeze
ETIQUETAS.each do |titulo, (color, descripcion)|
  account.labels.find_or_initialize_by(title: titulo)
         .update!(color: color, description: descripcion, show_on_sidebar: true)
end
hecho ETIQUETAS.keys.join(", ")

# ── 4. Reglas automáticas: etiquetan según lo que escribe el cliente ──
puts "Reglas automáticas"
def regla(account, nombre, descripcion, palabras, acciones)
  rule = account.automation_rules.find_or_initialize_by(name: nombre)
  rule.update!(
    description: descripcion,
    event_name: "message_created",
    active: true,
    conditions: [
      { attribute_key: "message_type", filter_operator: "equal_to", values: ["incoming"], query_operator: "and" },
      { attribute_key: "content", filter_operator: "contains", values: palabras, query_operator: nil }
    ],
    actions: acciones
  )
end

etiqueta = ->(t) { { action_name: "add_label", action_params: [t] } }

regla account, "Reclamo: etiqueta y prioridad urgente",
      "Si el cliente habla de un reclamo o queja, se marca urgente.",
      %w[reclamo reclamar queja denuncia indecopi estafa],
      [etiqueta.("reclamo"), { action_name: "change_priority", action_params: ["urgent"] }]

regla account, "Depósito: etiqueta",
      "Preguntas sobre depósitos, transferencias y plazos.",
      %w[depósito deposito depositaron depositan transferencia abono llegó llego plata],
      [etiqueta.("deposito")]

regla account, "Solicitud: etiqueta",
      "Preguntas sobre una solicitud u operación.",
      %w[solicitud operación operacion comprobante voucher],
      [etiqueta.("solicitud")]

regla account, "Tarjeta: etiqueta",
      "Tarjetas y cuentas bancarias.",
      %w[tarjeta cuenta\ bancaria cci],
      [etiqueta.("tarjeta")]

regla account, "Verificación: etiqueta",
      "Revisión de identidad, documentos y cuenta observada.",
      %w[verificación verificacion verificar dni selfie revisión revision observad documento],
      [etiqueta.("verificacion")]

regla account, "Comisiones: etiqueta",
      "Precios y comisiones.",
      %w[comisión comision cuánto\ cobran cuanto\ cobran porcentaje tarifa],
      [etiqueta.("comisiones")]
hecho "#{account.automation_rules.count} reglas activas"

# ── 5. Asesores y jefes de cada sede ──────────────────────────────────
# Chatwoot gratis tiene dos roles: agente y administrador. Así se usan:
#   · asesores → agente: reciben los chats por turnos (equipo + bandejas).
#   · jefes    → administrador, FUERA del reparto: ven todas las
#     conversaciones y los reportes, y atienden lo marcado
#     "para-supervisor", pero no les llegan chats solos.
# Al invitar a alguien (Configuración → Agentes), pon aquí su correo y
# vuelve a correr el script: le ajusta el rol, el reparto y la sede.
#
# Las sedes se llaman como en el panel (tabla sedes): la etiqueta es
# "sede-" + el nombre sin "Sede ". El reporte de Atención al cliente del
# panel (admin/src/lib/atencion.js) las encuentra por ese nombre, y sabe
# de qué sede es cada asesor por la sede que este script le guarda.
SEDES = {
  "sede-lince" => {
    nombre: "Sede Lince", color: "#1B2A4A",
    asesores: ["quisperoy@hotmail.com"], # prueba
    jefes: []
  },
  "sede-norte" => {
    nombre: "Sede Norte", color: "#2C4270",
    asesores: [],
    jefes: []
  },
  "sede-sur" => {
    nombre: "Sede Sur", color: "#3D588F",
    asesores: [],
    jefes: []
  }
}.freeze

puts "Asesores y jefes"
miembro = ->(correo) { account.account_users.joins(:user).find_by(users: { email: correo.strip.downcase }) }
con_sede = []
SEDES.each do |etiqueta_sede, sede|
  [[sede[:asesores], :agent], [sede[:jefes], :administrator]].each do |correos, rol|
    correos.each do |correo|
      au = miembro.(correo) or next puts("  · #{correo}: todavía no está invitado (Configuración → Agentes)")
      au.update!(role: rol) unless au.role == rol.to_s
      au.user.update!(custom_attributes: au.user.custom_attributes.to_h.merge("sede" => etiqueta_sede))
      con_sede << au.user.id
    end
  end
end
# Quien salió de SEDES deja de figurar en el reporte de su sede anterior.
account.users.where.not(id: con_sede).find_each do |u|
  next unless u.custom_attributes.to_h.key?("sede")

  u.update!(custom_attributes: u.custom_attributes.except("sede"))
end
asesores = account.account_users.agent.includes(:user).map(&:user)
hecho "#{asesores.size} asesor(es) y #{account.account_users.administrator.count} administrador(es)"

# ── 6. Equipo único con reparto automático ────────────────────────────
# Un solo equipo: responde el asesor que esté libre, sea de la sede que
# sea. En el reparto solo entran los agentes: los administradores (los
# jefes y tú) ven todo igual, sin que les lleguen chats.
puts "Equipo"
bandejas = account.inboxes.where(name: BANDEJAS)
equipo = account.teams.find_or_initialize_by(name: "atención al cliente")
equipo.update!(description: "Asesores del chat de la web y el app.", allow_auto_assign: true)

ids_asesores = asesores.map(&:id)
fuera = equipo.members.pluck(:id) - ids_asesores
equipo.remove_members(fuera) if fuera.any?
equipo.add_members(ids_asesores - equipo.members.pluck(:id))
bandejas.each do |i|
  sobran = i.members.pluck(:id) - ids_asesores
  i.remove_members(sobran) if sobran.any?
  i.add_members(ids_asesores - i.members.pluck(:id))
  i.update!(enable_auto_assignment: true)
end

regla_equipo = account.automation_rules.find_or_initialize_by(name: "Toda conversación nueva al equipo")
regla_equipo.update!(
  description: "Las conversaciones de la web y el app entran al equipo de atención al cliente.",
  event_name: "conversation_created",
  active: true,
  conditions: [{ attribute_key: "inbox_id", filter_operator: "equal_to", values: bandejas.map(&:id), query_operator: nil }],
  actions: [{ action_name: "assign_team", action_params: [equipo.id] }]
)
visitas = account.inboxes.find_by(name: VISITANTES)
if visitas
  account.automation_rules.find_or_initialize_by(name: "Visitante sin cuenta: prospecto").update!(
    description: "Lo que entra por el chat de la landing se marca como prospecto.",
    event_name: "conversation_created",
    active: true,
    conditions: [{ attribute_key: "inbox_id", filter_operator: "equal_to", values: [visitas.id], query_operator: nil }],
    actions: [{ action_name: "add_label", action_params: ["prospecto"] }]
  )
end
if ids_asesores.empty?
  puts "  · todavía no hay asesores: las conversaciones quedan sin asignar (los administradores las ven igual)"
else
  hecho "atención al cliente: #{ids_asesores.size} asesor(es) en el reparto de #{bandejas.map(&:name).join(' y ')}"
end

# ── 7. Sede como etiqueta de la conversación ──────────────────────────
# Chatwoot no etiqueta personas, solo conversaciones. Esta regla pone
# "sede-lince" (u otra) cuando la conversación queda con un asesor o un
# jefe de esa sede; así Reportes → Etiquetas da las cifras de cada local
# sin tocar el reparto.
puts "Sedes"
# Etiquetas y reglas de sedes que ya no existen (nombres anteriores).
account.labels.where("title LIKE 'sede-%'").where.not(title: SEDES.keys).destroy_all
account.automation_rules.where("name LIKE 'Sede %'")
       .where.not(name: SEDES.values.map { |s| "Sede #{s[:nombre].delete_prefix('Sede ')}" }).destroy_all
SEDES.each do |etiqueta_sede, sede|
  account.labels.find_or_initialize_by(title: etiqueta_sede)
         .update!(color: sede[:color], description: "Atendida por alguien de #{sede[:nombre]}", show_on_sidebar: true)

  correos = (sede[:asesores] + sede[:jefes]).map { |c| c.strip.downcase }
  ids = account.users.where(email: correos).pluck(:id)
  rule = account.automation_rules.find_or_initialize_by(name: "Sede #{sede[:nombre].delete_prefix('Sede ')}")
  # El panel (Equipo → "Atiende chat") también agrega gente a estas
  # reglas: se conservan, salvo que aquí figuren en otra sede.
  en_otras = SEDES.reject { |k, _| k == etiqueta_sede }.values
                  .flat_map { |x| x[:asesores] + x[:jefes] }.map { |c| c.strip.downcase }
  previos = rule.persisted? ? Array(rule.conditions.first&.dig("values")).map(&:to_i) : []
  ids = (ids | (previos & account.user_ids)) - account.users.where(email: en_otras).pluck(:id)
  if ids.empty?
    rule.destroy if rule.persisted?
    puts "  · #{sede[:nombre]}: sin personas todavía (márcalas en Equipo del panel o agrégalas en SEDES)"
    next
  end
  rule.update!(
    description: "Conversaciones asignadas a alguien de #{sede[:nombre]}.",
    event_name: "conversation_updated",
    active: true,
    conditions: [{ attribute_key: "assignee_id", filter_operator: "equal_to", values: ids, query_operator: nil }],
    actions: [{ action_name: "add_label", action_params: [etiqueta_sede] },
              { action_name: "remove_label", action_params: SEDES.keys - [etiqueta_sede] }]
  )
  hecho "#{sede[:nombre]}: #{ids.size} persona(s) (SEDES y panel)"
end

# ── 8. Macros ──────────────────────────────────
# Las fotos del DNI o la tarjeta que llegan por el chat se registran en
# el panel (Alta presencial) y después se borran de aquí, para que no
# queden copias sueltas.
puts "Macros"
account.labels.find_or_initialize_by(title: "documentos-registrados")
       .update!(color: "#0F766E", description: "Las fotos del cliente ya se cargaron al panel", show_on_sidebar: false)

macro = account.macros.find_or_initialize_by(name: "Documentos registrados")
macro.update!(
  visibility: :global,
  created_by: admin,
  updated_by: admin,
  actions: [
    { action_name: "send_message",
      action_params: ["Listo, ya registramos tus documentos en el sistema. Gracias por enviarlos."] },
    { action_name: "add_private_note",
      action_params: ["✅ Documentos cargados al panel. Ahora borra de este chat los mensajes con fotos del DNI " \
                      "o de la tarjeta (pasa el mouse sobre el mensaje → ⋮ → Eliminar)."] },
    { action_name: "add_label", action_params: ["documentos-registrados"] }
  ]
)
account.labels.find_or_initialize_by(title: "para-supervisor")
       .update!(color: "#B45309", description: "El asesor pidió que la vea un supervisor", show_on_sidebar: true)

MACROS = {
  "Cerrar con despedida" => [
    { action_name: "send_message",
      action_params: ["Gracias por escribirnos, {{contact.first_name}}. Si necesitas algo más, aquí estamos."] },
    { action_name: "resolve_conversation", action_params: [] }
  ],
  "Pasar a supervisor" => [
    { action_name: "change_priority", action_params: ["urgent"] },
    { action_name: "add_label", action_params: ["para-supervisor"] },
    { action_name: "add_private_note",
      action_params: ["⚠️ Pasado a supervisor. Antes de soltarla, deja aquí una nota con lo que pasó y lo que pide el cliente."] },
    { action_name: "remove_assigned_agent", action_params: [] }
  ],
  # Basura o abuso: fuera de la bandeja sin gastar una respuesta. Si
  # insiste, el asesor bloquea el contacto (panel derecho → Bloquear).
  "Marcar como spam" => [
    { action_name: "add_label", action_params: ["spam"] },
    { action_name: "resolve_conversation", action_params: [] }
  ],
  # Pausada vuelve sola a la bandeja cuando el cliente responde.
  "Esperando al cliente" => [
    { action_name: "send_message",
      action_params: ["Quedo atento a lo que me envíes (el comprobante, la foto o el dato que te pedí). " \
                      "Apenas llegue, seguimos por aquí."] },
    { action_name: "snooze_conversation", action_params: [] }
  ]
}.freeze

MACROS.each do |nombre, acciones|
  account.macros.find_or_initialize_by(name: nombre)
         .update!(visibility: :global, created_by: admin, updated_by: admin, actions: acciones)
end
hecho "Documentos registrados, #{MACROS.keys.join(', ')}"

# ── 9. Pantalla del cliente (la manda la web al chat) ─────────────────
puts "Atributos"
account.custom_attribute_definitions.find_or_initialize_by(
  attribute_key: "pantalla", attribute_model: "contact_attribute"
).update!(
  attribute_display_name: "Pantalla actual",
  attribute_display_type: "text",
  attribute_description: "Dónde está el cliente en la web o la app (lo informa su navegador)."
)
hecho "Pantalla actual (contacto)"

# Celular que deja el visitante en el formulario previo (ver bandejas).
account.custom_attribute_definitions.find_or_initialize_by(
  attribute_key: CELULAR[:clave], attribute_model: "contact_attribute"
).update!(
  attribute_display_name: "Celular",
  attribute_display_type: "text",
  regex_pattern: CELULAR[:patron],
  regex_cue: CELULAR[:aviso],
  attribute_description: "El que dejó el visitante antes de escribir. La ficha lo usa para buscarlo entre los clientes."
)
hecho "Celular (contacto)"

# Por qué escribe el cliente. Lo elige el asesor en el panel derecho de
# la conversación y sale en los reportes. (Exigirlo antes de resolver es
# una función de pago de Chatwoot: aquí queda como recomendado.)
MOTIVOS = ["Solicitud", "Depósito", "Tarjeta o cuenta", "Verificación de cuenta", "Comisiones",
           "Reclamo", "Problema con la app o la web", "Información general", "Otro"].freeze
account.custom_attribute_definitions.find_or_initialize_by(
  attribute_key: "motivo", attribute_model: "conversation_attribute"
).update!(
  attribute_display_name: "Motivo de contacto",
  attribute_display_type: "list",
  attribute_values: MOTIVOS,
  attribute_description: "Por qué escribió el cliente. Elígelo antes de resolver."
)
hecho "Motivo de contacto (#{MOTIVOS.size} opciones)"

# ── 10. Correos con la imagen de AlToque ───────────────────────────────
# correos/base.liquid es el diseño de todos los correos (invitaciones,
# avisos); los demás son los avisos a los asesores, en español. Se
# guardan para toda la instalación y en "es" y "en", porque Chatwoot
# elige según el idioma de cada asesor. (Los asuntos de los avisos
# vienen escritos en el código de Chatwoot y siguen en inglés.)
CORREOS = ENV.fetch("CORREOS", "/tmp/correos")
puts "Correos"
if Dir.exist?(CORREOS)
  Dir[File.join(CORREOS, "*.liquid")].sort.each do |archivo|
    nombre = File.basename(archivo, ".liquid")
    tipo = nombre == "base" ? :layout : :content
    %w[es en].each do |idioma|
      EmailTemplate.find_or_initialize_by(account_id: nil, inbox_id: nil, name: nombre,
                                          template_type: tipo, locale: idioma)
                   .update!(body: File.read(archivo))
    end
  end
  hecho "#{Dir[File.join(CORREOS, '*.liquid')].size} plantillas (diseño + avisos a asesores)"
else
  puts "  · no encontré #{CORREOS}: copia la carpeta correos (ver README)"
end

# ── 11. Ficha del cliente, al costado de cada conversación ────────────
puts "Ficha del cliente"
if admin
  app = account.dashboard_apps.find_or_initialize_by(title: "Ficha del cliente")
  app.update!(user: admin, content: [{ type: "frame", url: FICHA_URL }])
  hecho "pestaña \"Ficha del cliente\" → #{FICHA_URL}"
else
  puts "  · no hay administrador para registrar la ficha"
end

# ── 12. Avisos al cliente cuando el asesor responde ───────────────────
# Chatwoot avisa a la función chatwoot-avisos de Supabase, que manda la
# notificación del navegador y deja el aviso en la campana. Va firmado con
# AVISOS_SECRETO (el mismo que CHATWOOT_AVISOS_SECRETO en Supabase).
#   -e AVISOS_URL=https://<proyecto>.supabase.co/functions/v1/chatwoot-avisos
#   -e AVISOS_SECRETO=<el mismo de Supabase>
puts "Avisos al cliente"
avisos_url = ENV["AVISOS_URL"].to_s.strip
avisos_secreto = ENV["AVISOS_SECRETO"].to_s.strip
if avisos_url.empty? || avisos_secreto.empty?
  puts "  · sin AVISOS_URL y AVISOS_SECRETO: no se tocan los avisos"
else
  # Uno solo: si cambió la dirección, se reemplaza el anterior.
  account.webhooks.where("url LIKE ?", "%/functions/v1/chatwoot-avisos%").where.not(url: avisos_url).destroy_all
  gancho = account.webhooks.find_or_initialize_by(url: avisos_url)
  gancho.update!(name: "Avisos al cliente (Supabase)", subscriptions: ["message_created"], webhook_type: :account_type)
  gancho.update!(secret: avisos_secreto) unless gancho.secret == avisos_secreto
  hecho "Chatwoot avisa a #{avisos_url} (firmado)"
end

if (visitas = account.inboxes.find_by(name: VISITANTES))
  puts "Chat de visitantes: NEXT_PUBLIC_CHATWOOT_VISITANTES_TOKEN=#{visitas.channel.website_token} (es público)"
end
puts "Listo."
