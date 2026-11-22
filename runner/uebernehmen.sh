#!/usr/bin/env bash
# Specrun – übernimmt das Prüfergebnis eines Laufs ins Repo (runs/lauf-<nr>/), mit Pfad-Bereinigung.
# Aufruf auf dem Mac: runner/uebernehmen.sh <laufordner>
#                     runner/uebernehmen.sh --nur-verbrauch <laufordner>
#   --nur-verbrauch: ohne Prüfer. Rechnet Tokens und Kosten direkt aus dem Protokoll des Harness und bauzeit.json
#   des Agenten und trägt sie auf der Live-Seite des Laufs nach (ab Spec 2.1.0). Kein Bericht, kein Commit,
#   das Repo des Laufs bleibt offen; eine spätere Prüfung mit pruefen.sh + uebernehmen.sh ist weiterhin möglich.
#   LIVE_URL=<adresse> überschreibt die Live-Adresse (zum Testen).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NUR_VERBRAUCH=0
if [ "${1:-}" = "--nur-verbrauch" ]; then NUR_VERBRAUCH=1; shift; fi
LAUF="$(cd "${1:?Aufruf: runner/uebernehmen.sh [--nur-verbrauch] <laufordner>}" && pwd)"
NR="$(basename "$LAUF")"

# Trägt den Verbrauch aus einer tokens.json (Format runner/verbrauch.mjs) per PUT /api/usage auf der Live-Seite nach.
# Aufruf: verbrauch_nachtragen <tokens.json> <spec-version>
verbrauch_nachtragen() {
  local tokens="$1" version="$2" live usage
  if ! node -e 'const [a,b]=(process.argv[1]||"0.0").split(".").map(Number);process.exit(a>2||(a===2&&b>=1)?0:1)' "$version"; then
    echo "  Verbrauch nicht nachgetragen: Spec ${version:-?} kennt /api/usage noch nicht (ab 2.1.0)"
    return 0
  fi
  if [ ! -f "$tokens" ]; then
    echo "⚠ Verbrauch nicht nachgetragen: $tokens fehlt" >&2
    return 1
  fi
  if [ -n "${LIVE_URL:-}" ]; then
    live="$LIVE_URL"
  elif [ -n "${SPECRUN_LIVE_DOMAIN:-}" ]; then
    live="https://lauf-$NR.$SPECRUN_LIVE_DOMAIN"
  else
    echo "⚠ Verbrauch nicht nachgetragen: SPECRUN_LIVE_DOMAIN ist nicht gesetzt" >&2
    return 1
  fi
  usage="$(mktemp)"
  if node "$ROOT/runner/usage.mjs" "$tokens" > "$usage" \
     && curl -fsS -X PUT -H 'Content-Type: application/json' --data-binary @"$usage" "$live/api/usage" > /dev/null; then
    echo "✔ Verbrauch nachgetragen: $live (Kosten gesamt $(node -e 'const u=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).total;console.log(u.costUsd===null?"unbekannt":u.costUsd.toFixed(2)+" USD")' "$usage"))"
    rm -f "$usage"
  else
    echo "⚠ Verbrauch konnte nicht nach $live/api/usage geschrieben werden" >&2
    rm -f "$usage"
    return 1
  fi
}

# ---- Nur Verbrauch: ohne Prüfer, direkt aus dem Laufordner ----
if [ "$NUR_VERBRAUCH" = 1 ]; then
  HARNESS="$(cat "$LAUF/harness.txt" 2>/dev/null || echo claude)"
  case "$HARNESS" in opencode) PROT="$LAUF/protokoll/opencode.db" ;; *) PROT="$LAUF/protokoll" ;; esac
  BAUZEIT="$LAUF/work/bauzeit.json"
  VERSION="$(grep -m1 'Spec-Version' "$LAUF/work/spec/00-start.md" 2>/dev/null | sed -E 's/.*\*\* *([0-9.]+).*/\1/' || true)"
  [ -e "$PROT" ] || { echo "✖ Kein Protokoll des Harness ($HARNESS) unter $PROT" >&2; exit 1; }
  [ -f "$BAUZEIT" ] || { echo "✖ $BAUZEIT fehlt – ohne Bauzeit lassen sich die Tokens nicht pro Level aufteilen" >&2; exit 1; }
  # Ergebnis im Laufordner ablegen (nicht im Repo): zum Nachschauen und für eine spätere Prüfung unverändert
  node "$ROOT/runner/verbrauch.mjs" --harness "$HARNESS" --protokoll "$PROT" --bauzeit "$BAUZEIT" > "$LAUF/verbrauch.json"
  echo "✔ Verbrauch gerechnet ($HARNESS, Spec ${VERSION:-?}): $LAUF/verbrauch.json"
  verbrauch_nachtragen "$LAUF/verbrauch.json" "$VERSION"
  exit $?
fi

# ---- Normal: Prüfbericht übernehmen ----
SRC="$LAUF/judge/ergebnis"
[ -f "$SRC/report.md" ] || { echo "✖ Kein Bericht in $SRC – wurde im Prüfer-Container /specrun/runner/pruefen.sh ausgeführt?" >&2; exit 1; }

DEST="$ROOT/runs/lauf-$NR"
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
verbrauch_nachtragen "$DEST/tokens.json" "$SPEC_VERSION" || true

# Ab Level 6: das GitHub-Repo des Laufs archivieren (nur noch lesbar, bleibt als Nachweis)
REPO="specrun-lab/levelboard-lauf-$NR"
if gh api "repos/$REPO" --jq .archived > /dev/null 2>&1; then
  if [ "$(gh api "repos/$REPO" --jq .archived)" = "true" ]; then
    echo "  Repo $REPO ist bereits archiviert"
  elif gh repo archive "$REPO" --yes > /dev/null 2>&1; then
    echo "✔ Repo archiviert: https://github.com/$REPO"
  else
    echo "⚠ Repo $REPO konnte nicht archiviert werden (Rechte von gh prüfen)" >&2
  fi
fi
