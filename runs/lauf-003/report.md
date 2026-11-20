# Durchlauf lauf-003

| | |
|---|---|
| **Score** | **20 / 100** (erreichtes Level: 2) |
| Spec-Version | 0.2.1 |
| Modell | interaktive Session im Dev Container |
| Bauordner | `/lauf/work` |

## Agent

- Kosten, Tokens und Dauer: _nicht erfasst_
- Angelegte Dateien: 24

## Level 1 laut Prüfer: ✅ bestanden

- ✅ **K1** make level1 startet die Seite auf Port 8080 – 2.2 s
- ✅ **K2** gültige Testdaten werden korrekt dargestellt – 5 Tests
- ✅ **K3** fehlende/ungültige Datei → richtiger Hinweis und Leerzustand – 7 Tests
- ✅ **K4** data-testids, keine Konsolenfehler, Raster responsiv – 3 Tests
- ✅ **K5** make check: Exit 0, schemagültig, Level 1 bestanden mit den 5 Checks
- ✅ **K6** public/results.json bleibt im Startzustand

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Level 2 laut Prüfer: ✅ bestanden

- ✅ **L2-K1** make level2 startet nginx auf Port 8080 – 0.8 s
- ✅ **L2-K2** nginx-Regeln (Cache, 404, gzip, Server, Typen)
- ✅ **L2-K3** Darstellungstests aus Level 1 bestehen über nginx – 15 Tests
- ✅ **L2-K4** make check: Exit 0, schemagültig, Level 1 (5) und 2 (7) bestanden
- ✅ **L2-K5** public/results.json bleibt im Startzustand
- ✅ **L2-K6** make down beendet nginx (Port 8080 frei)

Selbstmessung: bestanden · Fremdmessung: bestanden · Abweichung: nein

## Nebenwerte

- `make level1`: 2.2 s
- `make level2`: 0.8 s
- `make check`: 1.4 s
- Bundle (dist/assets): 224.6 KB
- Screenshots: `judge/screenshots/` (Optik-Bewertung offen)

## Spec-Lücken (→ nächste Iteration)

_nach Durchsicht ergänzen_
