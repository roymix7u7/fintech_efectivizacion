#!/usr/bin/env bash
# Instala (o actualiza) el chat propio en el servidor, al lado de Chatwoot.
# Se puede repetir: no pisa las claves ni duplica la configuración.
#
# Antes, desde la PC (ver soporte/altoque-chat/README.md):
#   scp docker-compose.yml configurar.mjs codigo.tar.gz  root@IP:/opt/altoque/altoque-chat/
#   scp avisos-secretos.env                              root@IP:/tmp/avisos.env   (opcional, una vez)
#   ssh root@IP 'bash -s' < soporte/servidor/instalar-chat-propio.sh
#
# Deja en /opt/altoque/altoque-chat (solo root los lee):
#   .env                 claves del chat (se generan aquí, no salen del servidor)
#   primer-arranque.txt  correo y contraseña del administrador del chat
#   para-vercel.env      variables para el panel
#   para-supabase.env    claves para firmar la identidad
set -euo pipefail

DOMINIO=${DOMINIO:-chat2.panel-admin-atk-mobil.com}
WEB=${WEB:-www.panel-admin-atk-mobil.com}
DIR=/opt/altoque/altoque-chat
CW=/opt/altoque/chatwoot
SUPABASE=${SUPABASE:-https://zsrjctabxqrgunlzvzru.supabase.co}
umask 077
cd "$DIR"

# ── 1. Código ──
if [ -f codigo.tar.gz ]; then
  rm -rf codigo && mkdir codigo && tar -xzf codigo.tar.gz -C codigo && rm codigo.tar.gz
  echo "✓ código actualizado"
fi
[ -f codigo/Dockerfile ] || { echo "Falta el código (codigo.tar.gz)"; exit 1; }

# ── 2. Claves (solo la primera vez). Los adjuntos van al mismo R2 que usa Chatwoot. ──
leer() { grep -E "^$1=" "$CW/.env" | head -1 | cut -d= -f2-; }
al_azar() { openssl rand -base64 "$1" | tr -d '\n=+/' ; }
if [ ! -f .env ]; then
  cat > .env <<EOF
POSTGRES_PASSWORD=$(al_azar 30)
PUBLIC_URL=https://$DOMINIO
JWT_SECRET=$(al_azar 60)
ADMIN_EMAIL=admin@altoqueperu.com
ADMIN_PASSWORD=$(al_azar 18)
SEED_ALLOWED_DOMAINS=$WEB,${WEB#www.}
S3_ENDPOINT=$(leer STORAGE_ENDPOINT)
S3_REGION=auto
S3_BUCKET=$(leer STORAGE_BUCKET_NAME)
S3_ACCESS_KEY_ID=$(leer STORAGE_ACCESS_KEY_ID)
S3_SECRET_ACCESS_KEY=$(leer STORAGE_SECRET_ACCESS_KEY)
BACKUP_HOUR=3
BACKUP_RETENTION_DAYS=30
EOF
  echo "✓ claves generadas (.env)"
fi

# ── 3. Construir y arrancar ──
docker compose up -d --build 2>&1 | tail -3
for i in $(seq 1 60); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' altoque-chat-chat-1 2>/dev/null)" = healthy ] && break
  sleep 3
done
[ "$(docker inspect --format '{{.State.Health.Status}}' altoque-chat-chat-1)" = healthy ] || { echo "El chat no arrancó:"; docker compose logs --tail 30 chat; exit 1; }
echo "✓ chat en marcha"

if [ ! -f primer-arranque.txt ]; then
  { echo "Administrador del chat (https://$DOMINIO/app/):"; grep -E '^ADMIN_(EMAIL|PASSWORD)=' .env; } > primer-arranque.txt
fi

# ── 4. Configuración (bandejas, respuestas, reglas, ficha, aviso al cliente) ──
nuevo_token() { docker compose exec -T chat node src/cli.js create-token "$1" | grep -o 'atk_[A-Za-z0-9_-]*'; }
SECRETO=""
[ -f /tmp/avisos.env ] && SECRETO=$(grep -E '^CHATWOOT_AVISOS_SECRETO=' /tmp/avisos.env | cut -d= -f2- | tr -d '\r\n')
T=$(nuevo_token "configurar $(date +%F)")
docker compose cp configurar.mjs chat:/tmp/configurar.mjs >/dev/null
SALIDA=$(docker compose exec -T \
  -e CHAT_URL=http://localhost:4000 -e CHAT_API_TOKEN="$T" \
  -e FICHA_URL="https://$WEB/soporte/ficha" -e DOMINIOS="$WEB,${WEB#www.}" \
  -e AVISOS_URL="${SECRETO:+$SUPABASE/functions/v1/chatwoot-avisos}" -e AVISOS_SECRETO="$SECRETO" \
  -e MOSTRAR_CLAVES=1 chat node /tmp/configurar.mjs)
echo "$SALIDA" | grep -E '✓|·' || true
rm -f /tmp/avisos.env

if [ ! -f para-vercel.env ]; then
  {
    echo "NEXT_PUBLIC_CHAT_URL=https://$DOMINIO"
    echo "$SALIDA" | grep -oE 'NEXT_PUBLIC_CHAT_(WEB|VISITANTES)_TOKEN=\S+'
    echo "CHAT_API_TOKEN=$(nuevo_token panel)"
  } > para-vercel.env
fi
echo "$SALIDA" | grep -oE 'CHAT_HMAC_(WEB|APP)=\S+' > para-supabase.env

# ── 5. https: el Caddy de Chatwoot atiende también este dominio ──
if ! grep -q "$DOMINIO" "$CW/Caddyfile"; then
  cat >> "$CW/Caddyfile" <<EOF

# Chat propio (soporte/altoque-chat)
$DOMINIO {
	encode zstd gzip
	reverse_proxy altoque-chat:4000
	header {
		Strict-Transport-Security "max-age=63072000"
		-Server
	}
}
EOF
fi
C="docker compose -f $CW/docker-compose.yml -f $CW/docker-compose.servidor.yml"
$C exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && $C exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
  && echo "✓ https configurado para $DOMINIO" || echo "· revisa el Caddyfile: no se pudo recargar"

IP=$(getent hosts "$DOMINIO" | awk '{print $1}' | head -1 || true)
[ -n "$IP" ] && echo "✓ $DOMINIO apunta a $IP" || echo "· FALTA el DNS: crea el registro A  chat2 → la IP de este servidor"
echo "Listo."
