#!/usr/bin/env bash
# Specrun – bereitet den Hetzner-Server vor (Level 8). Läuft auf dem Mac.
# Aufruf: infra/server/vorbereiten.sh [eigene-domain]
#   ohne Domain: Adresse wird <server-ip>.sslip.io (z. B. 89-67-45-123.sslip.io)
#
# Erzeugt in ~/.specrun/server/ (außerhalb des Repos, nur für dich lesbar):
#   deploy_ed25519, deploy_ed25519.pub   SSH-Schlüssel für den Benutzer „deploy“ (nur für die Pipeline)
#   cloud-init.yaml                      zum Einfügen in der Hetzner-Konsole („Cloud config“)
# Ein vorhandener Schlüssel wird wiederverwendet.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HOME/.specrun/server"
DOMAIN="${1:-}"

mkdir -p "$OUT" && chmod 700 "$OUT"
if [ ! -f "$OUT/deploy_ed25519" ]; then
  ssh-keygen -q -t ed25519 -N '' -C specrun-deploy -f "$OUT/deploy_ed25519"
  echo "✔ Neuer Deploy-Schlüssel: $OUT/deploy_ed25519"
else
  echo "  Deploy-Schlüssel vorhanden: $OUT/deploy_ed25519"
fi

b64() { base64 < "$1" | tr -d '\n'; }
{
  echo '#cloud-config'
  echo '# Specrun – Hetzner-Server für Level 8 (erzeugt von infra/server/vorbereiten.sh)'
  echo 'package_update: true'
  echo 'package_upgrade: true'
  echo 'packages: [ca-certificates, curl, ufw]'
  echo 'users:'
  echo '  - default'
  echo '  - name: deploy'
  echo '    shell: /bin/bash'
  echo '    lock_passwd: true'
  echo '    ssh_authorized_keys:'
  echo "      - $(cat "$OUT/deploy_ed25519.pub")"
  echo 'write_files:'
  echo '  - path: /etc/ssh/sshd_config.d/90-specrun.conf'
  echo '    content: |'
  echo '      PasswordAuthentication no'
  echo '      KbdInteractiveAuthentication no'
  echo '  - path: /opt/specrun/setup.sh'
  echo '    permissions: "0755"'
  echo '    encoding: b64'
  echo "    content: $(b64 "$HERE/setup.sh")"
  echo '  - path: /opt/specrun/caddy/Caddyfile'
  echo '    encoding: b64'
  echo "    content: $(b64 "$HERE/Caddyfile")"
  echo '  - path: /opt/specrun/caddy/compose.yml'
  echo '    encoding: b64'
  echo "    content: $(b64 "$HERE/compose.yml")"
  if [ -n "$DOMAIN" ]; then
    echo '  - path: /opt/specrun/live-domain.wunsch'
    echo "    content: \"$DOMAIN\""
  fi
  echo 'runcmd:'
  echo '  - [bash, /opt/specrun/setup.sh]'
} > "$OUT/cloud-init.yaml"

cat <<EOF
✔ cloud-init-Datei: $OUT/cloud-init.yaml

So geht es weiter (Hetzner-Konsole → Projekt → „Server hinzufügen“):
  - Standort: beliebig in der EU, z. B. Nürnberg oder Falkenstein
  - Image: Ubuntu 24.04
  - Typ: kleinster Server mit x86 (Intel/AMD), 2 vCPU reichen
  - Netzwerk: öffentliche IPv4 aktiv lassen
  - SSH-Schlüssel: deinen eigenen (für root, nur für Notfälle)
  - Cloud config: Inhalt von cloud-init.yaml einfügen, z. B. so in die Zwischenablage:

      pbcopy < $OUT/cloud-init.yaml

Nach dem Erstellen (Einrichtung dauert etwa 2–4 Minuten):

      $HERE/verbinden.sh <server-ip>
EOF
