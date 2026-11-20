#!/usr/bin/env bash
# Specrun – misst einen im Dev Container gebauten Laufordner und erstellt den Bericht.
# Aufruf: runner/judge-run.sh <laufordner> [höchstes-level]
# Ergebnis: runs/<datum>-<nr>-container/report.md (persönliche Pfade bereinigt)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$(cd "${1:?Aufruf: runner/judge-run.sh <laufordner> [höchstes-level]}" && pwd)"
MAX="${2:-}"

if curl -s -o /dev/null http://127.0.0.1:8080/; then
  echo "✖ Port 8080 ist belegt (läuft die Seite noch im Container? → dort 'make down', in VS Code die Weiterleitung schließen)" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
N=1; while [ -d "$ROOT/runs/$DATE-$(printf %02d $N)-container" ]; do N=$((N+1)); done
RUN_ID="$DATE-$(printf %02d $N)-container"
RUN_DIR="$ROOT/runs/$RUN_ID"
mkdir -p "$RUN_DIR"

SPEC_VERSION="$(grep -m1 'Spec-Version' "$SRC/spec/00-start.md" 2>/dev/null | sed -E 's/.*\*\* *([0-9.]+).*/\1/')"
cat > "$RUN_DIR/meta.json" <<EOF
{
  "runId": "$RUN_ID",
  "specVersion": "${SPEC_VERSION:-?}",
  "model": "interaktive Session im Dev Container",
  "fake": false,
  "buildDir": "$SRC",
  "judgedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
[ -f "$SRC/cost.txt" ] && cp "$SRC/cost.txt" "$RUN_DIR/cost.txt"

# Was hat der Agent angelegt? (ohne Spec, Umgebung, Abhängigkeiten und Build-Ausgaben)
( cd "$SRC" && find . -type f -not -path './spec/*' -not -path './.devcontainer/*' -not -path '*/node_modules/*' \
    -not -path '*/dist/*' -not -path '*/.out/*' -not -path '*/test-results/*' -not -path './.run/*' \
    -not -path './.git/*' -not -name .DS_Store -not -name 'cost.txt' | sort ) > "$RUN_DIR/files.txt"

( cd "$ROOT/judge" && { [ -d node_modules ] || npm ci > /dev/null; } )
node "$ROOT/judge/all.mjs" "$SRC" "$RUN_DIR/judge" $MAX | tee "$RUN_DIR/judge.log"

node "$ROOT/runner/report.mjs" "$RUN_DIR"
node "$ROOT/runner/sanitize.mjs" "$RUN_DIR" "$ROOT"
echo "▶ Bericht: $RUN_DIR/report.md"
