#!/usr/bin/env bash
# Programa las tareas diarias del servidor (hora de Lima). Repetirlo no
# duplica nada:
#
#   ssh root@IP 'bash -s' < soporte/servidor/instalar-tareas.sh
#
#   03:00  backup de la base de Chatwoot a R2 (backup-chatwoot.sh)
#   04:00  fotos del chat de más de 7 días → tamaño legible (compactar_adjuntos.rb)
set -euo pipefail

cat > /etc/cron.d/altoque <<'EOF'
# Tareas de AlToque (soporte/servidor/instalar-tareas.sh). Hora de Lima.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root /opt/altoque/servidor/backup-chatwoot.sh >> /var/log/altoque-backup.log 2>&1
0 4 * * * root cd /opt/altoque/chatwoot && docker compose -f docker-compose.yml -f docker-compose.servidor.yml exec -T rails bundle exec rails runner /altoque/tareas/compactar_adjuntos.rb >> /var/log/altoque-compactar.log 2>&1
EOF
chmod 644 /etc/cron.d/altoque

# Que los registros no crezcan sin límite.
cat > /etc/logrotate.d/altoque <<'EOF'
/var/log/altoque-*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
EOF

systemctl restart cron
echo "tareas programadas:"
grep -E '^[0-9]' /etc/cron.d/altoque | awk '{printf "  %02d:%02d  %s\n", $2, $1, ($7 ~ /backup/ ? "backup de la base a R2" : "compactar fotos del chat")}'
