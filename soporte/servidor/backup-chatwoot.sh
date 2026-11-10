#!/usr/bin/env bash
# Backup diario de la base de Chatwoot (conversaciones, contactos,
# configuración) a Cloudflare R2, fuera del servidor. Guarda los últimos
# DIAS_GUARDAR días. Lo corre cron a las 3:00 (ver instalar-tareas.sh).
#
# Los adjuntos ya viven en R2; el .env (claves) NO se sube: guarda una
# copia en un gestor de contraseñas.
#
# Restaurar en un servidor nuevo (ver README de soporte/chatwoot):
#   aws s3 cp s3://<bucket>/backups/<archivo>.dump .  (con las claves de R2)
#   docker compose exec -T postgres pg_restore -U postgres -d chatwoot_production --no-owner --clean --if-exists < <archivo>.dump
set -euo pipefail

DIR=/opt/altoque/chatwoot
DIAS_GUARDAR=14
COMPOSE="docker compose -f $DIR/docker-compose.yml -f $DIR/docker-compose.servidor.yml"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Las claves de R2 salen del .env de Chatwoot (las mismas de los adjuntos).
leer() { grep -E "^$1=" "$DIR/.env" | head -1 | cut -d= -f2-; }
BUCKET=$(leer STORAGE_BUCKET_NAME)
ENDPOINT=$(leer STORAGE_ENDPOINT)

aws() {
  docker run --rm -v "$TMP":/trabajo -w /trabajo \
    -e AWS_ACCESS_KEY_ID="$(leer STORAGE_ACCESS_KEY_ID)" \
    -e AWS_SECRET_ACCESS_KEY="$(leer STORAGE_SECRET_ACCESS_KEY)" \
    -e AWS_DEFAULT_REGION=auto \
    -e AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED \
    -e AWS_RESPONSE_CHECKSUM_VALIDATION=WHEN_REQUIRED \
    amazon/aws-cli:2.31.0 --endpoint-url "$ENDPOINT" "$@"
}

NOMBRE="chatwoot-$(date +%Y%m%d-%H%M).dump"
$COMPOSE exec -T postgres pg_dump -U postgres -Fc chatwoot_production > "$TMP/$NOMBRE"
# Una copia vacía o rota no se sube.
[ -s "$TMP/$NOMBRE" ] || { echo "$(date -Is) ERROR: la copia salió vacía" >&2; exit 1; }
$COMPOSE exec -T postgres pg_restore -l < "$TMP/$NOMBRE" > /dev/null

aws s3 cp --only-show-errors "/trabajo/$NOMBRE" "s3://$BUCKET/backups/$NOMBRE"
echo "$(date -Is) subido backups/$NOMBRE ($(du -h "$TMP/$NOMBRE" | cut -f1))"

# Borra las copias de más de DIAS_GUARDAR días.
LIMITE=$(date -d "-$DIAS_GUARDAR days" +%Y%m%d)
aws s3 ls "s3://$BUCKET/backups/" | awk '{print $4}' | grep -E '^chatwoot-[0-9]{8}-' | while read -r f; do
  dia=$(echo "$f" | cut -d- -f2)
  if [ "$dia" -lt "$LIMITE" ]; then
    aws s3 rm --only-show-errors "s3://$BUCKET/backups/$f"
    echo "$(date -Is) borrado backups/$f (más de $DIAS_GUARDAR días)"
  fi
done
