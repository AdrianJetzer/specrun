#!/usr/bin/env bash
# Specrun – legt einen frischen Laufordner für einen Nachbau im Dev Container an.
# Aufruf: runner/prepare-run.sh [--modell <name>] [ordner]
#         runner/prepare-run.sh --nur-pruefer <laufordner>   (ergänzt nur judge/ in einem bestehenden Lauf)
#   Modell des Agenten: Standard claude-sonnet-5-5; Kurzformen sonnet, opus, haiku
#   (→ claude-sonnet-5-5, claude-opus-5-5, claude-haiku-5-5) oder eine vollständige Modell-ID.
#   Standard-Ordner: ~/Documents/Claude/specruns_testlaeufe/<nächste Nummer>
#
# Aufbau danach:
#   <lauf>/env/.devcontainer/    Container des Agenten   → in VS Code öffnen, Agent baut
#   <lauf>/work/spec/            Arbeitsordner des Agenten (/workspace), zu Beginn nur spec/
#   <lauf>/judge/.devcontainer/  Container des Prüfers   → danach in VS Code öffnen, Prüfer misst
#   <lauf>/protokoll/            Session-Protokolle von Claude (für Tokens pro Level)
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

MODEL=claude-sonnet-5-5
if [ "${1:-}" = "--modell" ]; then
  MODEL="${2:?Aufruf: runner/prepare-run.sh --modell <sonnet|opus|haiku|modell-id> [ordner]}"
  shift 2
fi
case "$MODEL" in
  sonnet) MODEL=claude-sonnet-5-5 ;;
  opus) MODEL=claude-opus-5-5 ;;
  haiku) MODEL=claude-haiku-5-5 ;;
  claude-*) ;;
  *) echo "✖ Unbekanntes Modell: $MODEL (sonnet, opus, haiku oder eine Modell-ID wie claude-sonnet-5-5)" >&2; exit 1 ;;
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
cp -R "$ROOT/infra/devcontainer" "$DIR/env/.devcontainer"
# Lauf-ID für das GitHub-Repo des Agenten (ab Level 6): specrun-lab/levelboard-lauf-<nr>
sed -i '' -e "s|__RUN_ID__|lauf-$(basename "$DIR")|g" -e "s|__MODEL__|$MODEL|g" "$DIR/env/.devcontainer/devcontainer.json"
# Vorgegebenes Modell für den Prüfer (Metadaten im Bericht)
echo "$MODEL" > "$DIR/modell.txt"
cp -R "$ROOT/spec" "$DIR/work/spec"
DIR="$(cd "$DIR" && pwd)"
add_judge "$DIR"
find "$DIR" -name .DS_Store -delete

SPEC_VERSION="$(grep -m1 'Spec-Version' "$ROOT/spec/00-start.md" | sed -E 's/.*\*\* *([0-9.]+).*/\1/')"
cat <<EOF
✔ Laufordner angelegt: $DIR  (Spec $SPEC_VERSION, Modell $MODEL)
    env/    → Container des Agenten (enthält nur .devcontainer/)
    work/   → Arbeitsordner des Agenten, im Container /workspace (enthält nur spec/)
    judge/  → Container des Prüfers

So geht es weiter:
  1. In VS Code: „Ordner öffnen“ → $DIR/env → „Reopen in Container“.
  2. Im Container-Terminal (Ordner /workspace) Claude starten und genau diesen Auftrag geben:

     Lies spec/00-start.md und folge der Arbeitsanweisung darin vollständig. Baue das Projekt im aktuellen Verzeichnis. Stelle keine Rückfragen.

  3. Nicht eingreifen. Tokens und Dauer werden automatisch aus $DIR/protokoll ausgewertet.
  4. Container schließen. Dann in VS Code: „Ordner öffnen“ → $DIR/judge → „Reopen in Container“
     und im Container-Terminal:

     /specrun/runner/pruefen.sh

  5. Ergebnis ins Repo übernehmen (auf dem Mac):

     $ROOT/runner/uebernehmen.sh $DIR
EOF
