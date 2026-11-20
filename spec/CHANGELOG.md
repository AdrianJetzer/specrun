# Spec-Changelog

## 0.2.1 – 2026-11-20
- 02: Der Arbeitsordner `/workspace` enthält zu Beginn nur `spec/`; die Container-Konfiguration liegt außerhalb (neuer Laufordner-Aufbau `env/` + `work/`).

## 0.2.0 – 2026-11-20
- Neu: **Level 2** (Webserver): `levels/level-02.md`, `frontend/nginx.conf`, `make level2`, 7 neue Checks.
- 02: Startausrüstung ist jetzt ein **Linux-Dev-Container** (Ubuntu 24.04, Node 26.13.0, Go 1.27.4, nginx 1.31.9, Chromium vorinstalliert), ohne root und ohne Docker.
- 01: Level-Titel 6 und 7 heißen jetzt „Repo + CI“ und „Images in der Pipeline“ (kein lokales Docker).
- 03: `make check` prüft alle Levels bis zum zuletzt gestarteten (`.run/level`); `make down` stoppt auch nginx.
- 05: `write-results.mjs` nimmt mehrere Levels; die Dauer eines Levels ist die Summe seiner Testdauern.
- 00: Am Ende läuft die Seite des höchsten Levels, danach einmal `make check`.

## 0.1.0 – 2026-11-20
- Erste Fassung für **Level 1** (Statische Seite).
- Grundlagen: Start, Produkt, Startausrüstung, Architektur.
- Datenmodell mit `results.schema.json`.
- Design: dunkles Dashboard, Tokens, Komponenten, `data-testid`s.
- `levels/level-01.md`.
- Noch nicht enthalten: `04-api.md` und `openapi.yaml` (ab Level 3).
