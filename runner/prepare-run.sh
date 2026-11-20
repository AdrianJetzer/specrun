#!/usr/bin/env bash
# Specrun – legt einen frischen Laufordner für einen Nachbau im Dev Container an.
# Aufruf: runner/prepare-run.sh [ordner]
#   Standard: ~/Documents/Claude/specruns_testlaeufe/<nächste Nummer>
# Inhalt danach: spec/ (Kopie) und .devcontainer/ (aus infra/devcontainer) – sonst nichts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${SPECRUN_RUNS:-$HOME/Documents/Claude/specruns_testlaeufe}"
if [ $# -ge 1 ]; then
  DIR="$1"
else
  mkdir -p "$BASE"
  N=1; while [ -e "$BASE/$(printf %03d $N)" ]; do N=$((N+1)); done
  DIR="$BASE/$(printf %03d $N)"
fi
[ -e "$DIR" ] && { echo "✖ Ordner existiert bereits: $DIR" >&2; exit 1; }

mkdir -p "$DIR"
cp -R "$ROOT/spec" "$DIR/spec"
cp -R "$ROOT/infra/devcontainer" "$DIR/.devcontainer"
find "$DIR" -name .DS_Store -delete

SPEC_VERSION="$(grep -m1 'Spec-Version' "$ROOT/spec/00-start.md" | sed -E 's/.*\*\* *([0-9.]+).*/\1/')"
cat <<EOF
✔ Laufordner angelegt: $DIR  (Spec $SPEC_VERSION)

So geht es weiter:
  1. In VS Code: „Ordner öffnen“ → $DIR → „Reopen in Container“.
  2. Im Container-Terminal (Ordner /workspace) Claude starten und genau diesen Auftrag geben:

     Lies spec/00-start.md und folge der Arbeitsanweisung darin vollständig. Baue das Projekt im aktuellen Verzeichnis. Stelle keine Rückfragen.

  3. Nicht eingreifen. Am Ende /cost eingeben und die Ausgabe nach $DIR/cost.txt kopieren.
  4. Im Container: make down. Dann auf dem Mac:

     runner/judge-run.sh $DIR
EOF
