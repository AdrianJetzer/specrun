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
