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
import { phasenVerbrauch, hatBauzeit, ohneBauzeit, hatPreisstufen, setzePreisstufen } from './lib/phasen.mjs';
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
  const jobs = (ghJson(`repos/${REPO}/actions/runs/${r.id}/jobs`)?.jobs ?? []).filter((j) => j.started_at && j.completed_at);
  const last = jobs.map((j) => j.completed_at).sort().at(-1);
  return { runId: r.id, url: r.html_url, jobs: Object.fromEntries(jobs.map((j) => [j.name, secs(j.started_at, j.completed_at)])), totalS: last ? secs(r.run_started_at, last) : 0 };
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
const bauzeit = (s) => (typeof s !== 'number' ? '–' : s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`);

// Session-Protokoll des Agenten (im Prüfer-Container unter /lauf/protokoll)
const PROTOKOLL = process.env.SPECRUN_PROTOKOLL ?? '/lauf/protokoll';
// Bauzeit erst ab Spec 1.3.0 (ältere Läufe werden nach ihrer eigenen Spec bewertet)
const BAUZEIT = hatBauzeit(target);
// Haiku-Preisstufe über 100k Tokens erst ab Spec 1.4.0
setzePreisstufen(hatPreisstufen(target));

console.log(`Prüfer Level 10 → ${target} (live ${LIVE})\n`);
let snapshot = null;

if (!RUN_ID || !process.env.GH_TOKEN || !LIVE_DOMAIN) {
  add('L10-K0', 'Prüfer-Umgebung: RUN_ID, GH_TOKEN und LIVE_DOMAIN gesetzt', false,
    [!RUN_ID && 'RUN_ID fehlt', !process.env.GH_TOKEN && 'GH_TOKEN fehlt', !LIVE_DOMAIN && 'LIVE_DOMAIN fehlt'].filter(Boolean).join('; '));
} else {
  // ---- L10-K1: Kennzahlen aller Levels gegen eigene Messung ----
  const kp = [];
  snapshot = await getLive('/api/levels');
  const lv = snapshot?.levels ?? [];
  if (!snapshot?.levels) kp.push('Live-API nicht lesbar');
  else {
    const notPassed = lv.filter((l) => l.status !== 'bestanden').map((l) => l.level);
    if (notPassed.length) kp.push(`live nicht bestanden: Level ${notPassed.join(', ')}`);
    if (!same(lv[9].checks.map((c) => c.name), LEVEL10_CHECKS)) kp.push(`Checks von Level 10: ${JSON.stringify(lv[9].checks.map((c) => c.name))}`);
    const pipe = ownPipeline();
    nebenwerte.pipelinePruefer = pipe;
    if (!pipe) kp.push('kein Pipeline-Lauf für den aktuellen Commit');
    else if (!equal(lv[5].metrics?.pipeline, pipe)) kp.push(`Level 6 pipeline ${JSON.stringify(lv[5].metrics?.pipeline)}, gemessen ${JSON.stringify(pipe)}`);
    const img = { frontendMB: await ownImageMB(`${REPO}-frontend`), backendMB: await ownImageMB(`${REPO}-backend`) };
    nebenwerte.imagesPruefer = img;
    if (!equal(lv[6].metrics?.images, img)) kp.push(`Level 7 images ${JSON.stringify(lv[6].metrics?.images)}, gemessen ${JSON.stringify(img)}`);
    const lt = lv[8].metrics?.loadtest ?? {};
    if (!['requests', 'errors', 'rps', 'p50Ms', 'p95Ms', 'maxMs'].every((k) => typeof lt[k] === 'number') || lt.errors !== 0 || !(lt.p95Ms < 1000)) kp.push(`Level 9 loadtest unvollständig oder unplausibel: ${JSON.stringify(lt)}`);
    const ownRoh = phasenVerbrauch(PROTOKOLL, lv.map((l) => ({ level: l.level, status: l.status })));
    const own = BAUZEIT ? ownRoh : ohneBauzeit(ownRoh);
    if (!own) kp.push(`kein Session-Protokoll unter ${PROTOKOLL}`);
    else {
      const wrong = lv.filter((l) => !equal(l.metrics?.tokens, own[l.level])).map((l) => l.level);
      if (wrong.length) kp.push(`tokens weichen ab bei Level ${wrong.join(', ')} (z. B. Level ${wrong[0]}: gemeldet ${JSON.stringify(lv[wrong[0] - 1].metrics?.tokens)}, nachgerechnet ${JSON.stringify(own[wrong[0]])})`);
      nebenwerte.tokensPruefer = own;
    }
  }
  add('L10-K1', 'Level 1–10 live bestanden; Pipeline (L6), Images (L7) und Tokens aller Levels stimmen mit eigener Messung, Lasttest (L9) vollständig', kp.length === 0, kp.join('; '));

  // ---- L10-K2: Live-Seite zeigt Bericht und Karten mit genau diesen Werten ----
  const dp = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${LIVE}/`, { timeout: 30_000 });
    const ready = await page.waitForFunction(() => document.querySelector('[data-testid="report"]')?.getAttribute('data-complete') === 'true', null, { timeout: 15_000 }).then(() => true, () => false);
    if (!ready) dp.push('report nicht data-complete="true"');
    else {
      const text = async (id, scope = page) => (await scope.getByTestId(id).first().textContent())?.trim();
      const phases = lv.map((l) => l.metrics?.tokens).filter((t) => t && t.inLevel === undefined);
      const sum = (k) => phases.reduce((acc, t) => acc + (t[k] ?? 0), 0);
      const [pl, im, lt] = [lv[5].metrics?.pipeline, lv[6].metrics?.images, lv[8].metrics?.loadtest];
      const expected = {
        'summary-reached': '10 / 10', 'report-reached': '10 / 10', 'report-score': '100 / 100', 'report-complete': 'ja',
        'report-commit': String(snapshot?.run?.commit ?? '').slice(0, 7),
        'report-model': [...new Set(phases.flatMap((t) => t.models))].sort().join(', '),
        'report-responses': thousands(sum('responses')), 'report-tokens-input': thousands(sum('input')),
        'report-tokens-cache-write': thousands(sum('cacheWrite5m') + sum('cacheWrite1h')), 'report-tokens-cache-read': thousands(sum('cacheRead')),
        'report-tokens-output': thousands(sum('output')), 'report-tokens-total': thousands(sum('total')),
        'report-cost': `${comma(Math.round(sum('costUsd') * 100) / 100, 2)} USD`, ...(BAUZEIT ? { 'report-build-time': bauzeit(sum('buildS')) } : {}),
        'report-p50': `${lt?.p50Ms} ms`, 'report-p95': `${lt?.p95Ms} ms`, 'report-rps': `${comma(lt?.rps)} Anfragen/s`, 'report-errors': String(lt?.errors),
        'report-image-frontend': `${comma(im?.frontendMB)} MB`, 'report-image-backend': `${comma(im?.backendMB)} MB`,
        'report-job-check': `${pl?.jobs?.check} s`, 'report-job-images': `${pl?.jobs?.images} s`, 'report-job-deploy': `${pl?.jobs?.deploy} s`,
        'report-pipeline-total': `${pl?.totalS} s`,
      };
      for (const [id, want] of Object.entries(expected)) {
        const got = await text(id).catch(() => null);
        if (got !== want) dp.push(`${id}: „${got}“ statt „${want}“`);
      }
      if ((await page.getByTestId('report-pipeline-link').getAttribute('href').catch(() => null)) !== pl?.url) dp.push('report-pipeline-link falsch');
      if ((await page.locator('[data-testid="report-level"][data-status="bestanden"]').count()) !== 10) dp.push('nicht 10 bestandene Einträge in report-levels');
      for (const l of lv) {
        const card = page.locator(`[data-testid="level-card"][data-level="${l.level}"]`);
        const t = l.metrics?.tokens;
        const wantCost = !t ? '–' : t.inLevel !== undefined ? `in L${String(t.inLevel).padStart(2, '0')}` : `${comma(t.costUsd, 2)} USD`;
        const wantOut = t && t.inLevel === undefined ? thousands(t.output) : '–';
        const wantBuild = !t ? '–' : t.inLevel !== undefined ? `in L${String(t.inLevel).padStart(2, '0')}` : bauzeit(t.buildS);
        const [c, o, b] = [await text('level-cost', card).catch(() => null), await text('level-output', card).catch(() => null), BAUZEIT ? await text('level-build-time', card).catch(() => null) : wantBuild];
        if (c !== wantCost || o !== wantOut || b !== wantBuild) dp.push(`Karte ${l.level}: „${c}“/„${o}“/„${b}“ statt „${wantCost}“/„${wantOut}“/„${wantBuild}“`);
      }
      await page.screenshot({ path: path.join(out, 'level10-live.png'), fullPage: true }).catch(() => {});
    }
  } catch (e) {
    dp.push(`Browser: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
  add('L10-K2', 'Live-Seite zeigt den vollständigen Abschlussbericht sowie Kosten und Bauzeit je Karte mit genau den gemeldeten Werten', dp.length === 0, dp.join('; '));

  // ---- L10-K3: make level10 + make check (meldet neu und prüft live nach) ----
  run('make', ['down']);
  const env = { ...process.env, RUN_ID, LIVE_DOMAIN };
  const mk = run('make', ['level10'], { env });
  const check = mk.code === 0 ? run('make', ['check'], { env }) : { code: null, out: '', err: '' };
  fs.writeFileSync(path.join(out, 'make-check-l10.log'), mk.out + mk.err + check.out + check.err);
  const data = readJson(path.join(target, 'frontend/dist/results.json'));
  const all10 = data && LISTS.every((names, i) => data.levels[i].status === 'bestanden' && same(data.levels[i].checks.map((c) => c.name), names));
  const liveLines = [...(check.out + check.err).matchAll(/Level (\d+) an die Live-API gemeldet/g)].map((x) => Number(x[1]));
  const reportedAll = same(liveLines, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const nachpruefung = /1 passed/.test((check.out + check.err).split('live-report.spec.ts').at(-1) ?? '');
  const after = await getLive('/api/levels');
  add('L10-K3', 'make level10 und make check: Level 1–10 bestanden, an die Live-API gemeldet, Nachprüfung bestanden', mk.code === 0 && check.code === 0 && !!all10 && reportedAll && nachpruefung && allPassed(after, 10),
    [mk.code !== 0 && `make level10: Exit-Code ${mk.code}`, mk.code === 0 && check.code !== 0 && `make check: Exit-Code ${check.code}`,
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
