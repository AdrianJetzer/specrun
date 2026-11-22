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

# Ab Spec 2.1.0: gemessenen Verbrauch (Tokens, Kosten) auf der Live-Seite des Laufs nachtragen (PUT /api/usage)
SPEC_VERSION="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).specVersion??"")}catch{console.log("")}' "$DEST/meta.json")"
if ! node -e 'const [a,b]=(process.argv[1]||"0.0").split(".").map(Number);process.exit(a>2||(a===2&&b>=1)?0:1)' "$SPEC_VERSION"; then
  echo "  Verbrauch nicht nachgetragen: Spec ${SPEC_VERSION:-?} kennt /api/usage noch nicht (ab 2.1.0)"
elif [ ! -f "$DEST/tokens.json" ]; then
  echo "⚠ Verbrauch nicht nachgetragen: kein tokens.json im Bericht" >&2
elif [ -z "${SPECRUN_LIVE_DOMAIN:-}" ]; then
  echo "⚠ Verbrauch nicht nachgetragen: SPECRUN_LIVE_DOMAIN ist nicht gesetzt" >&2
else
  LIVE="https://lauf-$(basename "$LAUF").$SPECRUN_LIVE_DOMAIN"
  USAGE="$(mktemp)"
  if node "$ROOT/runner/usage.mjs" "$DEST/tokens.json" > "$USAGE" \
     && curl -fsS -X PUT -H 'Content-Type: application/json' --data-binary @"$USAGE" "$LIVE/api/usage" > /dev/null; then
    echo "✔ Verbrauch nachgetragen: $LIVE (Kosten gesamt $(node -e 'const u=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).total;console.log(u.costUsd===null?"unbekannt":u.costUsd.toFixed(2)+" USD")' "$USAGE"))"
  else
    echo "⚠ Verbrauch konnte nicht nach $LIVE/api/usage geschrieben werden" >&2
  fi
  rm -f "$USAGE"
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
