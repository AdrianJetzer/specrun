#!/usr/bin/env bash
# Specrun – prüft den frisch erstellten Hetzner-Server und trägt die Zugangsdaten in GitHub ein (Level 8).
# Läuft auf dem Mac, nach infra/server/vorbereiten.sh und dem Erstellen des Servers.
# Aufruf: infra/server/verbinden.sh <server-ip>
#
# Setzt in der Organisation specrun-lab (mit deinem eigenen gh-Login, nicht mit dem Agent-Token):
#   Secrets   DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS
#   Variable  LIVE_DOMAIN
# Werte werden nie angezeigt; gh liest sie aus Dateien bzw. Variablen.
set -euo pipefail

IP="${1:?Aufruf: infra/server/verbinden.sh <server-ip>}"
ORG=specrun-lab
OUT="$HOME/.specrun/server"
KEY="$OUT/deploy_ed25519"
KNOWN="$OUT/known_hosts"
[ -f "$KEY" ] || { echo "✖ $KEY fehlt – zuerst infra/server/vorbereiten.sh" >&2; exit 1; }

echo "▶ Warte auf SSH von $IP …"
for i in $(seq 1 60); do
  ssh-keyscan -T 5 -t ed25519 "$IP" 2> /dev/null > "$KNOWN.neu" && [ -s "$KNOWN.neu" ] && break
  sleep 5
done
[ -s "$KNOWN.neu" ] || { echo "✖ Server antwortet nicht auf SSH" >&2; exit 1; }
mv "$KNOWN.neu" "$KNOWN"
echo "  Host-Schlüssel: $(ssh-keygen -lf "$KNOWN" | awk '{print $2}')"
echo "  (Wer ganz sicher gehen will, vergleicht ihn in der Hetzner-Konsole: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub)"

SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o UserKnownHostsFile="$KNOWN" -o StrictHostKeyChecking=yes -o ConnectTimeout=10 "deploy@$IP")
echo "▶ Warte auf das Ende der Einrichtung (cloud-init) …"
for i in $(seq 1 72); do
  "${SSH[@]}" test -f /opt/specrun/fertig 2> /dev/null && break
  sleep 5
done
"${SSH[@]}" test -f /opt/specrun/fertig || { echo "✖ Einrichtung nicht fertig – Log auf dem Server: /var/log/specrun-setup.log" >&2; exit 1; }

DOMAIN="$("${SSH[@]}" cat /opt/specrun/live-domain)"
echo "  Docker: $("${SSH[@]}" docker --version)"
echo "  Caddy:  $("${SSH[@]}" docker ps --filter name=caddy --format '{{.Status}}')"
echo "  Adresse der Läufe: https://<RUN_ID>.$DOMAIN"

echo
read -r -p "Secrets und Variable jetzt in der Organisation $ORG setzen? [j/N] " ok
if [ "$ok" = "j" ]; then
  gh secret set DEPLOY_HOST --org "$ORG" --visibility all --body "$IP"
  gh secret set DEPLOY_USER --org "$ORG" --visibility all --body deploy
  gh secret set DEPLOY_SSH_KEY --org "$ORG" --visibility all < "$KEY"
  gh secret set DEPLOY_KNOWN_HOSTS --org "$ORG" --visibility all < "$KNOWN"
  gh variable set LIVE_DOMAIN --org "$ORG" --visibility all --body "$DOMAIN"
  echo "✔ Secrets und LIVE_DOMAIN gesetzt"
else
  echo "  Übersprungen."
fi

cat <<EOF

Zum Schluss in ~/.zshrc eintragen (Agent und Prüfer lesen die Adresse daraus):

  export SPECRUN_LIVE_DOMAIN=$DOMAIN
EOF
