# Durchlauf lauf-015

| | |
|---|---|
| **Score** | **80 / 100** (erreichtes Level: 8) |
| Spec-Version | 2.1.0 |
| Harness | opencode |
| Modell (vorgegeben) | deepseek/deepseek-flash |
| Bauordner | `/lauf/work` |

## Agent

- Modell laut Protokoll: deepseek/deepseek-flash
- Dauer der Session: 33 min 17 s; 108 Antworten, 170 Werkzeugaufrufe
- Tokens gesamt: 13'608'101 (Eingabe 78'381, Cache-Schreiben 0, Cache-Lesen 13'393'152, Ausgabe 136'568, davon Reasoning 70'902)
- Kosten zum API-Preis: 0.27 USD (vom Harness gemeldet: 0.13 USD)
- Laut eigener Prüfsuite erreicht: Level 10
- Angelegte Dateien: 218

## Tokens pro Level

Eine Phase reicht bis zu dem Zeitpunkt, an dem `make check` des Agenten das nächste Level erstmals bestanden meldet (ab Spec 2.0.0 aus `bauzeit.json` des Agenten). „Gesamt“ enthält Cache-Lesen, also den wiederholt mitgeschickten Gesprächsverlauf. Kosten zum API-Preis aus `runner/preise.json`.

| Phase | Dauer | kumuliert | Antworten | Werkzeugaufrufe | Ausgabe-Tokens | Anteil Ausgabe | Tokens gesamt | Kosten |
|---|---|---|---|---|---|---|---|---|
| Level 1 | 3 min 32 s | 3 min 32 s | 30 | 64 | 43'795 | 32 % | 1'957'084 | 0.08 USD |
| Level 2 | 0 min 18 s | 3 min 50 s | 3 | 4 | 2'187 | 2 % | 301'639 | 0.00 USD |
| Level 3 | 1 min 10 s | 4 min 59 s | 8 | 10 | 13'012 | 10 % | 891'110 | 0.02 USD |
| Level 4 | 1 min 18 s | 6 min 17 s | 13 | 15 | 13'674 | 10 % | 1'636'158 | 0.03 USD |
| Level 5 | 1 min 25 s | 7 min 42 s | 7 | 13 | 6'380 | 5 % | 963'565 | 0.01 USD |
| Level 6 | 2 min 32 s | 10 min 14 s | 8 | 10 | 5'664 | 4 % | 1'159'664 | 0.01 USD |
| Level 7 | 4 min 23 s | 14 min 36 s | 7 | 13 | 7'786 | 6 % | 1'077'968 | 0.02 USD |
| Level 8 | 4 min 57 s | 19 min 33 s | 8 | 10 | 7'090 | 5 % | 1'300'269 | 0.02 USD |
| Level 9 | 5 min 14 s | 24 min 47 s | 4 | 5 | 3'723 | 3 % | 678'576 | 0.01 USD |
| Level 10 | 5 min 44 s | 30 min 31 s | 8 | 9 | 10'798 | 8 % | 1'441'373 | 0.02 USD |
| danach | 2 min 44 s | – | 12 | – | 22'459 | 16 % | 2'200'695 | 0.04 USD |
| **Summe** | 33 min 17 s | | 108 | 170 | 136'568 | 100 % | 13'608'101 | 0.27 USD |

## Level 1 laut Prüfer: ✅ bestanden

- ✅ **K1** make level1 startet die Seite auf Port 8080 – 1.7 s
- ✅ **K2** gültige Testdaten werden korrekt dargestellt – 5 Tests
- ✅ **K3** fehlende/ungültige Datei → richtiger Hinweis und Leerzustand – 7 Tests
- ✅ **K4** data-testids, keine Konsolenfehler, Raster responsiv – 3 Tests
- ✅ **K5** make check: Exit 0, schemagültig, Level 1 bestanden mit den 5 Checks
- ✅ **K6** public/results.json bleibt im Startzustand

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 2 laut Prüfer: ✅ bestanden

- ✅ **L2-K1** make level2 startet nginx auf Port 8080 – 0.9 s
- ✅ **L2-K2** nginx-Regeln (Cache, 404, gzip, Server, Typen)
- ✅ **L2-K3** Darstellungstests aus Level 1 bestehen über nginx – 15 Tests
- ✅ **L2-K4** make check: Exit 0, schemagültig, Level 1 (5) und 2 (7) bestanden
- ✅ **L2-K5** public/results.json bleibt im Startzustand
- ✅ **L2-K6** make down beendet nginx (Port 8080 frei)

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 3 laut Prüfer: ✅ bestanden

- ✅ **L3-K1** make level3 startet nginx (8080) und Backend (8081) – 3.4 s
- ✅ **L3-K2** API-Vertrag: Schema, Regeln und Fehlercodes
- ✅ **L3-K3** 50 gleichzeitige Anfragen: kein 5xx, konsistenter Endzustand
- ✅ **L3-K4** Neustart setzt das Backend auf den Startzustand zurück
- ✅ **L3-K5** Go: keine Abhängigkeiten, go vet sauber, go test grün – Abdeckung 58.9 %
- ✅ **L3-K6** make check: Exit 0, schemagültig, Level 1–3 bestanden mit den Checks der Spec
- ✅ **L3-K7** public/results.json bleibt im Startzustand
- ✅ **L3-K8** make down beendet nginx und Backend (8080 und 8081 frei)

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 4 laut Prüfer: ✅ bestanden

- ✅ **L4-K1** make level4 startet alles, .run/levelboard.db existiert – 1.4 s
- ✅ **L4-K2** Datenbankdatei hat das vorgegebene Schema (user_version 1)
- ✅ **L4-K3** Historie: Reihenfolge, Inhalte, limit, 409 nicht gespeichert, Datei = API
- ✅ **L4-K4** make restart-backend behält Stand und Historie
- ✅ **L4-K5** 100 gleichzeitige Meldungen: kein 5xx, genau 100 neue Einträge, konsistent
- ✅ **L4-K6** Go: genau modernc.org/sqlite v1.62.0, go vet sauber, go test grün – Abdeckung 58.9 %
- ✅ **L4-K7** make check: Exit 0, schemagültig, Level 1–4 bestanden mit den Checks der Spec
- ✅ **L4-K8** Startdatei unverändert, make down gibt 8080 und 8081 frei

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 5 laut Prüfer: ✅ bestanden

- ✅ **L5-K1** make level5: 8080 und 8081 antworten, config.json = api, Kopfzeile „Backend“
- ✅ **L5-K2** Weiterleitung /api/ 1:1 (Status, JSON, Content-Type, no-store), Regeln aus Level 2 gelten
- ✅ **L5-K3** Live-Anzeige: gemeldete Ergebnisse erscheinen ohne Neuladen innerhalb von 7 s – erste Änderung nach 4977 ms
- ✅ **L5-K4** Backend-Ausfall: Hinweis und Leerzustand, nach Neustart wieder Daten
- ✅ **L5-K5** make check: Exit 0, results.json und /api/levels melden Level 1–5 bestanden
- ✅ **L5-K6** public/results.json und public/config.json unverändert, make down gibt die Ports frei

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 6 laut Prüfer: ✅ bestanden

- ✅ **L6-K1** Repo öffentlich mit main; lokaler HEAD = main auf GitHub, nichts uncommittet
- ✅ **L6-K2** .github/workflows/ci.yml erfüllt die Eckpunkte
- ✅ **L6-K3** Letzter Lauf von CI für den aktuellen Commit: completed/success – completed/success
- ✅ **L6-K4** Artefakt levelboard-report: Level 1–5 bestanden mit den Checks der Spec
- ✅ **L6-K5** Keine Zugangsdaten in Repo, Historie, Remote-Adresse und Pipeline-Logs
- ✅ **L6-K6** make level6 und make check: Level 1–6 bestanden mit den Checks der Spec

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 7 laut Prüfer: ✅ bestanden

- ✅ **L7-K1** Dockerfiles, nginx-container.conf und docker-compose.yml erfüllen die Eckpunkte
- ✅ **L7-K2** Job images grün; Container-Report mit den 6 Checks der Spec, alle bestanden
- ✅ **L7-K3** Beide Images öffentlich mit Tag des Commits; Labels und Laufzeit-Konfiguration stimmen – Größe: Frontend 25.2 MB, Backend 8.3 MB
- ✅ **L7-K4** make level7 und make check: Level 1–7 bestanden mit den Checks der Spec

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 8 laut Prüfer: ✅ bestanden

- ✅ **L8-K1** deploy/compose.yml, Job deploy und Commit im Backend erfüllen die Eckpunkte; kein Schlüssel im Repo
- ✅ **L8-K2** Job deploy des letzten Laufs grün; keine Geheimnisse in den Logs
- ✅ **L8-K3** Live von außen: gültiges HTTPS, Seite aus dem Backend mit aktuellem Commit, API laut Spec, Level 1–5 bestanden – https://lauf-015.2-29-223-205.sslip.io (231 ms)
- ✅ **L8-K4** make level8 und make check: Level 1–8 bestanden mit den Checks der Spec

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 9 laut Prüfer: ❌ nicht bestanden

- ❌ **L9-K1** Selbstmessung live: Level 1–9 bestanden, Level 9 mit den 5 Checks und plausiblen Lastwerten – live nicht bestanden: Level 6, 7, 8, 9; Checks von Level 9: []; metrics von Level 9 ohne connections, durationS, requests, errors, rps, p50Ms, p95Ms, maxMs
- ✅ **L9-K2** Fremdmessung live: Seite, Cache-Regeln, API-Fehler, Meldung ohne Neuladen, eigener Lasttest ohne Fehler und p95 < 1 s – p50 58 ms, p95 69 ms, 169 Anfragen/s
- ✅ **L9-K3** make level9 und make check: Level 1–9 bestanden und an die Live-API gemeldet

Selbstmessung: bestanden · Fremdmessung: fehlgeschlagen · Abweichung: ⚠ ja

## Nebenwerte

- `make level1`: 1.7 s
- `make level2`: 0.9 s
- `make level3`: 3.4 s
- `make level4`: 1.4 s
- `make level5`: 1.4 s
- Repo: https://github.com/specrun-lab/levelboard-lauf-015
- Pipeline-Läufe: 6, letzter Lauf 223 s, Commits: 6
- Image-Größen (komprimiert): Frontend 25.2 MB, Backend 8.3 MB; Job images 80 s
- Live-Anzeige: erste Änderung nach 5.0 s sichtbar
- Go-Testabdeckung: 58.9 % (2 Testdateien)
- `make check`: 19.7 s
- Bundle (dist/assets): 237.4 KB
- Screenshots: `judge/screenshots/` (Optik-Bewertung offen)

## Spec-Lücken (→ nächste Iteration)

_nach Durchsicht ergänzen_
