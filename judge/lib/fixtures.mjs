// Gemeinsame Daten des Prüfers: feste Titel, Startzustand, Testdaten.
export const TITLES = [
  'Statische Seite', 'Webserver', 'REST-Backend', 'Datenbank', 'Frontend + Backend',
  'Repo + CI', 'Images in der Pipeline', 'Deployment', 'Live-Prüfung', 'Metriken veröffentlicht',
];

export const LEVEL1_CHECKS = [
  'Seite antwortet mit HTTP 200',
  'Titel ist „Levelboard“',
  '10 Level-Karten sichtbar',
  'Keine Konsolenfehler',
  'Handy-Ansicht: Karten einspaltig',
];

const level = (n, extra = {}) => ({
  level: n, title: TITLES[n - 1], status: 'offen', checkedAt: null, durationMs: null, checks: [], metrics: {}, ...extra,
});

export function startState() {
  return {
    run: { id: 'lokal', version: '0.1.0', commit: null, updatedAt: null },
    levels: TITLES.map((_, i) => level(i + 1)),
  };
}

const T = '2026-11-21T09:14:00.000Z'; // in Europe/Zurich: 21.11.2026, 10:14
const ok = (n) => Array.from({ length: n }, (_, i) => ({ name: `Check ${i + 1}`, ok: true }));

/** Gemischte Daten: alle 4 Status, verschiedene Dauern und Check-Zahlen. */
export function mixedState() {
  return {
    run: { id: 'judge-run-42', version: '9.8.7', commit: null, updatedAt: T },
    levels: [
      level(1, { status: 'bestanden', checkedAt: T, durationMs: 850, checks: ok(5) }),
      level(2, { status: 'bestanden', checkedAt: T, durationMs: 12_449, checks: ok(2) }),
      level(3, { status: 'fehlgeschlagen', checkedAt: T, durationMs: 3_040, checks: [...ok(1), { name: 'x', ok: false }, { name: 'y', ok: false }] }),
      ...[4, 5, 6, 7, 8, 9, 10].map((n) => level(n, { status: 'gesperrt' })),
    ],
  };
}

/** Alle bestanden. */
export function allPassedState() {
  return {
    run: { id: 'judge-all', version: '1.0.0', commit: 'abc1234', updatedAt: T },
    levels: TITLES.map((_, i) => level(i + 1, { status: 'bestanden', checkedAt: T, durationMs: 1000 * (i + 1), checks: ok(3) })),
  };
}

/** Ungültige Varianten (jede muss zu „invalid“ führen). */
export function invalidVariants() {
  const s = mixedState;
  return {
    'kein JSON': '{kaputt',
    'nur 9 Levels': JSON.stringify({ ...s(), levels: s().levels.slice(0, 9) }),
    'unbekannter Status': JSON.stringify((() => { const d = s(); d.levels[0].status = 'super'; return d; })()),
    'doppelte Nummer': JSON.stringify((() => { const d = s(); d.levels[1].level = 1; return d; })()),
    'run fehlt': JSON.stringify({ levels: s().levels }),
    'falscher Typ bei durationMs': JSON.stringify((() => { const d = s(); d.levels[0].durationMs = 'schnell'; return d; })()),
  };
}

export const LEVEL2_CHECKS = [
  'Antwort kommt von nginx',
  'results.json wird nicht zwischengespeichert',
  'index.html wird nicht zwischengespeichert',
  'Assets werden ein Jahr zwischengespeichert',
  'Fehlende Datei ergibt 404',
  'Antworten sind gzip-komprimiert',
  'Seite funktioniert über nginx',
];

export const LEVEL3_CHECKS = [
  'Backend antwortet auf /api/health',
  'GET /api/levels liefert alle 10 Levels im Schema',
  'Ergebnis melden setzt Status und Zeitpunkt',
  'Fehlschlag sperrt höhere Levels',
  'Falsche Reihenfolge ergibt 409',
  'Ungültige Anfragen ergeben 400',
  'Unbekanntes Level ergibt 404',
  'Go-Tests bestehen',
];

export const LEVEL4_CHECKS = [
  'Meldungen erscheinen in der Historie, neueste zuerst',
  'Historie begrenzt mit limit',
  'Daten überstehen einen Neustart des Backends',
  'Abgelehnte Meldungen landen nicht in der Historie',
  'Datenbank hat das vorgegebene Schema',
];

// Erwartetes DB-Schema (spec/05-datenmodell.md): [Spalte, Typ, notnull, pk]
export const DB_SCHEMA = {
  levels: [['level', 'INTEGER', 0, 1], ['status', 'TEXT', 1, 0], ['checked_at', 'TEXT', 0, 0], ['duration_ms', 'INTEGER', 0, 0], ['checks', 'TEXT', 1, 0], ['metrics', 'TEXT', 1, 0]],
  reports: [['id', 'INTEGER', 0, 1], ['level', 'INTEGER', 1, 0], ['status', 'TEXT', 1, 0], ['checked_at', 'TEXT', 1, 0], ['duration_ms', 'INTEGER', 1, 0], ['checks', 'TEXT', 1, 0], ['metrics', 'TEXT', 1, 0]],
  meta: [['key', 'TEXT', 0, 1], ['value', 'TEXT', 0, 0]],
};

export const LEVEL5_CHECKS = [
  'Seite liest aus dem Backend',
  'nginx leitet /api/ an das Backend weiter',
  'Gemeldetes Ergebnis erscheint ohne Neuladen',
  'Backend-Ausfall wird angezeigt',
  'Meldungen über nginx landen in der Historie',
];

export const LEVEL6_CHECKS = [
  'Repo existiert und ist öffentlich',
  'Lokaler Stand ist gepusht',
  'Letzter Pipeline-Lauf ist grün',
  'Report enthält Level 1–5 bestanden',
];

// Muster für Zugangsdaten (Level 6: Suche in Repo, Historie und Pipeline-Logs)
export const SECRET_PATTERNS = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\bgh[opsur]_[A-Za-z0-9]{30,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export const LEVEL7_CHECKS = [
  'Job images des letzten Laufs ist grün',
  'Beide Images liegen öffentlich in der GHCR',
  'Report der Container-Suite enthält nur bestandene Checks',
];

export const LEVEL8_CHECKS = [
  'Job deploy des letzten Laufs ist grün',
  'Live-Seite antwortet über HTTPS',
  'Live-Seite meldet den aktuellen Commit',
  'Live-Seite zeigt die Ergebnisse der Pipeline',
];

export const LEVEL9_CHECKS = [
  'Live-Seite zeigt Kopfzeile und 10 Karten',
  'Cache- und gzip-Regeln gelten live',
  'Live-API antwortet laut Spec',
  'Meldung erscheint live ohne Neuladen',
  'Lasttest: 10 Verbindungen, 30 s, ohne Fehler, p95 unter 1 s',
];

export const LEVEL10_CHECKS = [
  'Alle Teile des Berichts sind vorhanden',
  'Vollständiger Bericht wird dargestellt',
  'Teilbericht zeigt fehlende Teile',
];

export const LOADTEST_FIELDS = ['connections', 'durationS', 'requests', 'errors', 'rps', 'p50Ms', 'p95Ms', 'maxMs'];

export const CONTAINER_CHECKS = [
  'Seite läuft im Container und liest aus dem Backend',
  '/api/ wird an den Backend-Container weitergeleitet',
  'Meldung erscheint ohne Neuladen',
  'Daten überstehen einen Neustart des Backend-Containers',
  'Cache- und gzip-Regeln gelten im Container',
  'Backend-Container läuft nicht als root',
];
