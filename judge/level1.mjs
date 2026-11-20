// Unabhängiger Prüfer für Level 1.
// Aufruf: node level1.mjs <ziel-ordner> [ausgabe-ordner]
// Prüft die Kriterien aus spec/levels/level-01.md („Bestanden, wenn“) und erhebt Nebenwerte.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LEVEL1_CHECKS, startState } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level1.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const criteria = [];
const nebenwerte = {};
const add = (id, name, ok, detail = '') => {
  criteria.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` – ${detail}` : ''}`);
};
const run = (cmd, args, opts = {}) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: target, encoding: 'utf8', timeout: 300_000, ...opts });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), ms: Date.now() - t0, timedOut: r.error?.code === 'ETIMEDOUT' };
};
const sha = (f) => (fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);
const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
};
async function waitForPort(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch('http://127.0.0.1:8080/');
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const publicFile = path.join(target, 'frontend/public/results.json');
const distFile = path.join(target, 'frontend/dist/results.json');
const schema = JSON.parse(fs.readFileSync(path.join(here, '../spec/results.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

console.log(`Prüfer Level 1 → ${target}\n`);

// ---- K1: make level1 startet die Seite ----
run('make', ['down']);
const start = run('make', ['level1']);
fs.writeFileSync(path.join(out, 'make-level1.log'), start.out);
nebenwerte.makeLevel1Ms = start.ms;
const up = start.code === 0 && (await waitForPort(60_000));
add('K1', 'make level1 startet die Seite auf Port 8080', up, start.code !== 0 ? `Exit-Code ${start.code}${start.timedOut ? ' (Zeitlimit)' : ''}` : up ? `${(start.ms / 1000).toFixed(1)} s` : 'Port antwortet nicht');

const publicHashBefore = sha(publicFile);

if (up) {
  // ---- K2–K4: Darstellung mit eigenen Testdaten ----
  const pwJson = path.join(out, 'judge-playwright.json');
  const pw = run('npx', ['playwright', 'test'], {
    cwd: here,
    env: { ...process.env, TARGET_DIR: target, JUDGE_PW_JSON: pwJson, JUDGE_SHOTS: path.join(out, 'screenshots') },
  });
  fs.writeFileSync(path.join(out, 'judge-playwright.log'), pw.out);
  const report = readJson(pwJson);
  const tests = [];
  const walk = (s) => {
    for (const x of s.suites ?? []) walk(x);
    for (const sp of s.specs ?? []) tests.push({ title: sp.title, ok: sp.ok, error: sp.tests?.[0]?.results?.[0]?.error?.message ?? '' });
  };
  report?.suites?.forEach(walk);
  const group = (prefix, id, name) => {
    const g = tests.filter((t) => t.title.startsWith(prefix));
    const failed = g.filter((t) => !t.ok);
    add(id, name, g.length > 0 && failed.length === 0, g.length === 0 ? 'keine Tests gelaufen' : failed.length ? `fehlgeschlagen: ${failed.map((t) => t.title).join('; ')}` : `${g.length} Tests`);
  };
  group('K2', 'K2', 'gültige Testdaten werden korrekt dargestellt');
  group('K3', 'K3', 'fehlende/ungültige Datei → richtiger Hinweis und Leerzustand');
  group('K4', 'K4', 'data-testids, keine Konsolenfehler, Raster responsiv');
  nebenwerte.judgeTests = tests;

  // ---- K5: make check der Agenten-Suite ----
  const check = run('make', ['check']);
  fs.writeFileSync(path.join(out, 'make-check.log'), check.out);
  nebenwerte.makeCheckMs = check.ms;
  const data = readJson(distFile);
  const valid = data !== null && validate(data);
  const l1 = data?.levels?.find((l) => l.level === 1);
  const names = (l1?.checks ?? []).map((c) => c.name);
  const namesOk = JSON.stringify(names) === JSON.stringify(LEVEL1_CHECKS);
  const k5ok = check.code === 0 && valid && l1?.status === 'bestanden' && namesOk;
  add('K5', 'make check: Exit 0, schemagültig, Level 1 bestanden mit den 5 Checks', k5ok,
    [check.code !== 0 && `Exit-Code ${check.code}`, !valid && `Schema: ${ajv.errorsText(validate.errors)}`, l1 && l1.status !== 'bestanden' && `Status ${l1.status}`, !namesOk && `Checks: ${JSON.stringify(names)}`].filter(Boolean).join('; '));
  fs.writeFileSync(path.join(out, 'agent-results.json'), JSON.stringify(data, null, 2));

  // ---- K6: Startdatei unverändert ----
  const startOk = sha(publicFile) === publicHashBefore && JSON.stringify(readJson(publicFile)) === JSON.stringify(startState());
  add('K6', 'public/results.json bleibt im Startzustand', startOk, startOk ? '' : 'Datei verändert oder weicht vom Startzustand ab');

  // ---- Selbst- vs. Fremdmessung (nach allen Kriterien) ----
  const judgeSaysPass = criteria.every((c) => c.ok);
  nebenwerte.selbstmessung = l1?.status ?? null;
  nebenwerte.fremdmessung = judgeSaysPass ? 'bestanden' : 'fehlgeschlagen';
  nebenwerte.abweichung = (l1?.status === 'bestanden') !== judgeSaysPass;

  // ---- Nebenwerte: Bundle-Größe ----
  const assets = path.join(target, 'frontend/dist/assets');
  if (fs.existsSync(assets)) {
    nebenwerte.bundleBytes = fs.readdirSync(assets).reduce((s, f) => s + fs.statSync(path.join(assets, f)).size, 0);
  }
}

run('make', ['down']);

const passed = criteria.length === 6 && criteria.every((c) => c.ok);
const result = { level: 1, passed, checkedAt: new Date().toISOString(), target, criteria, nebenwerte };
fs.writeFileSync(path.join(out, 'judge-level1.json'), JSON.stringify(result, null, 2));
console.log(`\nLevel 1 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
console.log(`Ergebnis: ${path.join(out, 'judge-level1.json')}`);
process.exit(passed ? 0 : 1);
