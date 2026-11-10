# Reduce las fotos del chat que ya tienen unos días, sin borrarlas nunca.
#
# Mientras el asesor trabaja el caso la foto queda tal como llegó. Pasados
# DIAS días se guarda a 1600 px y calidad 70: el mismo nivel que usa el app
# para el DNI y los comprobantes, que se sigue leyendo. Una foto de celular
# baja de ~3 MB a ~150 KB. Siempre queda una copia legible: es prueba.
#
# De paso se le quitan los datos ocultos de la foto (ubicación GPS, modelo
# del teléfono), que no hacen falta y son datos personales.
#
# No toca: las fotos más nuevas, las que ya pesan poco, los GIF, ni las
# que ya pasaron por aquí (quedan marcadas). Se puede correr cada día.
#
#   docker compose exec -T rails bundle exec rails runner /altoque/tareas/compactar_adjuntos.rb
#
# DIAS=0 lo aplica a todas, para pruebas.

require "image_processing/vips"

DIAS = ENV.fetch("DIAS", "7").to_i
LADO = 1600
CALIDAD = 70
MINIMO = 300 * 1024 # bytes: por debajo ya es liviana
TIPOS = %w[image/jpeg image/png image/webp image/heic image/heif].freeze

candidatos = Attachment.where(file_type: :image)
                       .where("attachments.created_at < ?", DIAS.days.ago)
                       .joins(file_attachment: :blob)
                       .where("active_storage_blobs.byte_size > ?", MINIMO)
                       .where(active_storage_blobs: { content_type: TIPOS })

antes = 0
despues = 0
hechas = 0
fallas = 0

candidatos.find_each do |adjunto|
  blob = adjunto.file.blob
  next if blob.metadata["compactada"]

  blob.open do |original|
    reducida = ImageProcessing::Vips.source(original)
                                    .resize_to_limit(LADO, LADO)
                                    .convert("jpg")
                                    .saver(quality: CALIDAD, strip: true)
                                    .call

    # Si no gana nada, se deja la original y solo se marca.
    if reducida.size >= blob.byte_size
      blob.update!(metadata: blob.metadata.merge("compactada" => true))
      next
    end

    nueva = ActiveStorage::Blob.create_and_upload!(
      io: reducida,
      filename: "#{blob.filename.base}.jpg",
      content_type: "image/jpeg",
      metadata: { "compactada" => true, "peso_original" => blob.byte_size }
    )
    antes += blob.byte_size
    despues += nueva.byte_size
    # Reemplaza el archivo del mensaje; Chatwoot borra la versión pesada.
    adjunto.file.attach(nueva)
    adjunto.update!(extension: "jpg") if adjunto.respond_to?(:extension)
    hechas += 1
  ensure
    reducida&.close!
  end
rescue StandardError => e
  fallas += 1
  Rails.logger.warn("[compactar_adjuntos] adjunto #{adjunto.id}: #{e.class}: #{e.message}")
  puts "  · no se pudo con el adjunto #{adjunto.id}: #{e.message}"
end

mb = ->(b) { (b / 1024.0 / 1024).round(1) }
puts "Fotos reducidas: #{hechas} · de #{mb.(antes)} MB a #{mb.(despues)} MB" \
     "#{fallas.positive? ? " · #{fallas} con error" : ''}"
