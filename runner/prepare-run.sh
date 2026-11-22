#!/usr/bin/env bash
# Specrun – legt einen frischen Laufordner für einen Nachbau im Dev Container an.
# Aufruf: runner/prepare-run.sh [--harness <claude|opencode>] [--modell <name>] [ordner]
#         runner/prepare-run.sh --nur-pruefer <laufordner>   (ergänzt nur judge/ in einem bestehenden Lauf)
#   Modell des Agenten: Standard claude-sonnet-5-5; Kurzformen sonnet, opus, haiku
#   (→ claude-sonnet-5-5, claude-opus-5-5, claude-haiku-5-5) oder eine vollständige Modell-ID.
#   Harness: Standard claude (Claude Code); opencode (OpenCode 2, Standard-Modell opencode/big-pickle,
#   andere Anbieter als <anbieter>/<modell>, z. B. deepseek/deepseek-flash mit SPECRUN_DEEPSEEK_API_KEY).
#   Standard-Ordner: ~/Documents/Claude/specruns_testlaeufe/<nächste Nummer>
#
# Aufbau danach:
#   <lauf>/env/.devcontainer/    Container des Agenten   → in VS Code öffnen, Agent baut
#   <lauf>/work/spec/            Arbeitsordner des Agenten (/workspace), zu Beginn nur spec/
#   <lauf>/judge/.devcontainer/  Container des Prüfers   → danach in VS Code öffnen, Prüfer misst
#   <lauf>/protokoll/            Protokoll des Harness (für Tokens und Kosten, ausgewertet vom Prüfer)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${SPECRUN_RUNS:-$HOME/Documents/Claude/specruns_testlaeufe}"

add_judge() {
  local dir="$1" nr
  nr="$(basename "$dir")"
  [ -e "$dir/judge" ] && { echo "✖ $dir/judge existiert bereits" >&2; exit 1; }
  mkdir -p "$dir/judge/.devcontainer"
  cp "$ROOT/infra/devcontainer/Dockerfile" "$dir/judge/.devcontainer/Dockerfile"
  sed -e "s|__SPECRUN__|$ROOT|g" -e "s|__LAUF__|$nr|g" \
    "$ROOT/infra/judge-devcontainer/devcontainer.json" > "$dir/judge/.devcontainer/devcontainer.json"
}

if [ "${1:-}" = "--nur-pruefer" ]; then
  DIR="$(cd "${2:?Aufruf: runner/prepare-run.sh --nur-pruefer <laufordner>}" && pwd)"
  add_judge "$DIR"
  echo "✔ Prüfer ergänzt: $DIR/judge  → in VS Code öffnen, „Reopen in Container“, dann /specrun/runner/pruefen.sh"
  exit 0
fi

HARNESS=claude
MODEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --harness) HARNESS="${2:?Aufruf: --harness <claude|opencode>}"; shift 2 ;;
    --modell) MODEL="${2:?Aufruf: --modell <name>}"; shift 2 ;;
    *) break ;;
  esac
done
case "$HARNESS" in
  claude)
    MODEL="${MODEL:-claude-sonnet-5-5}"
    case "$MODEL" in
      sonnet) MODEL=claude-sonnet-5-5 ;;
      opus) MODEL=claude-opus-5-5 ;;
      haiku) MODEL=claude-haiku-5-5 ;;
      claude-*) ;;
      *) echo "✖ Unbekanntes Modell für Claude Code: $MODEL (sonnet, opus, haiku oder eine Modell-ID wie claude-sonnet-5-5)" >&2; exit 1 ;;
    esac ;;
  opencode)
    # OpenCode erwartet Modelle als <anbieter>/<modell>, z. B. opencode/big-pickle oder anthropic/claude-sonnet-5-5
    MODEL="${MODEL:-opencode/big-pickle}"
    case "$MODEL" in */*) ;; *) echo "✖ Modell für OpenCode als <anbieter>/<modell> angeben, z. B. opencode/big-pickle" >&2; exit 1 ;; esac
    # Schlüssel des Anbieters muss auf dem Mac gesetzt sein (der Container übernimmt ihn beim Start)
    case "$MODEL" in
      deepseek/*) [ -n "${SPECRUN_DEEPSEEK_API_KEY:-}" ] || echo "⚠ SPECRUN_DEEPSEEK_API_KEY ist nicht gesetzt (in ~/.zshrc eintragen, VS Code neu starten)" >&2 ;;
      opencode/*) [ -n "${SPECRUN_OPENCODE_API_KEY:-}" ] || echo "⚠ SPECRUN_OPENCODE_API_KEY ist nicht gesetzt (in ~/.zshrc eintragen, VS Code neu starten)" >&2 ;;
    esac ;;
  *) echo "✖ Unbekannter Harness: $HARNESS (claude oder opencode)" >&2; exit 1 ;;
esac

if [ $# -ge 1 ]; then
  DIR="$1"
else
  mkdir -p "$BASE"
  N=1; while [ -e "$BASE/$(printf %03d $N)" ]; do N=$((N+1)); done
  DIR="$BASE/$(printf %03d $N)"
fi
[ -e "$DIR" ] && { echo "✖ Ordner existiert bereits: $DIR" >&2; exit 1; }

mkdir -p "$DIR/env" "$DIR/work" "$DIR/protokoll"
if [ "$HARNESS" = claude ]; then cp -R "$ROOT/infra/devcontainer" "$DIR/env/.devcontainer"; else cp -R "$ROOT/infra/devcontainer-$HARNESS" "$DIR/env/.devcontainer"; fi
# Lauf-ID für das GitHub-Repo des Agenten (ab Level 6): specrun-lab/levelboard-lauf-<nr>
sed -i '' -e "s|__RUN_ID__|lauf-$(basename "$DIR")|g" -e "s|__MODEL__|$MODEL|g" "$DIR/env/.devcontainer/devcontainer.json"
# Vorgegebenes Modell für den Prüfer (Metadaten im Bericht)
echo "$MODEL" > "$DIR/modell.txt"
echo "$HARNESS" > "$DIR/harness.txt"
cp -R "$ROOT/spec" "$DIR/work/spec"
DIR="$(cd "$DIR" && pwd)"
add_judge "$DIR"
find "$DIR" -name .DS_Store -delete

if [ "$HARNESS" = opencode ]; then START='opencode --standalone --model "$SPECRUN_MODEL"'; else START='claude'; fi
SPEC_VERSION="$(grep -m1 'Spec-Version' "$ROOT/spec/00-start.md" | sed -E 's/.*\*\* *([0-9.]+).*/\1/')"
cat <<EOF
✔ Laufordner angelegt: $DIR  (Spec $SPEC_VERSION, Harness $HARNESS, Modell $MODEL)
    env/    → Container des Agenten (enthält nur .devcontainer/)
    work/   → Arbeitsordner des Agenten, im Container /workspace (enthält nur spec/)
    judge/  → Container des Prüfers

So geht es weiter:
  1. In VS Code: „Ordner öffnen“ → $DIR/env → „Reopen in Container“.
  2. Im Container-Terminal (Ordner /workspace) den Agenten starten:

     $START

     und genau diesen Auftrag geben:

     Lies spec/00-start.md und folge der Arbeitsanweisung darin vollständig. Baue das Projekt im aktuellen Verzeichnis. Stelle keine Rückfragen.

  3. Nicht eingreifen. Tokens und Kosten wertet der Prüfer aus $DIR/protokoll aus, die Bauzeit kommt aus bauzeit.json des Agenten.
  4. Container schließen. Dann in VS Code: „Ordner öffnen“ → $DIR/judge → „Reopen in Container“
     und im Container-Terminal:

     /specrun/runner/pruefen.sh

  5. Ergebnis ins Repo übernehmen (auf dem Mac):

     $ROOT/runner/uebernehmen.sh $DIR
EOF
