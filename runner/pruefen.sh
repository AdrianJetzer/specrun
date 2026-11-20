#!/usr/bin/env bash
# Specrun – unabhängige Prüfung eines Laufs. Läuft IM Prüfer-Container (<lauf>/judge in VS Code).
# Aufruf im Container-Terminal:  /specrun/runner/pruefen.sh [höchstes-level]
#
# Eingehängt (siehe infra/judge-devcontainer/devcontainer.json):
#   /lauf      Laufordner, nur lesbar (Werk des Agenten unter /lauf/work)
#   /specrun   Specrun (Prüfer, Spec, Runner), nur lesbar
#   /workspace <lauf>/judge, beschreibbar → Ergebnisse in /workspace/ergebnis
set -euo pipefail

MAX="${1:-}"
AGENT=/lauf/work
OUT=/workspace/ergebnis
BUILD="$HOME/build"
KIT="$HOME/specrun"
step() { echo; echo "▶ $*"; }

[ -d "$AGENT" ] || { echo "✖ $AGENT fehlt – ist der Prüfer-Container richtig geöffnet (<lauf>/judge)?" >&2; exit 1; }
[ -d /specrun/judge ] || { echo "✖ /specrun fehlt – Pfad zu Specrun in .devcontainer/devcontainer.json prüfen" >&2; exit 1; }
if [ -e "$OUT" ]; then
  echo "✖ $OUT existiert schon. Für eine neue Prüfung erst umbenennen oder löschen." >&2
  exit 1
fi

step "1/5 Werk des Agenten kopieren ($AGENT → $BUILD, ohne node_modules/dist/.run)"
rm -rf "$BUILD" && mkdir -p "$BUILD"
( cd "$AGENT" && tar --exclude=node_modules --exclude=dist --exclude=.run --exclude=.out \
    --exclude=test-results --exclude=.DS_Store -cf - . ) | ( cd "$BUILD" && tar -xf - )
echo "  $(find "$BUILD" -type f | wc -l) Dateien kopiert"

step "2/5 Prüfer vorbereiten (Kopie von /specrun, Abhängigkeiten installieren)"
rm -rf "$KIT" && mkdir -p "$KIT"
( cd /specrun && tar --exclude=node_modules --exclude=.out --exclude=test-results -cf - judge spec runner ) | ( cd "$KIT" && tar -xf - )
( cd "$KIT/judge" && npm ci --no-audit --no-fund > /dev/null )
echo "  Prüfer bereit (Spec $(grep -m1 'Spec-Version' "$KIT/spec/00-start.md" | sed -E 's/.*\*\* *([0-9.]+).*/\1/'))"

step "3/5 Metadaten"
mkdir -p "$OUT"
SPEC_VERSION="$(grep -m1 'Spec-Version' "$AGENT/spec/00-start.md" 2>/dev/null | sed -E 's/.*\*\* *([0-9.]+).*/\1/' || true)"
cat > "$OUT/meta.json" <<EOF
{
  "runId": "lauf-${SPECRUN_LAUF:-?}",
  "specVersion": "${SPEC_VERSION:-?}",
  "model": "interaktive Session im Dev Container",
  "fake": false,
  "buildDir": "/lauf/work",
  "judgedIn": "Prüfer-Container",
  "judgedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
for c in /lauf/cost.txt "$AGENT/cost.txt" /workspace/cost.txt; do [ -f "$c" ] && { cp "$c" "$OUT/cost.txt"; echo "  Kosten aus $c übernommen"; break; }; done
( cd "$AGENT" && find . -type f -not -path './spec/*' -not -path '*/node_modules/*' -not -path '*/dist/*' \
    -not -path '*/.out/*' -not -path '*/test-results/*' -not -path './.run/*' -not -name .DS_Store \
    -not -name cost.txt | sort ) > "$OUT/files.txt"
echo "  $(wc -l < "$OUT/files.txt") Dateien vom Agenten angelegt"

step "4/5 Unabhängige Messung, Level für Level"
node "$KIT/judge/all.mjs" "$BUILD" "$OUT/judge" $MAX | tee "$OUT/judge.log"

step "5/5 Bericht"
node "$KIT/runner/report.mjs" "$OUT"
echo
echo "✔ Fertig. Bericht: $OUT/report.md"
echo "  Übernehmen ins Repo (auf dem Mac): runner/uebernehmen.sh <laufordner>"
