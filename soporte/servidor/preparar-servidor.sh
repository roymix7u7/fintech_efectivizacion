#!/usr/bin/env bash
# Deja un servidor Ubuntu 24.04 nuevo listo para AlToque: seguro y con
# Docker. Se corre como root una vez (repetirlo no rompe nada):
#
#   ssh root@IP 'bash -s' < soporte/servidor/preparar-servidor.sh
#
# Qué hace:
#   · actualiza el sistema y deja activas las actualizaciones de seguridad
#     automáticas;
#   · firewall (ufw): solo SSH (22), HTTP (80) y HTTPS (443);
#   · fail2ban: bloquea a quien intenta adivinar el acceso por SSH;
#   · SSH solo con llave (sin contraseñas). La consola web del proveedor
#     sigue sirviendo de respaldo si se pierde la llave;
#   · 2 GB de swap, para que compilar la web no deje sin memoria al chat;
#   · zona horaria de Lima;
#   · Docker y Docker Compose desde el repositorio oficial de Docker.
#
# Antes de correrlo hay que poder entrar con llave: si no, al quitar las
# contraseñas se perdería el acceso por SSH.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

paso() { printf '\n== %s\n' "$*"; }

if ! grep -q "^ssh-" /root/.ssh/authorized_keys 2>/dev/null; then
  echo "No hay ninguna llave en /root/.ssh/authorized_keys: no sigo (perderías el acceso)." >&2
  exit 1
fi

paso "Actualizando el sistema"
apt-get update -qq
apt-get -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade
apt-get -y -qq install ca-certificates curl gnupg git ufw fail2ban unattended-upgrades

paso "Actualizaciones de seguridad automáticas"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null

paso "Zona horaria: America/Lima"
timedatectl set-timezone America/Lima

paso "Firewall: solo 22, 80 y 443"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | head -1

paso "fail2ban para SSH"
cat > /etc/fail2ban/jail.d/altoque.local <<'EOF'
[sshd]
enabled  = true
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban

paso "SSH solo con llave"
cat > /etc/ssh/sshd_config.d/10-altoque.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
EOF
# Algunas imágenes traen otro archivo que vuelve a permitir contraseñas.
for f in /etc/ssh/sshd_config.d/*.conf; do
  [ "$f" = /etc/ssh/sshd_config.d/10-altoque.conf ] && continue
  sed -i 's/^\s*PasswordAuthentication\s\+yes/PasswordAuthentication no/' "$f"
done
sshd -t
systemctl reload ssh

paso "Swap de 2 GB"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -q vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-altoque.conf

paso "Docker (repositorio oficial)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get -y -qq install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Los registros de los contenedores no deben llenar el disco.
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
systemctl enable docker >/dev/null
systemctl restart docker

paso "Listo"
echo "sistema:  $(. /etc/os-release; echo "$PRETTY_NAME") · hora $(date '+%H:%M %Z')"
echo "docker:   $(docker --version)"
echo "compose:  $(docker compose version)"
echo "firewall: $(ufw status | head -1)"
echo "fail2ban: $(systemctl is-active fail2ban)"
echo "swap:     $(swapon --show --noheadings | awk '{print $3}')"
echo "ssh:      contraseñas $(sshd -T | awk '/^passwordauthentication/{print $2}') · root $(sshd -T | awk '/^permitrootlogin/{print $2}')"
