#!/usr/bin/env bash
# Specrun – schliesst einen Lauf ab, mit einem einzigen Befehl.
# Aufruf auf dem Mac: runner/abschluss.sh <laufordner>
#   1. Container des Laufs (Agent und Prüfer) anhalten und entfernen (runner/aufraeumen.sh)
#   2. Mit Prüfbericht (judge/ergebnis/report.md): Bericht übernehmen, Verbrauch live nachtragen, Repo archivieren
#      (runner/uebernehmen.sh). Ohne Prüfbericht: nur Tokens und Kosten rechnen und live nachtragen
#      (runner/uebernehmen.sh --nur-verbrauch); eine spätere Prüfung bleibt möglich.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAUF="$(cd "${1:?Aufruf: runner/abschluss.sh <laufordner>}" && pwd)"
NR="$(basename "$LAUF")"
[ -d "$LAUF/work" ] || { echo "✖ $LAUF ist kein Laufordner (work/ fehlt)" >&2; exit 1; }

echo "── Lauf $NR: Container abräumen"
"$ROOT/runner/aufraeumen.sh" -y "$LAUF"

if [ -f "$LAUF/judge/ergebnis/report.md" ]; then
  if [ -e "$ROOT/runs/lauf-$NR" ]; then
    echo "── Prüfbericht ist schon übernommen (runs/lauf-$NR), nur der Verbrauch wird erneut nachgetragen"
    "$ROOT/runner/uebernehmen.sh" --nur-verbrauch "$LAUF"
  else
    echo "── Prüfbericht übernehmen, Verbrauch nachtragen, Repo archivieren"
    "$ROOT/runner/uebernehmen.sh" "$LAUF"
  fi
else
  echo "── Ohne Prüfung: nur Tokens und Kosten nachtragen"
  "$ROOT/runner/uebernehmen.sh" --nur-verbrauch "$LAUF"
fi

LIVE="${LIVE_URL:-${SPECRUN_LIVE_DOMAIN:+https://lauf-$NR.$SPECRUN_LIVE_DOMAIN}}"
echo "✔ Lauf $NR abgeschlossen${LIVE:+: $LIVE}"
