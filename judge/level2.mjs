// Unabhängiger Prüfer für Level 2 (nginx).
// Aufruf: node level2.mjs <ziel-ordner> [ausgabe-ordner]
// Setzt voraus, dass Level 1 bestanden ist (das prüft judge/all.mjs vorher).
// Prüft die Kriterien aus spec/levels/level-02.md („Bestanden, wenn“).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, startState } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level2.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const BASE = 'http://127.0.0.1:8080';
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
async function portUp(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(`${BASE}/`)).ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function portDown(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { await fetch(`${BASE}/`); } catch { return true; }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
// HTTP-Anfrage ohne automatische Dekomprimierung-Verschleierung: Header bleiben sichtbar
async function head(url, gzip = false) {
  const r = await fetch(`${BASE}${url}`, { headers: gzip ? { 'Accept-Encoding': 'gzip' } : { 'Accept-Encoding': 'identity' } });
  await r.arrayBuffer();
  return { status: r.status, h: (k) => r.headers.get(k) };
}

const publicFile = path.join(target, 'frontend/public/results.json');
const distFile = path.join(target, 'frontend/dist/results.json');
const schema = JSON.parse(fs.readFileSync(path.join(here, '../spec/results.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

console.log(`Prüfer Level 2 → ${target}\n`);

// ---- L2-K1: make level2 startet nginx ----
run('make', ['down']);
const start = run('make', ['level2']);
fs.writeFileSync(path.join(out, 'make-level2.log'), start.out);
nebenwerte.makeLevel2Ms = start.ms;
const up = start.code === 0 && (await portUp(60_000));
let server = null;
if (up) server = (await head('/')).h('server');
add('L2-K1', 'make level2 startet nginx auf Port 8080', up && server === 'nginx',
  start.code !== 0 ? `Exit-Code ${start.code}` : !up ? 'Port antwortet nicht' : server !== 'nginx' ? `Server-Header „${server}“` : `${(start.ms / 1000).toFixed(1)} s`);

const publicHashBefore = sha(publicFile);

if (up) {
  // ---- L2-K2: nginx-Regeln ----
  const problems = [];
  const expect = (cond, msg) => cond || problems.push(msg);
  const html = await (await fetch(`${BASE}/`)).text();
  const js = html.match(/\/assets\/[^"']+\.js/)?.[0];
  const css = html.match(/\/assets\/[^"']+\.css/)?.[0];
  expect(js, 'keine JS-Datei unter /assets/ in index.html');

  for (const [url, cc] of [['/', 'no-cache'], ['/index.html', 'no-cache'], ['/results.json', 'no-store'], ...(js ? [[js, 'public, max-age=31536000, immutable']] : [])]) {
    const r = await head(url);
    expect(r.status === 200, `${url}: Status ${r.status}`);
    expect(r.h('cache-control') === cc, `${url}: Cache-Control „${r.h('cache-control')}“ statt „${cc}“`);
    expect(r.h('server') === 'nginx', `${url}: Server „${r.h('server')}“`);
  }
  const missing = await head('/gibt-es-nicht.json');
  expect(missing.status === 404, `/gibt-es-nicht.json: Status ${missing.status} statt 404`);
  expect(missing.h('server') === 'nginx', `404-Antwort: Server „${missing.h('server')}“`);
  const missingAsset = await head('/assets/gibt-es-nicht.js');
  expect(missingAsset.status === 404, `/assets/gibt-es-nicht.js: Status ${missingAsset.status} statt 404`);

  for (const url of ['/', js, css, '/results.json'].filter(Boolean)) {
    const r = await head(url, true);
    expect(r.h('content-encoding') === 'gzip', `${url}: nicht gzip-komprimiert`);
    expect((r.h('vary') ?? '').toLowerCase().includes('accept-encoding'), `${url}: Vary ohne Accept-Encoding`);
  }
  const types = { '/': 'text/html', '/results.json': 'application/json', [js]: 'application/javascript', [css]: 'text/css' };
  for (const [url, t] of Object.entries(types)) {
    if (!url || url === 'undefined') continue;
    const ct = (await head(url)).h('content-type') ?? '';
    expect(ct.startsWith(t), `${url}: Content-Type „${ct}“ statt ${t}`);
  }
  add('L2-K2', 'nginx-Regeln (Cache, 404, gzip, Server, Typen)', problems.length === 0, problems.join('; '));

  // ---- L2-K3: Darstellungstests aus Level 1 über nginx ----
  const pwJson = path.join(out, 'judge-playwright-l2.json');
  const pw = run('npx', ['playwright', 'test'], {
    cwd: here,
    env: { ...process.env, TARGET_DIR: target, JUDGE_PW_JSON: pwJson, JUDGE_SHOTS: path.join(out, 'screenshots-l2') },
  });
  fs.writeFileSync(path.join(out, 'judge-playwright-l2.log'), pw.out);
  const tests = [];
  const walk = (s) => {
    for (const x of s.suites ?? []) walk(x);
    for (const sp of s.specs ?? []) tests.push({ title: sp.title, ok: sp.ok, error: sp.tests?.[0]?.results?.[0]?.error?.message ?? '' });
  };
  readJson(pwJson)?.suites?.forEach(walk);
  const failed = tests.filter((t) => !t.ok);
  add('L2-K3', 'Darstellungstests aus Level 1 bestehen über nginx', tests.length > 0 && failed.length === 0,
    tests.length === 0 ? 'keine Tests gelaufen' : failed.length ? `fehlgeschlagen: ${failed.map((t) => t.title).join('; ')}` : `${tests.length} Tests`);
  nebenwerte.judgeTests = tests;

  // ---- L2-K4: make check (Level 1 + 2) ----
  const check = run('make', ['check']);
  fs.writeFileSync(path.join(out, 'make-check-l2.log'), check.out);
  nebenwerte.makeCheckMs = check.ms;
  const data = readJson(distFile);
  const valid = data !== null && validate(data);
  const lv = (n) => data?.levels?.find((l) => l.level === n);
  const names = (n) => (lv(n)?.checks ?? []).map((c) => c.name);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ok4 = check.code === 0 && valid && lv(1)?.status === 'bestanden' && lv(2)?.status === 'bestanden' && same(names(1), LEVEL1_CHECKS) && same(names(2), LEVEL2_CHECKS);
  add('L2-K4', 'make check: Exit 0, schemagültig, Level 1 (5) und 2 (7) bestanden', ok4,
    [check.code !== 0 && `Exit-Code ${check.code}`, !valid && `Schema: ${ajv.errorsText(validate.errors)}`,
      lv(1)?.status !== 'bestanden' && `Level 1: ${lv(1)?.status}`, lv(2)?.status !== 'bestanden' && `Level 2: ${lv(2)?.status}`,
      !same(names(1), LEVEL1_CHECKS) && `Checks L1: ${JSON.stringify(names(1))}`, !same(names(2), LEVEL2_CHECKS) && `Checks L2: ${JSON.stringify(names(2))}`].filter(Boolean).join('; '));
  fs.writeFileSync(path.join(out, 'agent-results-l2.json'), JSON.stringify(data, null, 2));
  nebenwerte.selbstmessung = lv(2)?.status ?? null;

  // ---- L2-K5: Startdatei unverändert ----
  const startOk = sha(publicFile) === publicHashBefore && same(readJson(publicFile), startState());
  add('L2-K5', 'public/results.json bleibt im Startzustand', startOk, startOk ? '' : 'Datei verändert oder weicht vom Startzustand ab');
}

// ---- L2-K6: make down beendet nginx ----
run('make', ['down']);
const down = await portDown(10_000);
add('L2-K6', 'make down beendet nginx (Port 8080 frei)', down, down ? '' : 'Port 8080 antwortet weiterhin');

const passed = criteria.length === 6 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
const result = { level: 2, passed, checkedAt: new Date().toISOString(), target, criteria, nebenwerte };
fs.writeFileSync(path.join(out, 'judge-level2.json'), JSON.stringify(result, null, 2));
console.log(`\nLevel 2 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
