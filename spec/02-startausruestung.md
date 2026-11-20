# 02 – Startausrüstung

Du arbeitest in einem **Linux-Container** (Dev Container). Diese Werkzeuge sind bereits installiert. Du hast **keine root-Rechte** und kannst nichts Systemweites nachinstallieren (kein `sudo`, kein `apt`).

| Werkzeug | Version | Hinweis |
|---|---|---|
| Ubuntu | 24.04 LTS | arm64 oder amd64 |
| Node.js | 26.13.0 | |
| npm | 11.20.0 | |
| Go | 1.27.4 | ab Level 3; ohne C-Compiler (kein `-race`, kein cgo) |
| nginx | 1.31.9 (Mainline) | als Programm `nginx` im Pfad, läuft ohne root |
| GNU Make | 4.3 | |
| curl | 8.5 | |
| git | 2.43 | |
| GitHub CLI `gh` | 2.105 | ab Level 6 |
| Chromium für Playwright 1.65.1 | vorinstalliert | unter `/ms-playwright` (`PLAYWRIGHT_BROWSERS_PATH` ist gesetzt), Systembibliotheken vorhanden |

**Nicht** vorhanden: Docker, Podman oder eine andere Container-Laufzeit. Du startest keine Container.

Internetzugang für `npm` ist vorhanden.

## Arbeitsordner
Dein Arbeitsverzeichnis ist der Projektordner `/workspace`. Er enthält zu Beginn nur `spec/`. Lege das Projekt direkt darin an.

Die Seite auf Port 8080 wird an den Rechner des Benutzers weitergeleitet. Binde sie trotzdem nur an `127.0.0.1`.

## Umgebungsvariablen
| Variable | Bedeutung |
|---|---|
| `RUN_ID` | optional: ID des Durchlaufs, z. B. `2026-11-21-01`. Ist sie gesetzt, schreibt die Prüfsuite sie in `run.id` (siehe `05-datenmodell.md`). |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` – vorgegeben, nicht ändern |
