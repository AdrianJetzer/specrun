#!/usr/bin/env bash
# Specrun – richtet den Hetzner-Server ein (Level 8). Läuft beim ersten Start als root über cloud-init.
# Ergebnis: Docker, Benutzer „deploy“ (nur Docker), Firewall (22, 80, 443), Netz „web“, Caddy.
# Am Ende stehen /opt/specrun/live-domain und /opt/specrun/fertig.
set -euo pipefail
exec > >(tee -a /var/log/specrun-setup.log) 2>&1

LIVE_DOMAIN="$(cat /opt/specrun/live-domain.wunsch 2>/dev/null || true)"

# Docker aus dem offiziellen Paketarchiv
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

# Deploy-Benutzer: darf Docker nutzen (sonst nichts), Läufe liegen unter ~/runs/<RUN_ID>/
usermod -aG docker deploy
install -d -o deploy -g deploy -m 0755 /home/deploy/runs

# Firewall: nur SSH, HTTP und HTTPS
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Adresse: eigene Domain aus cloud-init, sonst <ip-mit-strichen>.sslip.io
if [ -z "$LIVE_DOMAIN" ]; then
  IP="$(curl -fs --max-time 5 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 || hostname -I | awk '{print $1}')"
  LIVE_DOMAIN="$(echo "$IP" | tr . -).sslip.io"
fi
echo "$LIVE_DOMAIN" > /opt/specrun/live-domain

# Caddy im Netz „web“
docker network inspect web > /dev/null 2>&1 || docker network create web
echo "LIVE_DOMAIN=$LIVE_DOMAIN" > /opt/specrun/caddy/.env
docker compose --project-directory /opt/specrun/caddy -f /opt/specrun/caddy/compose.yml up -d

systemctl restart ssh
date -u +%Y-%m-%dT%H:%M:%SZ > /opt/specrun/fertig
echo "Specrun-Server bereit: https://<RUN_ID>.$LIVE_DOMAIN"
