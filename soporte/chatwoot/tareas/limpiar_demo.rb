# Deja Chatwoot sin datos de clientes para empezar la demo / salir en vivo.
#
# BORRA para siempre: todas las conversaciones (con sus mensajes, fotos y
# encuestas de satisfacción) y todos los contactos. También el asesor de
# prueba agente1@yopmail.com ("roy 2").
#
# CONSERVA: bandejas, asesores, equipo, etiquetas, respuestas rápidas,
# macros, reglas automáticas, horario, correos, la ficha del cliente, el
# aviso al cliente (webhook) y la app de plataforma del panel.
#
#   docker compose ... cp tareas/limpiar_demo.rb rails:/tmp/limpiar_demo.rb
#   docker compose ... exec -T rails bundle exec rails runner /tmp/limpiar_demo.rb

antes = { conversaciones: Conversation.count, contactos: Contact.count, mensajes: Message.count }
puts "Antes: #{antes}"

Conversation.find_each(&:destroy!)
Contact.find_each(&:destroy!)

if (prueba = User.find_by(email: "agente1@yopmail.com"))
  prueba.account_users.destroy_all
  prueba.destroy!
  puts "Asesor de prueba borrado: agente1@yopmail.com"
end

puts "Después: conversaciones #{Conversation.count}, contactos #{Contact.count}, mensajes #{Message.count}"
puts "Se quedan: bandejas #{Inbox.count}, asesores #{User.count} (#{User.pluck(:email).join(', ')}), reglas #{AutomationRule.count}, webhooks #{Webhook.count}"
