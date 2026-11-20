#!/usr/bin/env bash
# Specrun – übernimmt das Prüfergebnis eines Laufs ins Repo (runs/lauf-<nr>/), mit Pfad-Bereinigung.
# Aufruf auf dem Mac: runner/uebernehmen.sh <laufordner>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAUF="$(cd "${1:?Aufruf: runner/uebernehmen.sh <laufordner>}" && pwd)"
SRC="$LAUF/judge/ergebnis"
[ -f "$SRC/report.md" ] || { echo "✖ Kein Bericht in $SRC – wurde im Prüfer-Container /specrun/runner/pruefen.sh ausgeführt?" >&2; exit 1; }

DEST="$ROOT/runs/lauf-$(basename "$LAUF")"
[ -e "$DEST" ] && { echo "✖ $DEST existiert bereits" >&2; exit 1; }
mkdir -p "$DEST"
( cd "$SRC" && tar --exclude=.DS_Store -cf - . ) | ( cd "$DEST" && tar -xf - )
node "$ROOT/runner/sanitize.mjs" "$DEST" "$ROOT"
echo "✔ Übernommen: $DEST"
grep -m1 'Score' "$DEST/report.md" || true
