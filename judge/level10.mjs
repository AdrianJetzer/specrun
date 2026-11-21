// Unabhängiger Prüfer für Level 10 (Metriken veröffentlicht).
// Aufruf: node level10.mjs <ziel-ordner> [ausgabe-ordner]
// Braucht GH_TOKEN (Lese-Token), RUN_ID und LIVE_DOMAIN. Setzt voraus, dass Level 1–9 bestanden sind (judge/all.mjs).
// Ablauf: 1. Live-Stand festhalten, Kennzahlen mit eigener Messung vergleichen
//         2. Live-Seite im Browser: Bericht mit genau diesen Werten
//         3. make level10 + make check des Agenten (meldet selbst neu und prüft live nach)
//         4. Live-Stand wiederherstellen, falls er danach nicht Level 1–10 zeigt
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, LEVEL7_CHECKS, LEVEL8_CHECKS, LEVEL9_CHECKS, LEVEL10_CHECKS } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level10.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const RUN_ID = process.env.RUN_ID ?? '';
const LIVE_DOMAIN = process.env.LIVE_DOMAIN ?? '';
const REPO = `specrun-lab/levelboard-${RUN_ID}`;
const LIVE = `https://${RUN_ID}.${LIVE_DOMAIN}`;
const LISTS = [LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, LEVEL7_CHECKS, LEVEL8_CHECKS, LEVEL9_CHECKS, LEVEL10_CHECKS];
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
const ghJson = (endpoint) => {
  const r = run('gh', ['api', endpoint], { cwd: out });
  try { return r.code === 0 ? JSON.parse(r.out) : null; } catch { return null; }
};
const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Vergleich unabhängig von der Reihenfolge der Schlüssel (das Backend speichert metrics mit sortierten Schlüsseln)
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const equal = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const head = run('git', ['rev-parse', 'HEAD']).out.trim();
const getLive = async (p) => {
  try { return await (await fetch(`${LIVE}${p}`, { signal: AbortSignal.timeout(15_000) })).json(); } catch { return null; }
};
const allPassed = (data, n) => !!data?.levels && data.levels.slice(0, n).every((l) => l.status === 'bestanden');
async function restoreLive(snap) {
  if (!snap?.levels) return false;
  for (const l of snap.levels.filter((x) => ['bestanden', 'fehlgeschlagen'].includes(x.status))) {
    const res = await fetch(`${LIVE}/api/levels/${l.level}/result`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checks: l.checks, durationMs: l.durationMs ?? 0, metrics: l.metrics ?? {} }),
    }).catch(() => null);
    if (!res?.ok) return false;
    if (l.status !== 'bestanden') break;
  }
  return true;
}

// ---- Eigene Messung des Prüfers (unabhängig vom Code des Agenten) ----
const secs = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
function ownPipeline() {
  const r = ghJson(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&head_sha=${head}&per_page=1`)?.workflow_runs?.[0];
  if (!r) return null;
  const jobs = ghJson(`repos/${REPO}/actions/runs/${r.id}/jobs`)?.jobs ?? [];
  const d = {};
  for (const n of ['check', 'images', 'deploy']) {
    const j = jobs.find((x) => x.name === n);
    d[n] = j?.started_at && j?.completed_at ? secs(j.started_at, j.completed_at) : null;
  }
  const last = jobs.map((j) => j.completed_at).filter(Boolean).sort().at(-1);
  return { runId: r.id, url: r.html_url, jobs: d, totalS: last ? secs(r.run_started_at, last) : null };
}
async function ownImageMB(name) {
  const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';
  const tr = await fetch(`https://ghcr.io/token?scope=repository:${name}:pull`);
  if (!tr.ok) return null;
  const auth = { Authorization: `Bearer ${(await tr.json()).token}`, Accept: accept };
  let m = await (await fetch(`https://ghcr.io/v2/${name}/manifests/${head}`, { headers: auth })).json();
  if (m.manifests) {
    const e = m.manifests.find((x) => x.platform?.os === 'linux' && x.platform?.architecture === 'amd64');
    if (!e) return null;
    m = await (await fetch(`https://ghcr.io/v2/${name}/manifests/${e.digest}`, { headers: auth })).json();
  }
  return Math.round((((m.layers ?? []).reduce((s, l) => s + l.size, 0)) / 1024 / 1024) * 10) / 10;
}
const comma = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d).replace('.', ',') : String(n));
const thousands = (n) => (typeof n === 'number' ? n.toLocaleString('de-CH') : String(n));

// Eigene Nachrechnung der Tokens aus dem Session-Protokoll des Agenten (im Prüfer-Container unter /lauf/protokoll)
const PROTOKOLL = process.env.SPECRUN_PROTOKOLL ?? '/lauf/protokoll';
const PREIS = {
  'claude-opus-5-5': [4, 5, 8, 0.2, 20],
  'claude-sonnet-5-5': [2, 2.5, 4, 0.1, 10],
  'claude-haiku-5-5': [0.1, 0.125, 0.2, 0.01, 0.5],
};
function ownTokens(bis) {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.jsonl')) files.push(p); } };
  if (!fs.existsSync(PROTOKOLL)) return null;
  walk(PROTOKOLL);
  const seen = new Map();
  for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (d?.type !== 'assistant' || !d.message?.id || !d.message.usage || d.message.model === '<synthetic>' || seen.has(d.message.id)) continue;
    seen.set(d.message.id, { t: Date.parse(d.timestamp), model: d.message.model, u: d.message.usage });
  }
  const sum = (list) => {
    const r = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
    let cost = 0; const models = new Set();
    for (const { model, u } of list) {
      const w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      const w5 = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
      const v = [u.input_tokens ?? 0, w5, w1, u.cache_read_input_tokens ?? 0, u.output_tokens ?? 0];
      [r.input, r.cacheWrite5m, r.cacheWrite1h, r.cacheRead, r.output] = [r.input + v[0], r.cacheWrite5m + v[1], r.cacheWrite1h + v[2], r.cacheRead + v[3], r.output + v[4]];
      const pr = PREIS[model]; models.add(model);
      cost += pr ? v.reduce((acc, x, i) => acc + x * pr[i], 0) / 1e6 : NaN;
    }
    const ts = list.map((x) => x.t).sort((a, b) => a - b);
    return { models: [...models].sort(), responses: list.length, ...r, total: Object.values(r).reduce((a, b) => a + b, 0),
      costUsd: Math.round(cost * 100) / 100, sessionS: ts.length ? Math.round((ts.at(-1) - ts[0]) / 1000) : 0, until: ts.length ? new Date(ts.at(-1)).toISOString() : null };
  };
  const all = [...seen.values()];
  return { bis: sum(all.filter((x) => x.t <= Date.parse(bis))), gesamt: sum(all) };
}

console.log(`Prüfer Level 10 → ${target} (live ${LIVE})\n`);
let snapshot = null;

if (!RUN_ID || !process.env.GH_TOKEN || !LIVE_DOMAIN) {
  add('L10-K0', 'Prüfer-Umgebung: RUN_ID, GH_TOKEN und LIVE_DOMAIN gesetzt', false,
    [!RUN_ID && 'RUN_ID fehlt', !process.env.GH_TOKEN && 'GH_TOKEN fehlt', !LIVE_DOMAIN && 'LIVE_DOMAIN fehlt'].filter(Boolean).join('; '));
} else {
  // ---- L10-K1: gemeldete Kennzahlen gegen eigene Messung ----
  const kp = [];
  snapshot = await getLive('/api/levels');
  const m = snapshot?.levels?.[9]?.metrics ?? {};
  if (!snapshot?.levels) kp.push('Live-API nicht lesbar');
  else {
    const notPassed = snapshot.levels.filter((l) => l.status !== 'bestanden').map((l) => l.level);
    if (notPassed.length) kp.push(`live nicht bestanden: Level ${notPassed.join(', ')}`);
    if (!same(snapshot.levels[9].checks.map((c) => c.name), LEVEL10_CHECKS)) kp.push(`Checks von Level 10: ${JSON.stringify(snapshot.levels[9].checks.map((c) => c.name))}`);
    if (!same(Object.keys(m).sort(), ['images', 'loadtest', 'pipeline', 'tokens'])) kp.push(`metrics-Felder: ${Object.keys(m).join(', ')}`);
    const pipe = ownPipeline();
    nebenwerte.pipelinePruefer = pipe;
    if (!pipe) kp.push('kein Pipeline-Lauf für den aktuellen Commit');
    else if (!equal(m.pipeline, pipe)) kp.push(`pipeline gemeldet ${JSON.stringify(m.pipeline)}, gemessen ${JSON.stringify(pipe)}`);
    const img = { frontendMB: await ownImageMB(`${REPO}-frontend`), backendMB: await ownImageMB(`${REPO}-backend`) };
    nebenwerte.imagesPruefer = img;
    if (!equal(m.images, img)) kp.push(`images gemeldet ${JSON.stringify(m.images)}, gemessen ${JSON.stringify(img)}`);
    const l9 = snapshot.levels[8].metrics ?? {};
    const lt = { requests: l9.requests, errors: l9.errors, rps: l9.rps, p50Ms: l9.p50Ms, p95Ms: l9.p95Ms };
    if (!equal(m.loadtest, lt)) kp.push(`loadtest ${JSON.stringify(m.loadtest)} ≠ Level 9 ${JSON.stringify(lt)}`);
    const tok = m.tokens?.until ? ownTokens(m.tokens.until) : null;
    if (!tok) kp.push(m.tokens?.until ? `kein Session-Protokoll unter ${PROTOKOLL}` : 'tokens.until fehlt');
    else {
      if (!equal(m.tokens, tok.bis)) kp.push(`tokens gemeldet ${JSON.stringify(m.tokens)}, nachgerechnet ${JSON.stringify(tok.bis)}`);
      nebenwerte.tokensBisMessung = tok.bis;
      nebenwerte.tokensGesamt = tok.gesamt;
      nebenwerte.tokensNachMessung = tok.gesamt.total - tok.bis.total;
    }
  }
  add('L10-K1', 'Level 1–10 live bestanden; Kennzahlen stimmen mit eigener Messung (Pipeline, Images, Tokens) und Level 9 (Lasttest)', kp.length === 0, kp.join('; '));

  // ---- L10-K2: Live-Seite zeigt den Bericht mit genau diesen Werten ----
  const dp = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${LIVE}/`, { timeout: 30_000 });
    const ready = await page.waitForFunction(() => document.querySelector('[data-testid="report"]')?.getAttribute('data-state') === 'ready', null, { timeout: 15_000 }).then(() => true, () => false);
    if (!ready) dp.push('report nicht data-state="ready"');
    else {
      const text = async (id) => (await page.getByTestId(id).first().textContent())?.trim();
      const expected = {
        'summary-reached': '10 / 10', 'report-reached': '10 / 10', 'report-score': '100 / 100',
        'report-commit': String(snapshot?.run?.commit ?? '').slice(0, 7),
        'report-p50': `${m.loadtest?.p50Ms} ms`, 'report-p95': `${m.loadtest?.p95Ms} ms`,
        'report-rps': `${comma(m.loadtest?.rps)} Anfragen/s`, 'report-errors': String(m.loadtest?.errors),
        'report-image-frontend': `${comma(m.images?.frontendMB)} MB`, 'report-image-backend': `${comma(m.images?.backendMB)} MB`,
        'report-job-check': `${m.pipeline?.jobs?.check} s`, 'report-job-images': `${m.pipeline?.jobs?.images} s`,
        'report-job-deploy': `${m.pipeline?.jobs?.deploy} s`, 'report-pipeline-total': `${m.pipeline?.totalS} s`,
        'report-model': (m.tokens?.models ?? []).join(', '), 'report-tokens-input': thousands(m.tokens?.input),
        'report-tokens-cache-write': thousands((m.tokens?.cacheWrite5m ?? 0) + (m.tokens?.cacheWrite1h ?? 0)),
        'report-tokens-cache-read': thousands(m.tokens?.cacheRead), 'report-tokens-output': thousands(m.tokens?.output),
        'report-tokens-total': thousands(m.tokens?.total), 'report-cost': `${comma(m.tokens?.costUsd, 2)} USD`,
        'report-session': `${Math.round((m.tokens?.sessionS ?? 0) / 60)} min`,
      };
      for (const [id, want] of Object.entries(expected)) {
        const got = await text(id).catch(() => null);
        if (got !== want) dp.push(`${id}: „${got}“ statt „${want}“`);
      }
      if ((await page.getByTestId('report-pipeline-link').getAttribute('href').catch(() => null)) !== m.pipeline?.url) dp.push('report-pipeline-link falsch');
      if ((await page.locator('[data-testid="report-level"][data-status="bestanden"]').count()) !== 10) dp.push('nicht 10 bestandene Einträge in report-levels');
      await page.screenshot({ path: path.join(out, 'level10-live.png'), fullPage: true }).catch(() => {});
    }
  } catch (e) {
    dp.push(`Browser: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
  add('L10-K2', 'Live-Seite zeigt den Abschlussbericht mit genau den gemeldeten Werten', dp.length === 0, dp.join('; '));

  // ---- L10-K3: make level10 + make check (meldet neu und prüft live nach) ----
  run('make', ['down']);
  const env = { ...process.env, RUN_ID, LIVE_DOMAIN };
  const lv = run('make', ['level10'], { env });
  const check = lv.code === 0 ? run('make', ['check'], { env }) : { code: null, out: '', err: '' };
  fs.writeFileSync(path.join(out, 'make-check-l10.log'), lv.out + lv.err + check.out + check.err);
  const data = readJson(path.join(target, 'frontend/dist/results.json'));
  const all10 = data && LISTS.every((names, i) => data.levels[i].status === 'bestanden' && same(data.levels[i].checks.map((c) => c.name), names));
  const liveLines = [...(check.out + check.err).matchAll(/Level (\d+) an die Live-API gemeldet/g)].map((x) => Number(x[1]));
  const reportedAll = same(liveLines, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const nachpruefung = /1 passed/.test((check.out + check.err).split('live-report.spec.ts').at(-1) ?? '');
  const after = await getLive('/api/levels');
  add('L10-K3', 'make level10 und make check: Level 1–10 bestanden, an die Live-API gemeldet, Nachprüfung bestanden', lv.code === 0 && check.code === 0 && !!all10 && reportedAll && nachpruefung && allPassed(after, 10),
    [lv.code !== 0 && `make level10: Exit-Code ${lv.code}`, lv.code === 0 && check.code !== 0 && `make check: Exit-Code ${check.code}`,
      !all10 && `Status: ${data?.levels?.map((l) => l.status).join('/')}`, !reportedAll && `live gemeldet: ${liveLines.join(',') || 'nichts'}`,
      !nachpruefung && 'Nachprüfung (live-report.spec.ts) nicht bestanden', !allPassed(after, 10) && 'live danach nicht Level 1–10'].filter(Boolean).join('; '));
  nebenwerte.selbstmessung = data?.levels?.[9]?.status ?? null;
  run('make', ['down']);

  if (!allPassed(await getLive('/api/levels'), 10) && snapshot?.levels) {
    await restoreLive(snapshot);
    nebenwerte.liveWiederhergestellt = true;
    console.log('  Live-Stand aus der Selbstmessung wiederhergestellt');
  }
}

const passed = criteria.length >= 3 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
fs.writeFileSync(path.join(out, 'judge-level10.json'), JSON.stringify({ level: 10, passed, checkedAt: new Date().toISOString(), target, live: LIVE, criteria, nebenwerte }, null, 2));
console.log(`\nLevel 10 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
