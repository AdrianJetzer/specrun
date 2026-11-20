// Überträgt das Ergebnis der Playwright-Suite in den ausgelieferten Build (frontend/dist/results.json).
// Die Quelle frontend/public/results.json bleibt unverändert („alles offen“),
// damit jeder Neustart (make level1) wieder bei null beginnt.
// Aufruf: node write-results.mjs <level>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const level = Number(process.argv[2] ?? 1);
const target = path.join(here, '../frontend/dist/results.json');

const report = JSON.parse(fs.readFileSync(path.join(here, '.out/playwright.json'), 'utf8'));
const checks = [];
const walk = (suite) => {
  for (const s of suite.suites ?? []) walk(s);
  for (const spec of suite.specs ?? []) {
    if (suite.title === `level-${level}`) checks.push({ name: spec.title, ok: spec.ok });
  }
};
report.suites.forEach(walk);
if (checks.length === 0) throw new Error(`Keine Checks für Level ${level} gefunden`);

const passed = checks.every((c) => c.ok);
const now = new Date().toISOString();
const results = JSON.parse(fs.readFileSync(target, 'utf8'));

results.run.updatedAt = now;
if (process.env.RUN_ID) results.run.id = process.env.RUN_ID;
for (const l of results.levels) {
  if (l.level === level) {
    Object.assign(l, {
      status: passed ? 'bestanden' : 'fehlgeschlagen',
      checkedAt: now,
      durationMs: Math.round(report.stats.duration),
      checks,
    });
  } else if (l.level > level) {
    // Nach einem Fehler sind alle folgenden Levels gesperrt; sonst bleiben sie offen.
    Object.assign(l, { status: passed ? 'offen' : 'gesperrt', checkedAt: null, durationMs: null, checks: [] });
  }
}

fs.writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
console.log(`Level ${level}: ${passed ? 'bestanden' : 'fehlgeschlagen'} (${checks.filter((c) => c.ok).length}/${checks.length} Checks)`);
process.exit(passed ? 0 : 1);
