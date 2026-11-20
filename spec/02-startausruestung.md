# 02 – Startausrüstung

Diese Werkzeuge sind auf dem Rechner bereits vorhanden. Installiere nichts Globales nach.

| Werkzeug | Version |
|---|---|
| macOS (Apple Silicon) | 26.x |
| Node.js | 26.13.0 |
| npm | 11.20.0 |
| GNU Make | 3.81 |
| curl | 8.x |

Playwright wird als Projekt-Abhängigkeit installiert (siehe `03-architektur.md`). Den Browser lädt `make check` bei Bedarf mit `npx playwright install chromium`.

Internetzugang für `npm` ist vorhanden.

## Umgebungsvariablen
| Variable | Bedeutung |
|---|---|
| `RUN_ID` | optional: ID des Durchlaufs, z. B. `2026-11-21-01`. Ist sie gesetzt, schreibt die Prüfsuite sie in `run.id` (siehe `05-datenmodell.md`). |
