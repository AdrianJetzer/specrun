#!/usr/bin/env bash
# Specrun – räumt die Container der Läufe ab (Agent und Prüfer): anhalten und entfernen.
# Aufruf auf dem Mac: runner/aufraeumen.sh [-y] [laufordner]
#   ohne laufordner: alle Container unter dem Ordner der Läufe ($SPECRUN_RUNS, Standard ~/Documents/Claude/specruns_testlaeufe)
#   mit laufordner:  nur die Container dieses Laufs (env/ und judge/)
#   -y: ohne Rückfrage
# Erkennung über das Label devcontainer.local_folder, das VS Code jedem Dev Container gibt. Andere Container bleiben unberührt.
# Die Arbeit geht nicht verloren: work/ und protokoll/ liegen im Laufordner auf dem Mac; „Reopen in Container“ legt neu an.
set -euo pipefail

JA=0
if [ "${1:-}" = "-y" ]; then JA=1; shift; fi
if [ $# -ge 1 ]; then
  PREFIX="$(cd "$1" && pwd)/"
else
  BASE="${SPECRUN_RUNS:-$HOME/Documents/Claude/specruns_testlaeufe}"
  PREFIX="$(cd "$BASE" && pwd)/"
fi

# ID, Zustand, Ordner – nur Container, deren Ordner unter PREFIX liegt
LISTE="$(podman ps -a --format '{{.ID}} {{.State}} {{.Label "devcontainer.local_folder"}}' \
  | awk -v p="$PREFIX" 'index($3, p) == 1')"
if [ -z "$LISTE" ]; then
  echo "✔ Keine Specrun-Container unter $PREFIX"
  exit 0
fi

echo "Specrun-Container unter $PREFIX:"
echo "$LISTE" | while read -r id state ordner; do
  printf '  %-12s %-8s %s\n' "$id" "$state" "${ordner#"$PREFIX"}"
done
if [ "$JA" != 1 ]; then
  printf 'Alle anhalten und entfernen? [j/N] '
  read -r antwort
  case "$antwort" in j|J|ja|Ja) ;; *) echo "Abgebrochen, nichts geändert."; exit 0 ;; esac
fi
echo "$LISTE" | awk '{print $1}' | xargs podman rm -f -t 10 > /dev/null
echo "✔ $(echo "$LISTE" | wc -l | tr -d ' ') Container angehalten und entfernt"
