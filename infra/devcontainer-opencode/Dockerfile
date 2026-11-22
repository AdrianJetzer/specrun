# Specrun – Startausrüstung für einen Lauf mit dem Harness OpenCode.
# Gleiche Basis wie für Claude Code (Werkzeuge und Versionen aus spec/02-startausruestung.md), nur der Harness ist anders.
FROM ghcr.io/specrun-lab/devcontainer:1

# Claude Code aus dem Basis-Image entfernen: Im OpenCode-Lauf soll es keinen zweiten Agenten geben
RUN rm -rf /home/dev/.local/bin/claude /home/dev/.local/share/claude /home/dev/.claude || true

# OpenCode (Version 2) fest gepinnt
USER root
RUN npm install -g @opencode/cli@2.3.2 && opencode --version
USER dev

# Alle Werkzeuge ohne Rückfrage erlauben (Wegwerf-Container ohne root), damit der Lauf ohne Eingriff durchläuft
RUN mkdir -p /home/dev/.config/opencode && printf '%s\n' \
  '{' \
  '  "$schema": "https://opencode.ai/config.json",' \
  '  "permissions": [ { "action": "*", "resource": "*", "effect": "allow" } ]' \
  '}' > /home/dev/.config/opencode/opencode.json
