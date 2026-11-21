# Durchlauf lauf-011

| | |
|---|---|
| **Score** | **100 / 100** (erreichtes Level: 10) |
| Spec-Version | 1.4.0 |
| Modell (vorgegeben) | claude-opus-5-5 |
| Bauordner | `/lauf/work` |

## Agent

- Modell laut Protokoll: claude-opus-5-5
- Dauer der Session: 43 min 50 s; 57 Antworten, 59 Werkzeugaufrufe
- Tokens gesamt: 8'616'945 (Eingabe 118, Cache-Schreiben 195'948, Cache-Lesen 8'317'636, Ausgabe 103'243)
- Laut eigener Prüfsuite erreicht: Level 10
- Angelegte Dateien: 211

## Tokens pro Level

Eine Phase reicht bis zu dem Zeitpunkt, an dem `make check` des Agenten das nächste Level erstmals bestanden meldet. „Gesamt“ enthält Cache-Lesen, also den wiederholt mitgeschickten Gesprächsverlauf.

| Phase | Dauer | kumuliert | Antworten | Werkzeugaufrufe | Ausgabe-Tokens | Anteil Ausgabe | Tokens gesamt |
|---|---|---|---|---|---|---|---|
| Level 1 | 12 min 54 s | 12 min 54 s | 24 | 26 | 42'527 | 41 % | 2'459'687 |
| Level 2 | 0 min 48 s | 13 min 42 s | 6 | 7 | 3'861 | 4 % | 912'308 |
| Level 3 | 2 min 8 s | 15 min 50 s | 4 | 4 | 15'526 | 15 % | 678'973 |
| Level 4 | 1 min 22 s | 17 min 12 s | 3 | 3 | 8'639 | 8 % | 542'446 |
| Level 5 | 0 min 45 s | 17 min 57 s | 2 | 2 | 2'353 | 2 % | 369'360 |
| Level 6 | 4 min 35 s | 22 min 31 s | 6 | 6 | 6'219 | 6 % | 1'148'860 |
| Level 7 | 4 min 4 s | 26 min 35 s | 4 | 4 | 6'996 | 7 % | 790'931 |
| Level 8 | 5 min 31 s | 32 min 7 s | 2 | 2 | 5'720 | 6 % | 414'475 |
| Level 9 | 5 min 31 s | 37 min 37 s | 2 | 2 | 3'698 | 4 % | 422'799 |
| Level 10 | 5 min 41 s | 43 min 18 s | 2 | 2 | 5'996 | 6 % | 436'175 |
| danach | 0 min 31 s | – | 2 | – | 1'708 | 2 % | 440'931 |
| **Summe** | 43 min 50 s | | 57 | 59 | 103'243 | 100 % | 8'616'945 |

## Level 1 laut Prüfer: ✅ bestanden

- ✅ **K1** make level1 startet die Seite auf Port 8080 – 30.2 s
- ✅ **K2** gültige Testdaten werden korrekt dargestellt – 5 Tests
- ✅ **K3** fehlende/ungültige Datei → richtiger Hinweis und Leerzustand – 7 Tests
- ✅ **K4** data-testids, keine Konsolenfehler, Raster responsiv – 3 Tests
- ✅ **K5** make check: Exit 0, schemagültig, Level 1 bestanden mit den 5 Checks
- ✅ **K6** public/results.json bleibt im Startzustand

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 2 laut Prüfer: ✅ bestanden

- ✅ **L2-K1** make level2 startet nginx auf Port 8080 – 1.3 s
- ✅ **L2-K2** nginx-Regeln (Cache, 404, gzip, Server, Typen)
- ✅ **L2-K3** Darstellungstests aus Level 1 bestehen über nginx – 15 Tests
- ✅ **L2-K4** make check: Exit 0, schemagültig, Level 1 (5) und 2 (7) bestanden
- ✅ **L2-K5** public/results.json bleibt im Startzustand
- ✅ **L2-K6** make down beendet nginx (Port 8080 frei)

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 3 laut Prüfer: ✅ bestanden

- ✅ **L3-K1** make level3 startet nginx (8080) und Backend (8081) – 4.4 s
- ✅ **L3-K2** API-Vertrag: Schema, Regeln und Fehlercodes
- ✅ **L3-K3** 50 gleichzeitige Anfragen: kein 5xx, konsistenter Endzustand
- ✅ **L3-K4** Neustart setzt das Backend auf den Startzustand zurück
- ✅ **L3-K5** Go: keine Abhängigkeiten, go vet sauber, go test grün – Abdeckung 75.1 %
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
- ✅ **L4-K6** Go: genau modernc.org/sqlite v1.62.0, go vet sauber, go test grün – Abdeckung 75.1 %
- ✅ **L4-K7** make check: Exit 0, schemagültig, Level 1–4 bestanden mit den Checks der Spec
- ✅ **L4-K8** Startdatei unverändert, make down gibt 8080 und 8081 frei

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 5 laut Prüfer: ✅ bestanden

- ✅ **L5-K1** make level5: 8080 und 8081 antworten, config.json = api, Kopfzeile „Backend“
- ✅ **L5-K2** Weiterleitung /api/ 1:1 (Status, JSON, Content-Type, no-store), Regeln aus Level 2 gelten
- ✅ **L5-K3** Live-Anzeige: gemeldete Ergebnisse erscheinen ohne Neuladen innerhalb von 7 s – erste Änderung nach 5226 ms
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
- ✅ **L8-K3** Live von außen: gültiges HTTPS, Seite aus dem Backend mit aktuellem Commit, API laut Spec, Level 1–5 bestanden – https://lauf-011.2-29-223-205.sslip.io (240 ms)
- ✅ **L8-K4** make level8 und make check: Level 1–8 bestanden mit den Checks der Spec

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 9 laut Prüfer: ✅ bestanden

- ✅ **L9-K1** Selbstmessung live: Level 1–9 bestanden, Level 9 mit den 5 Checks und plausiblen Lastwerten
- ✅ **L9-K2** Fremdmessung live: Seite, Cache-Regeln, API-Fehler, Meldung ohne Neuladen, eigener Lasttest ohne Fehler und p95 < 1 s – p50 58 ms, p95 81 ms, 157.1 Anfragen/s
- ✅ **L9-K3** make level9 und make check: Level 1–9 bestanden und an die Live-API gemeldet

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 10 laut Prüfer: ✅ bestanden

- ✅ **L10-K1** Level 1–10 live bestanden; Pipeline (L6), Images (L7) und Tokens aller Levels stimmen mit eigener Messung, Lasttest (L9) vollständig
- ✅ **L10-K2** Live-Seite zeigt den vollständigen Abschlussbericht sowie Kosten und Bauzeit je Karte mit genau den gemeldeten Werten
- ✅ **L10-K3** make level10 und make check: Level 1–10 bestanden, an die Live-API gemeldet, Nachprüfung bestanden

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Nebenwerte

- `make level1`: 30.2 s
- `make level2`: 1.3 s
- `make level3`: 4.4 s
- `make level4`: 1.4 s
- `make level5`: 2.0 s
- Repo: https://github.com/specrun-lab/levelboard-lauf-011
- Pipeline-Läufe: 6, letzter Lauf 202 s, Commits: 6
- Image-Größen (komprimiert): Frontend 25.2 MB, Backend 8.3 MB; Job images 82 s
- Live-Anzeige: erste Änderung nach 5.2 s sichtbar
- Go-Testabdeckung: 75.1 % (2 Testdateien)
- `make check`: 20.0 s
- Bundle (dist/assets): 233.9 KB
- Screenshots: `judge/screenshots/` (Optik-Bewertung offen)

## Spec-Lücken (→ nächste Iteration)

_nach Durchsicht ergänzen_
