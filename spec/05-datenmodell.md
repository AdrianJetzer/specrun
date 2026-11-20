# 05 – Datenmodell

## results.json
Die Ergebnisse aller Levels liegen in einer JSON-Datei. Ihr Format ist in **`results.schema.json`** verbindlich festgelegt (JSON Schema 2020-12). Es ist zugleich das Format der späteren REST-Antwort `GET /api/levels`.

Beispiel:
```json
{
  "run": { "id": "2026-11-21-01", "version": "0.1.0", "commit": null, "updatedAt": "2026-11-21T10:15:00.000Z" },
  "levels": [
    {
      "level": 1,
      "title": "Statische Seite",
      "status": "bestanden",
      "checkedAt": "2026-11-21T10:14:58.000Z",
      "durationMs": 2310,
      "checks": [ { "name": "Seite antwortet mit HTTP 200", "ok": true } ],
      "metrics": {}
    }
  ]
}
```
Das Beispiel zeigt nur einen der immer genau 10 Einträge in `levels`.

Feldregeln:
- `levels` enthält **immer genau 10** Einträge, jede Nummer 1–10 genau einmal, aufsteigend sortiert.
- `title` entspricht dem Titel aus `01-produkt.md`.
- Zeitangaben sind ISO-8601 in UTC (`new Date().toISOString()`).
- `durationMs` ist eine ganze Zahl.
- Ein Level mit Status `offen` oder `gesperrt` hat `checkedAt: null`, `durationMs: null`, `checks: []`.
- `metrics` ist in Level 1 immer `{}`.

## Startzustand: `frontend/public/results.json`
- `run`: `{ "id": "lokal", "version": "0.1.0", "commit": null, "updatedAt": null }`
- alle 10 Levels mit `status: "offen"`, `checkedAt: null`, `durationMs: null`, `checks: []`, `metrics: {}`
- Formatierung: `JSON.stringify(daten, null, 2)` plus abschließender Zeilenumbruch

Diese Datei wird **nie** von der Prüfsuite verändert. Jedes `make level1` baut neu und beginnt damit wieder bei „alles offen“.

## Laden in der Seite
Die Seite lädt die Datei **zur Laufzeit** mit `fetch('/results.json', { cache: 'no-store' })`; sie ist nicht in das JS-Bundle eingebaut. Daraus ergibt sich der Ladezustand:

| Fall | Zustand |
|---|---|
| Anfrage läuft noch | `loading` |
| Netzwerkfehler, HTTP 404, oder Antwort mit HTTP 2xx und `Content-Type` mit `text/html` (SPA-Fallback des Servers) | `missing` |
| sonstiger HTTP-Fehler, JSON nicht lesbar, oder Daten verletzen das Schema | `invalid` |
| gültige Daten | `ok` |

Die Prüfung ist **streng**: Jede Abweichung vom Schema macht die ganze Datei ungültig. Insbesondere gilt die Datei als ungültig bei:
- fehlenden Feldern,
- falschen Typen,
- unbekanntem Status,
- nicht genau 10 Levels,
- doppelten oder fehlenden Nummern,
- Zeitangaben, die `Date.parse` nicht lesen kann.

Im Zustand `loading`, `missing` und `invalid` zeigt die Seite den Leerzustand: `run.id` und `run.version` als „–“, `updatedAt` als „–“, alle 10 Levels `offen`.

## Ergebnis schreiben: `checks/write-results.mjs`
Aufruf: `node write-results.mjs <level>` (in Level 1: `1`). Ablauf:
1. Liest `checks/.out/playwright.json`, den JSON-Report von Playwright.
2. Sammelt alle Tests aus der `describe`-Gruppe `level-<level>`. Jeder Test ergibt einen Check `{ name: <Testtitel>, ok: <spec.ok> }`, in Report-Reihenfolge. Findet es keinen Check, bricht es mit Fehler ab.
3. Liest `frontend/dist/results.json`, also den ausgelieferten Build, **nicht** `public/`.
4. Setzt für das Level:
   - `status`: `bestanden`, wenn alle Checks ok sind, sonst `fehlgeschlagen`
   - `checkedAt`: jetzt
   - `durationMs`: `Math.round(report.stats.duration)`
   - `checks`: die gesammelten Checks
5. Setzt alle **höheren** Levels auf:
   - `offen`, wenn das Level bestanden ist,
   - `gesperrt`, wenn es fehlgeschlagen ist,

   jeweils mit `checkedAt: null`, `durationMs: null`, `checks: []`. Niedrigere Levels bleiben unverändert.
6. Setzt `run.updatedAt` auf denselben Zeitpunkt. Ist `RUN_ID` gesetzt, wird `run.id` auf deren Wert gesetzt.
7. Schreibt die Datei zurück (`JSON.stringify(…, null, 2)` + Zeilenumbruch).
8. Gibt `Level <n>: bestanden (x/y Checks)` bzw. `Level <n>: fehlgeschlagen (x/y Checks)` aus und endet mit Exit-Code 0 bzw. 1.

`vite preview` liefert die geänderte Datei sofort aus. Nach einem Neuladen zeigt die Seite das neue Ergebnis.
