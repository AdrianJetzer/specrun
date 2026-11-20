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

# Bericht auf GitHub: nur den Ordner dieses Laufs committen und pushen (andere Änderungen bleiben unberührt)
SCORE="$(grep -m1 -oE '\*\*[0-9]+ / 100\*\*' "$DEST/report.md" | tr -d '*' || true)"
if git -C "$ROOT" add -- "runs/$(basename "$DEST")" \
   && git -C "$ROOT" commit -q -m "Bericht $(basename "$DEST")${SCORE:+: Score $SCORE}" -- "runs/$(basename "$DEST")" \
   && git -C "$ROOT" push -q; then
  echo "✔ Bericht auf GitHub: $(git -C "$ROOT" remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)#https://github.com/#; s#\.git$##')/tree/main/runs/$(basename "$DEST")"
else
  echo "⚠ Bericht konnte nicht committet/gepusht werden – bitte von Hand prüfen" >&2
fi

# Ab Level 6: das GitHub-Repo des Laufs archivieren (nur noch lesbar, bleibt als Nachweis)
REPO="specrun-lab/levelboard-lauf-$(basename "$LAUF")"
if gh api "repos/$REPO" --jq .archived > /dev/null 2>&1; then
  if [ "$(gh api "repos/$REPO" --jq .archived)" = "true" ]; then
    echo "  Repo $REPO ist bereits archiviert"
  elif gh repo archive "$REPO" --yes > /dev/null 2>&1; then
    echo "✔ Repo archiviert: https://github.com/$REPO"
  else
    echo "⚠ Repo $REPO konnte nicht archiviert werden (Rechte von gh prüfen)" >&2
  fi
fi
