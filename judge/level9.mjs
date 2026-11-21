// Unabhängiger Prüfer für Level 9 (Live-Prüfung).
// Aufruf: node level9.mjs <ziel-ordner> [ausgabe-ordner]
// Braucht GH_TOKEN (Lese-Token), RUN_ID und LIVE_DOMAIN. Setzt voraus, dass Level 1–8 bestanden sind (judge/all.mjs).
// Ablauf: 1. Live-Stand des Agenten festhalten und bewerten (Selbstmessung)
//         2. selbst live prüfen, mit eigenem Lasttest (Fremdmessung)
//         3. make level9 + make check des Agenten
//         4. Live-Stand wiederherstellen, falls er danach nicht mehr Level 1–9 zeigt
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, LEVEL7_CHECKS, LEVEL8_CHECKS, LEVEL9_CHECKS, LOADTEST_FIELDS } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level9.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const RUN_ID = process.env.RUN_ID ?? '';
const LIVE_DOMAIN = process.env.LIVE_DOMAIN ?? '';
const LIVE = `https://${RUN_ID}.${LIVE_DOMAIN}`;
const LISTS = [LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, LEVEL7_CHECKS, LEVEL8_CHECKS, LEVEL9_CHECKS];
const criteria = [];
const nebenwerte = {};
const add = (id, name, ok, detail = '') => {
  criteria.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` – ${detail}` : ''}`);
};
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: target, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
};
const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const head = run('git', ['rev-parse', 'HEAD']).out.trim();
async function call(method, p, { body, type, headers = {} } = {}) {
  try {
    const res = await fetch(`${LIVE}${p}`, {
      method, redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { ...(type ? { 'Content-Type': type } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, text, json };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: String(e.cause?.code ?? e.message), json: null };
  }
}
const liveLevels = async () => (await call('GET', '/api/levels')).json;
const allPassed = (data, n) => !!data && data.levels.slice(0, n).every((l) => l.status === 'bestanden');
/** Stellt den festgehaltenen Live-Stand wieder her (Meldungen aufsteigend, Ende beim ersten nicht bestandenen Level). */
async function restoreLive(snap) {
  if (!snap?.levels) return false;
  for (const l of snap.levels.filter((x) => ['bestanden', 'fehlgeschlagen'].includes(x.status))) {
    const r = await call('POST', `/api/levels/${l.level}/result`, { type: 'application/json', body: { checks: l.checks, durationMs: l.durationMs ?? 0, metrics: l.metrics ?? {} } });
    if (r.status !== 200) return false;
    if (l.status !== 'bestanden') break;
  }
  return true;
}

/** Eigener Lasttest des Prüfers (unabhängig vom Code des Agenten): gleiche Last, gleiche Auswertung laut Spec. */
async function judgeLoad(base, conns = 10, ms = 30_000) {
  const durations = [];
  let errors = 0;
  const t0 = performance.now();
  const end = t0 + ms;
  await Promise.all(Array.from({ length: conns }, async () => {
    let k = 0;
    while (performance.now() < end) {
      const p = k++ % 2 === 0 ? '/' : '/api/levels';
      const s = performance.now();
      try {
        const r = await fetch(base + p, { signal: AbortSignal.timeout(10_000) });
        await r.arrayBuffer();
        if (r.status !== 200) errors++;
      } catch { errors++; }
      durations.push(performance.now() - s);
    }
  }));
  const secs = (performance.now() - t0) / 1000;
  durations.sort((a, b) => a - b);
  const rank = (q) => durations[Math.max(0, Math.ceil((q / 100) * durations.length) - 1)] ?? 0;
  return { connections: conns, durationS: ms / 1000, requests: durations.length, errors, rps: Math.round((durations.length / secs) * 10) / 10, p50Ms: Math.round(rank(50)), p95Ms: Math.round(rank(95)), maxMs: Math.round(durations.at(-1) ?? 0) };
}

console.log(`Prüfer Level 9 → ${target} (live ${LIVE})\n`);
let snapshot = null;

if (!RUN_ID || !process.env.GH_TOKEN || !LIVE_DOMAIN) {
  add('L9-K0', 'Prüfer-Umgebung: RUN_ID, GH_TOKEN und LIVE_DOMAIN gesetzt', false,
    [!RUN_ID && 'RUN_ID fehlt', !process.env.GH_TOKEN && 'GH_TOKEN fehlt', !LIVE_DOMAIN && 'LIVE_DOMAIN fehlt'].filter(Boolean).join('; '));
} else {
  // ---- L9-K1: Selbstmessung des Agenten auf der Live-API ----
  const sp = [];
  snapshot = await liveLevels();
  if (!snapshot?.levels) sp.push('Live-API nicht lesbar');
  else {
    const notPassed = snapshot.levels.slice(0, 9).filter((l) => l.status !== 'bestanden').map((l) => l.level);
    if (notPassed.length) sp.push(`live nicht bestanden: Level ${notPassed.join(', ')}`);
    if (snapshot.run.commit !== head) sp.push(`run.commit „${snapshot.run.commit}“, erwartet ${head}`);
    const l9 = snapshot.levels[8];
    if (!same(l9.checks.map((c) => c.name), LEVEL9_CHECKS)) sp.push(`Checks von Level 9: ${JSON.stringify(l9.checks.map((c) => c.name))}`);
    const m = l9.metrics?.loadtest ?? l9.metrics ?? {}; // ab Spec 1.2.0 unter metrics.loadtest
    const missing = LOADTEST_FIELDS.filter((f) => typeof m[f] !== 'number');
    if (missing.length) sp.push(`metrics von Level 9 ohne ${missing.join(', ')}`);
    else {
      if (m.connections !== 10 || m.durationS !== 30) sp.push(`Last ${m.connections} Verbindungen / ${m.durationS} s statt 10 / 30`);
      if (m.errors !== 0) sp.push(`Lasttest mit ${m.errors} Fehlern`);
      if (!(m.p95Ms < 1000)) sp.push(`p95 ${m.p95Ms} ms`);
      if (!(m.requests > 0) || !(m.p50Ms <= m.p95Ms && m.p95Ms <= m.maxMs)) sp.push('Werte des Lasttests unplausibel');
    }
    nebenwerte.lastAgent = m;
    const hist = (await call('GET', '/api/levels/9/history?limit=1')).json;
    if (!hist?.entries?.length) sp.push('keine Meldung von Level 9 in der Historie');
  }
  add('L9-K1', 'Selbstmessung live: Level 1–9 bestanden, Level 9 mit den 5 Checks und plausiblen Lastwerten', sp.length === 0, sp.join('; '));

  // ---- L9-K2: Fremdmessung live ----
  const fp = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${LIVE}/`, { timeout: 30_000 });
    const ok = await page.waitForFunction(() => document.querySelector('[data-testid="board"]')?.getAttribute('data-state') === 'ok', null, { timeout: 15_000 }).then(() => true, () => false);
    if (!ok) fp.push('Seite erreicht nicht data-state="ok"');
    if ((await page.getByTestId('level-card').count()) !== 10) fp.push('nicht 10 Karten');
    const commit = (await page.getByTestId('run-commit').textContent().catch(() => null))?.trim();
    if (commit !== head.slice(0, 7)) fp.push(`run-commit „${commit}“`);

    const root = await call('GET', '/', { headers: { 'Accept-Encoding': 'gzip' } });
    if (root.headers.get('cache-control') !== 'no-cache') fp.push(`/: cache-control ${root.headers.get('cache-control')}`);
    const js = /\/assets\/[^"]+\.js/.exec(root.text)?.[0];
    const asset = js ? await call('GET', js) : null;
    if (asset?.headers.get('cache-control') !== 'public, max-age=31536000, immutable') fp.push('Assets nicht unveränderlich gecacht');
    if ((await call('GET', '/config.json')).headers.get('cache-control') !== 'no-store') fp.push('/config.json nicht no-store');
    const checksApi = [
      [await call('GET', '/api/levels/11'), 404],
      [await call('PUT', '/api/levels/1'), 405],
      [await call('POST', '/api/levels/1/result', { type: 'application/json', body: { checks: [{ name: 'x', ok: 'ja' }], durationMs: 1 } }), 400],
      [await call('POST', '/api/levels/1/result', { type: 'text/plain', body: '{}' }), 415],
    ];
    checksApi.forEach(([r, want], i) => { if (r.status !== want || typeof r.json?.error !== 'string') fp.push(`API-Fehlerfall ${i + 1}: ${r.status} statt ${want}`); });

    // Probe-Meldung erscheint ohne Neuladen (Level 1; leert live die höheren Levels – Schritt 3/4 stellt wieder her)
    const probe = await call('POST', '/api/levels/1/result', { type: 'application/json', body: { checks: [{ name: 'Prüfer-Probe', ok: true }], durationMs: 3737 } });
    if (probe.status !== 200) fp.push(`Probe-Meldung: ${probe.status}`);
    const card = page.locator('[data-testid="level-card"][data-level="1"]');
    const seen = await card.getByTestId('level-duration').filter({ hasText: '3,7 s' }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
    if (!seen) fp.push('Probe-Meldung erscheint nicht ohne Neuladen');
  } catch (e) {
    fp.push(`Browser: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
  console.log('  eigener Lasttest läuft (30 s) …');
  const load = await judgeLoad(LIVE);
  nebenwerte.lastPruefer = load;
  if (load.errors !== 0) fp.push(`Lasttest: ${load.errors} Fehler`);
  if (!(load.p95Ms < 1000)) fp.push(`Lasttest: p95 ${load.p95Ms} ms`);
  const a = nebenwerte.lastAgent;
  if (a && typeof a.p95Ms === 'number') {
    const pct = (x, y) => (y ? Math.round(((x - y) / y) * 100) : null);
    nebenwerte.lastAbweichungProzent = { p50Ms: pct(a.p50Ms, load.p50Ms), p95Ms: pct(a.p95Ms, load.p95Ms), rps: pct(a.rps, load.rps) };
  }
  // Die Probe-Meldung hat live die höheren Levels geleert: Stand des Agenten sofort wiederherstellen,
  // damit make check (Level 8 prüft live Level 1–5) danach denselben Ausgangszustand vorfindet wie beim Agenten.
  if (!(await restoreLive(snapshot))) fp.push('Live-Stand nach der Probe nicht wiederherstellbar');
  add('L9-K2', 'Fremdmessung live: Seite, Cache-Regeln, API-Fehler, Meldung ohne Neuladen, eigener Lasttest ohne Fehler und p95 < 1 s', fp.length === 0,
    fp.join('; ') || `p50 ${load.p50Ms} ms, p95 ${load.p95Ms} ms, ${load.rps} Anfragen/s`);

  // ---- L9-K3: make level9 + make check (meldet selbst wieder an die Live-API) ----
  run('make', ['down']);
  const env = { ...process.env, RUN_ID, LIVE_DOMAIN };
  const lv = run('make', ['level9'], { env });
  const check = lv.code === 0 ? run('make', ['check'], { env }) : { code: null, out: '', err: '' };
  fs.writeFileSync(path.join(out, 'make-check-l9.log'), lv.out + lv.err + check.out + check.err);
  const data = readJson(path.join(target, 'frontend/dist/results.json'));
  const all9 = data && LISTS.every((names, i) => data.levels[i].status === 'bestanden' && same(data.levels[i].checks.map((c) => c.name), names));
  const liveLines = [...(check.out + check.err).matchAll(/Level (\d+) an die Live-API gemeldet/g)].map((m) => Number(m[1]));
  const reportedAll = same(liveLines, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const afterCheck = await liveLevels();
  add('L9-K3', 'make level9 und make check: Level 1–9 bestanden und an die Live-API gemeldet', lv.code === 0 && check.code === 0 && !!all9 && reportedAll && allPassed(afterCheck, 9),
    [lv.code !== 0 && `make level9: Exit-Code ${lv.code}`, lv.code === 0 && check.code !== 0 && `make check: Exit-Code ${check.code}`,
      !all9 && `Status: ${data?.levels?.slice(0, 9).map((l) => l.status).join('/')}`, !reportedAll && `live gemeldet: ${liveLines.join(',') || 'nichts'}`,
      !allPassed(afterCheck, 9) && 'live danach nicht Level 1–9'].filter(Boolean).join('; '));
  nebenwerte.selbstmessung = data?.levels?.[8]?.status ?? null;
  run('make', ['down']);

  // ---- Live-Stand wiederherstellen, falls nötig (Meldungen aus dem festgehaltenen Stand, aufsteigend) ----
  // Auch nötig, wenn der festgehaltene Stand schon weiter war (z. B. Level 10): make check bis Level 9 leert es live.
  const reached = (d) => { let n = 0; for (const l of d?.levels ?? []) { if (l.status !== 'bestanden') break; n = l.level; } return n; };
  const now = await liveLevels();
  if ((!allPassed(now, 9) || reached(snapshot) > reached(now)) && snapshot?.levels) {
    await restoreLive(snapshot);
    nebenwerte.liveWiederhergestellt = true;
    console.log('  Live-Stand aus der Selbstmessung wiederhergestellt');
  }
}

const passed = criteria.length >= 3 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
fs.writeFileSync(path.join(out, 'judge-level9.json'), JSON.stringify({ level: 9, passed, checkedAt: new Date().toISOString(), target, live: LIVE, criteria, nebenwerte }, null, 2));
console.log(`\nLevel 9 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.lastAbweichungProzent) console.log(`  Abweichung Agent ggü. Prüfer (in %): ${JSON.stringify(nebenwerte.lastAbweichungProzent)}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
