// Unabhängiger Prüfer für Level 5 (Frontend + Backend).
// Aufruf: node level5.mjs <ziel-ordner> [ausgabe-ordner]
// Setzt voraus, dass Level 1–4 bestanden sind (judge/all.mjs). Kriterien aus spec/levels/level-05.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, startState } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level5.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const WEB = 'http://127.0.0.1:8080';
const API = 'http://127.0.0.1:8081';
const LIVE_MS = 7000;
const criteria = [];
const nebenwerte = {};
const add = (id, name, ok, detail = '') => {
  criteria.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` – ${detail}` : ''}`);
};
const run = (cmd, args, opts = {}) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: target, encoding: 'utf8', timeout: 300_000, ...opts });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), ms: Date.now() - t0 };
};
const sha = (f) => (fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);
const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return true; } catch {}
    await sleep(500);
  }
  return false;
}
async function gone(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { await fetch(url); } catch { return true; }
    await sleep(300);
  }
  return false;
}
async function call(base, method, p, { body, raw, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined || raw !== undefined) {
    init.headers['Content-Type'] ??= 'application/json';
    init.body = raw ?? JSON.stringify(body);
  }
  try {
    const r = await fetch(`${base}${p}`, init);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, h: (k) => r.headers.get(k), json, text };
  } catch (e) {
    return { status: 0, h: () => null, json: null, text: `nicht erreichbar: ${e.cause?.code ?? e.message}` };
  }
}
const rep = (ok, durationMs) => ({ checks: [{ name: 'Prüfer', ok }], durationMs });

/** Wartet, bis cond() wahr ist (oder die Zeit abläuft); liefert true/false. */
async function eventually(cond, ms = LIVE_MS) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await cond()) return true; } catch {}
    await sleep(250);
  }
  return false;
}

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const vResults = ajv.compile(JSON.parse(fs.readFileSync(path.join(here, '../spec/results.schema.json'), 'utf8')));
const publicResults = path.join(target, 'frontend/public/results.json');
const publicConfig = path.join(target, 'frontend/public/config.json');
const distFile = path.join(target, 'frontend/dist/results.json');
console.log(`Prüfer Level 5 → ${target}\n`);

// ---- L5-K1: make level5 ----
run('make', ['down']);
const hashResults = sha(publicResults);
const hashConfig = sha(publicConfig);
const start = run('make', ['level5']);
fs.writeFileSync(path.join(out, 'make-level5.log'), start.out);
nebenwerte.makeLevel5Ms = start.ms;
const webUp = start.code === 0 && (await up(`${WEB}/`, 60_000));
const apiUp = start.code === 0 && (await up(`${API}/api/health`, 60_000));
const cfg = webUp ? (await call(WEB, 'GET', '/config.json')).json : null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
const card = (n) => page.locator(`[data-testid="level-card"][data-level="${n}"]`);
let header = null;
if (webUp && apiUp) {
  await page.goto(`${WEB}/`);
  await eventually(async () => (await page.getByTestId('board').getAttribute('data-state')) === 'ok', 10_000);
  header = { source: await page.getByTestId('run-source').getAttribute('data-source').catch(() => null), text: (await page.getByTestId('run-source').textContent().catch(() => null))?.trim() };
}
add('L5-K1', 'make level5: 8080 und 8081 antworten, config.json = api, Kopfzeile „Backend“',
  webUp && apiUp && same(cfg, { source: 'api' }) && header?.source === 'api' && header?.text === 'Backend',
  start.code !== 0 ? `Exit-Code ${start.code}` : [!webUp && '8080 antwortet nicht', !apiUp && '8081 antwortet nicht', !same(cfg, { source: 'api' }) && `config.json: ${JSON.stringify(cfg)}`,
    header && (header.source !== 'api' || header.text !== 'Backend') && `Kopfzeile: ${JSON.stringify(header)}`].filter(Boolean).join('; '));

if (webUp && apiUp) {
  // ---- L5-K2: Weiterleitung ----
  const p = [];
  const expect = (c, m) => c || p.push(m);
  const cases = [
    ['GET', '/api/health'], ['GET', '/api/levels'], ['GET', '/api/levels/3'], ['GET', '/api/levels/0'], ['GET', '/api/unbekannt'],
    ['GET', '/api/levels/1/history?limit=0'], ['DELETE', '/api/levels'], ['POST', '/api/levels/2/result', { body: rep(true, 1) }],
    ['POST', '/api/levels/1/result', { raw: '{kaputt' }],
  ];
  for (const [m, pth, opts] of cases) {
    const a = await call(WEB, m, pth, opts);
    const b = await call(API, m, pth, opts);
    const label = `${m} ${pth}`;
    expect(a.status === b.status, `${label}: über nginx ${a.status}, direkt ${b.status}`);
    expect(a.h('content-type') === 'application/json', `${label}: Content-Type über nginx „${a.h('content-type')}“`);
    expect(same(a.json, b.json) || pth === '/api/levels', `${label}: Body über nginx weicht ab`);
    expect(a.h('cache-control') === 'no-store', `${label}: Cache-Control „${a.h('cache-control')}“ statt no-store`);
    if (m === 'DELETE') expect((a.h('allow') ?? '').includes('GET'), `${label}: Allow fehlt über nginx`);
  }
  const post = await call(WEB, 'POST', '/api/levels/1/result', { body: rep(true, 77) });
  expect(post.status === 200 && post.json?.levels?.[0]?.durationMs === 77, `POST über nginx: ${post.status}`);
  expect((await call(WEB, 'GET', '/config.json')).h('cache-control') === 'no-store', '/config.json ohne Cache-Control: no-store');
  // Regeln aus Level 2 gelten mit nginx-api.conf weiterhin
  const html = (await call(WEB, 'GET', '/')).text;
  const js = html.match(/\/assets\/[^"']+\.js/)?.[0];
  expect((await call(WEB, 'GET', '/')).h('cache-control') === 'no-cache', '/: Cache-Control nicht no-cache');
  expect((await call(WEB, 'GET', '/results.json')).h('cache-control') === 'no-store', '/results.json: Cache-Control nicht no-store');
  if (js) expect((await call(WEB, 'GET', js)).h('cache-control') === 'public, max-age=31536000, immutable', 'Assets: Cache-Control falsch');
  expect((await call(WEB, 'GET', '/gibt-es-nicht.json')).status === 404, 'statische Datei fehlt: kein 404');
  expect((await call(WEB, 'GET', '/', { headers: { 'Accept-Encoding': 'gzip' } })).h('content-encoding') === 'gzip', '/: nicht gzip');
  expect((await call(WEB, 'GET', '/')).h('server') === 'nginx', 'Server-Header nicht „nginx“');
  add('L5-K2', 'Weiterleitung /api/ 1:1 (Status, JSON, Content-Type, no-store), Regeln aus Level 2 gelten', p.length === 0, p.slice(0, 5).join('; '));

  // ---- L5-K3: Live-Anzeige ohne Neuladen ----
  const lp = [];
  // Eigene Meldungen des Prüfers müssen angenommen werden, sonst wäre die Live-Prüfung wertlos
  const report = async (n, body) => {
    const r = await call(API, 'POST', `/api/levels/${n}/result`, { body });
    if (r.status !== 200) lp.push(`Meldung des Prüfers an Level ${n} abgelehnt: ${r.status} ${r.text.slice(0, 60)}`);
  };
  await report(1, rep(true, 850));
  await report(2, rep(false, 3040));
  const shows = async (n, status, dur) =>
    (await card(n).getAttribute('data-status')) === status && (dur === undefined || (await card(n).getByTestId('level-duration').textContent())?.trim() === dur);
  const t0 = Date.now();
  if (!(await eventually(async () => (await shows(1, 'bestanden', '850 ms')) && (await shows(2, 'fehlgeschlagen', '3,0 s')) && (await shows(3, 'gesperrt'))))) lp.push('Bestanden/Fehlgeschlagen/Gesperrt nicht innerhalb von 7 s sichtbar');
  nebenwerte.liveVerzoegerungMs = Date.now() - t0;
  if (!(await eventually(async () => (await page.getByTestId('summary-reached').textContent())?.trim() === '1 / 10'))) lp.push('Zusammenfassung nicht „1 / 10“');
  await report(2, rep(true, 12_449));
  if (!(await eventually(async () => (await shows(2, 'bestanden', '12,4 s')) && (await shows(3, 'offen'))))) lp.push('zweite Änderung nicht innerhalb von 7 s sichtbar');
  add('L5-K3', 'Live-Anzeige: gemeldete Ergebnisse erscheinen ohne Neuladen innerhalb von 7 s', lp.length === 0, lp.join('; ') || `erste Änderung nach ${nebenwerte.liveVerzoegerungMs} ms`);

  // ---- L5-K4: Ausfall und Rückkehr ----
  const op = [];
  const stop = run('make', ['stop-backend']);
  if (stop.code !== 0) op.push(`make stop-backend: Exit-Code ${stop.code}`);
  if (!(await gone(`${API}/api/health`, 10_000))) op.push('Backend läuft nach make stop-backend weiter');
  const shownOutage = await eventually(async () => (await page.getByTestId('notice').getAttribute('data-kind')) === 'unavailable' &&
    (await page.locator('[data-testid="level-card"][data-status="offen"]').count()) === 10);
  if (!shownOutage) op.push('Hinweis „unavailable“ samt Leerzustand nicht innerhalb von 7 s');
  else {
    const txt = (await page.getByTestId('notice').textContent())?.trim() ?? '';
    if (!txt.includes('Backend nicht erreichbar. Neuer Versuch alle 5 Sekunden.')) op.push(`Hinweistext „${txt}“`);
  }
  const restart = run('make', ['restart-backend']);
  if (restart.code !== 0) op.push(`make restart-backend: Exit-Code ${restart.code}`);
  const back = await eventually(async () => (await page.getByTestId('notice').count()) === 0 && (await shows(1, 'bestanden', '850 ms')), 10_000);
  if (!back) op.push('nach make restart-backend nicht innerhalb von 10 s wieder Daten ohne Hinweis');
  add('L5-K4', 'Backend-Ausfall: Hinweis und Leerzustand, nach Neustart wieder Daten', op.length === 0, op.join('; '));
  await page.screenshot({ path: path.join(out, 'level5-live.png'), fullPage: true }).catch(() => {});

  // ---- L5-K5: make check meldet an Datei und Backend ----
  const check = run('make', ['check']);
  fs.writeFileSync(path.join(out, 'make-check-l5.log'), check.out);
  nebenwerte.makeCheckMs = check.ms;
  const data = readJson(distFile);
  const apiData = (await call(API, 'GET', '/api/levels')).json;
  const lists = [LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS];
  const okIn = (d) => d && vResults(d) && lists.every((names, i) => d.levels[i].status === 'bestanden' && same(d.levels[i].checks.map((c) => c.name), names));
  const fileOk = okIn(data);
  const apiOk = okIn(apiData);
  add('L5-K5', 'make check: Exit 0, results.json und /api/levels melden Level 1–5 bestanden', check.code === 0 && fileOk && apiOk,
    [check.code !== 0 && `Exit-Code ${check.code}`, !fileOk && 'results.json unvollständig', !apiOk && `Backend: ${apiData?.levels?.slice(0, 5).map((l) => l.status).join('/')}`].filter(Boolean).join('; '));
  fs.writeFileSync(path.join(out, 'agent-results-l5.json'), JSON.stringify({ datei: data, backend: apiData }, null, 2));
  nebenwerte.selbstmessung = apiData?.levels?.[4]?.status ?? null;
  nebenwerte.konsolenfehler = consoleErrors;
}
await browser.close();

// ---- L5-K6: Startdateien, make down ----
const startOk = sha(publicResults) === hashResults && same(readJson(publicResults), startState()) &&
  sha(publicConfig) === hashConfig && same(readJson(publicConfig), { source: 'file' });
run('make', ['down']);
const webDown = await gone(`${WEB}/`, 10_000);
const apiDown = await gone(`${API}/api/health`, 10_000);
add('L5-K6', 'public/results.json und public/config.json unverändert, make down gibt die Ports frei', startOk && webDown && apiDown,
  [!startOk && 'Startdateien verändert oder config.json ≠ {"source":"file"}', !webDown && '8080 antwortet weiterhin', !apiDown && '8081 antwortet weiterhin'].filter(Boolean).join('; '));

const passed = criteria.length === 6 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
fs.writeFileSync(path.join(out, 'judge-level5.json'), JSON.stringify({ level: 5, passed, checkedAt: new Date().toISOString(), target, criteria, nebenwerte }, null, 2));
console.log(`\nLevel 5 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
