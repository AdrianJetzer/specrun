#!/usr/bin/env bash
# Specrun – ein Nachbau-Durchlauf.
# Eine frische Claude-Session baut das Levelboard nur aus spec/. Danach misst der unabhängige Prüfer.
#
# Aufruf:  runner/run.sh [--model <modell>] [--budget <usd>] [--timeout <minuten>] [--fake]
#   --fake   kein Agent: kopiert die Referenz als „Nachbau“ (zum Testen der Kette, kostet nichts)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="claude-opus-5-5"
BUDGET="10"
TIMEOUT_MIN="45"
FAKE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --budget) BUDGET="$2"; shift 2 ;;
    --timeout) TIMEOUT_MIN="$2"; shift 2 ;;
    --fake) FAKE=1; shift ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

DATE="$(date +%Y-%m-%d)"
N=1; while [ -d "$ROOT/runs/$DATE-$(printf %02d $N)" ]; do N=$((N+1)); done
RUN_ID="$DATE-$(printf %02d $N)"
[ "$FAKE" = 1 ] && RUN_ID="$RUN_ID-fake"
RUN_DIR="$ROOT/runs/$RUN_ID"
# Bauordner AUSSERHALB von Specrun: Die Session sieht weder Referenz, Prüfer noch Konzept.
BUILD_DIR="${SPECRUN_BUILDS:-$HOME/specrun-builds}/$RUN_ID"

say() { echo "▶ $*"; }
fail() { echo "✖ $*" >&2; exit 1; }

# ---------- Vorprüfung (Startausrüstung laut spec/02-startausruestung.md) ----------
say "Vorprüfung"
need() { command -v "$1" > /dev/null || fail "$1 fehlt"; }
for t in node npm make curl claude; do need "$t"; done
NODE_V="$(node -v)"; NPM_V="$(npm -v)"
[ "$NODE_V" = "v26.13.0" ] || echo "  ⚠ Node $NODE_V (Spec: v26.13.0)"
[ "$NPM_V" = "11.20.0" ] || echo "  ⚠ npm $NPM_V (Spec: 11.20.0)"
if curl -s -o /dev/null http://127.0.0.1:8080/; then
  fail "Port 8080 ist belegt (läuft noch die Referenz? → 'make down' in reference/)"
fi
[ -e "$BUILD_DIR" ] && fail "Bauordner existiert bereits: $BUILD_DIR"

mkdir -p "$RUN_DIR" "$BUILD_DIR"
cp -R "$ROOT/spec" "$BUILD_DIR/spec"
SPEC_VERSION="$(grep -m1 'Spec-Version' "$ROOT/spec/00-start.md" | sed -E 's/.*\*\* *([0-9.]+).*/\1/')"
cat > "$RUN_DIR/meta.json" <<EOF
{
  "runId": "$RUN_ID",
  "specVersion": "$SPEC_VERSION",
  "model": "$MODEL",
  "budgetUsd": $BUDGET,
  "timeoutMin": $TIMEOUT_MIN,
  "fake": $([ $FAKE = 1 ] && echo true || echo false),
  "buildDir": "$BUILD_DIR",
  "node": "$NODE_V",
  "npm": "$NPM_V",
  "claudeCode": "$(claude --version 2>/dev/null | head -1)",
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
say "Durchlauf $RUN_ID | Spec $SPEC_VERSION | Modell $MODEL | Budget \$$BUDGET | Zeitlimit ${TIMEOUT_MIN} min"
say "Bauordner: $BUILD_DIR"

# ---------- Agent baut ----------
PROMPT='Lies spec/00-start.md und folge der Arbeitsanweisung darin vollständig. Baue das Projekt im aktuellen Verzeichnis. Stelle keine Rückfragen.'
START=$(date +%s)
if [ "$FAKE" = 1 ]; then
  say "FAKE: kopiere Referenz statt Agent"
  rsync -a --exclude node_modules --exclude dist --exclude .run --exclude .out --exclude test-results "$ROOT/reference/" "$BUILD_DIR/"
  echo '{"type":"result","subtype":"fake","total_cost_usd":0,"num_turns":0,"usage":{}}' > "$RUN_DIR/claude.json"
else
  say "Agent arbeitet … (Ausgabe am Ende in runs/$RUN_ID/claude.json)"
  # --setting-sources project: keine Benutzer-Einstellungen, Hooks oder Plugins → vergleichbare Läufe
  # --strict-mcp-config ohne --mcp-config: keine MCP-Server
  # --permission-mode dontAsk: alles außer den erlaubten Werkzeugen wird ohne Rückfrage abgelehnt
  ( cd "$BUILD_DIR" && RUN_ID="$RUN_ID" exec claude -p "$PROMPT" \
      --model "$MODEL" \
      --output-format json \
      --max-budget-usd "$BUDGET" \
      --permission-mode dontAsk \
      --allowedTools "Bash Read Write Edit Glob Grep" \
      --setting-sources project \
      --strict-mcp-config \
      --no-session-persistence \
      > "$RUN_DIR/claude.json" 2> "$RUN_DIR/claude.stderr.log" ) &
  AGENT_PID=$!
  # Wächter für das Zeitlimit
  ( sleep $((TIMEOUT_MIN * 60)); kill "$AGENT_PID" 2>/dev/null && echo "timeout" > "$RUN_DIR/agent_timeout.txt" ) &
  WATCH_PID=$!
  wait "$AGENT_PID"
  echo "$?" > "$RUN_DIR/agent_exit.txt"
  kill "$WATCH_PID" 2>/dev/null
fi
echo "$(( $(date +%s) - START ))" > "$RUN_DIR/agent_seconds.txt"
say "Agent fertig nach $(cat "$RUN_DIR/agent_seconds.txt") s"

# Was hat der Agent angelegt? (ohne Abhängigkeiten und Build-Ausgaben)
( cd "$BUILD_DIR" && find . -type f -not -path '*/node_modules/*' -not -path './spec/*' -not -path '*/dist/*' \
    -not -path '*/.out/*' -not -path '*/test-results/*' -not -path './.run/*' | sort ) > "$RUN_DIR/files.txt"

# Seite des Agenten stoppen, damit der Prüfer sauber selbst startet
( cd "$BUILD_DIR" && make down > /dev/null 2>&1 )

# ---------- Prüfer ----------
say "Prüfer misst"
if [ -f "$BUILD_DIR/Makefile" ]; then
  ( cd "$ROOT/judge" && [ -d node_modules ] || npm ci --prefix "$ROOT/judge" > /dev/null )
  node "$ROOT/judge/level1.mjs" "$BUILD_DIR" "$RUN_DIR/judge" | tee "$RUN_DIR/judge.log"
else
  echo "Kein Makefile im Bauordner – Level 1 nicht prüfbar" | tee "$RUN_DIR/judge.log"
fi

# ---------- Bericht ----------
node "$ROOT/runner/report.mjs" "$RUN_DIR"
say "Bericht: $RUN_DIR/report.md"
