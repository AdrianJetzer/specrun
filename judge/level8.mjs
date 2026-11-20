// Unabhängiger Prüfer für Level 8 (Deployment).
// Aufruf: node level8.mjs <ziel-ordner> [ausgabe-ordner]
// Braucht GH_TOKEN (Lese-Token), RUN_ID und LIVE_DOMAIN. Setzt voraus, dass Level 1–7 bestanden sind (judge/all.mjs).
// Die Live-Seite wird von außen geprüft (HTTPS, Seite im Browser, API); auf den Server selbst greift der Prüfer nicht zu.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { chromium } from '@playwright/test';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, LEVEL7_CHECKS, LEVEL8_CHECKS, SECRET_PATTERNS } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level8.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const RUN_ID = process.env.RUN_ID ?? '';
const LIVE_DOMAIN = process.env.LIVE_DOMAIN ?? '';
const REPO = `specrun-lab/levelboard-${RUN_ID}`;
const LIVE = `https://${RUN_ID}.${LIVE_DOMAIN}`;
const criteria = [];
const nebenwerte = {};
const add = (id, name, ok, detail = '') => {
  criteria.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` – ${detail}` : ''}`);
};
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: target, encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
};
const ghJson = (endpoint) => {
  const r = run('gh', ['api', endpoint], { cwd: out });
  try { return r.code === 0 ? JSON.parse(r.out) : null; } catch { return null; }
};
const read = (rel) => {
  try { return fs.readFileSync(path.join(target, rel), 'utf8'); } catch { return null; }
};
const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const findSecret = (text) => SECRET_PATTERNS.find((re) => re.test(text));
/** Anfrage an die Live-Seite; Status 0 bei Netz- oder Zertifikatsfehler (Node prüft das Zertifikat). */
async function call(method, p) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${LIVE}${p}`, { method, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, type: res.headers.get('content-type'), text, json, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, type: null, text: String(e.cause?.code ?? e.cause?.message ?? e.message), json: null, ms: Date.now() - t0 };
  }
}

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const vResults = ajv.compile(JSON.parse(fs.readFileSync(path.join(here, '../spec/results.schema.json'), 'utf8')));
const vHealth = ajv.compile({ type: 'object', additionalProperties: false, required: ['status', 'version', 'commit'], properties: { status: { const: 'ok' }, version: { type: 'string', minLength: 1 }, commit: { type: ['string', 'null'] } } });
const vError = ajv.compile({ type: 'object', additionalProperties: false, required: ['error'], properties: { error: { type: 'string', minLength: 1 } } });
const head = run('git', ['rev-parse', 'HEAD']).out.trim();

console.log(`Prüfer Level 8 → ${target} (Repo ${REPO}, live ${LIVE})\n`);

if (!RUN_ID || !process.env.GH_TOKEN || !LIVE_DOMAIN) {
  add('L8-K0', 'Prüfer-Umgebung: RUN_ID, GH_TOKEN und LIVE_DOMAIN gesetzt', false,
    [!RUN_ID && 'RUN_ID fehlt', !process.env.GH_TOKEN && 'GH_TOKEN fehlt', !LIVE_DOMAIN && 'LIVE_DOMAIN fehlt'].filter(Boolean).join('; '));
} else {
  // ---- L8-K1: Dateien (Server-Compose, Job deploy, Commit im Backend) ----
  const fp = [];
  let compose = null;
  try { compose = YAML.parse(read('deploy/compose.yml') ?? ''); } catch {}
  const svc = compose?.services ?? {};
  if (!compose) fp.push('deploy/compose.yml fehlt oder ist kein YAML');
  else {
    if (!String(compose.name ?? '').includes('${RUN_ID')) fp.push('Compose: name nicht ${RUN_ID…}');
    if (!svc.backend || !svc.frontend) fp.push('Compose: Dienste backend/frontend fehlen');
    else {
      for (const [n, s] of Object.entries({ backend: svc.backend, frontend: svc.frontend })) {
        const img = String(s.image ?? '');
        if (!img.includes('${IMAGE_PREFIX') || !img.includes('${IMAGE_TAG') || !img.includes(`-${n}:`)) fp.push(`Compose: ${n}.image „${img}“`);
        if (s.build) fp.push(`Compose: ${n} mit build`);
        if (s.ports) fp.push(`Compose: ${n} veröffentlicht Ports`);
        if (s.restart !== 'unless-stopped') fp.push(`Compose: ${n} ohne restart: unless-stopped`);
      }
      if (!(svc.backend.volumes ?? []).some((v) => String(v).endsWith(':/data'))) fp.push('Compose: Volume für /data fehlt');
      if (!JSON.stringify(svc.backend.healthcheck?.test ?? '').includes('/api/health')) fp.push('Compose: Healthcheck des Backends fehlt');
      const beNets = Array.isArray(svc.backend.networks) ? svc.backend.networks : Object.keys(svc.backend.networks ?? {});
      if (beNets.includes('web')) fp.push('Compose: Backend hängt im Netz web');
      const feNets = svc.frontend.networks ?? {};
      const aliases = Array.isArray(feNets) ? [] : feNets.web?.aliases ?? [];
      if (!aliases.map(String).includes('${RUN_ID}-web')) fp.push('Compose: Frontend ohne Alias ${RUN_ID}-web im Netz web');
      if (svc.frontend.depends_on?.backend?.condition !== 'service_healthy') fp.push('Compose: Frontend wartet nicht auf gesundes Backend');
    }
    if (compose.networks?.web?.external !== true) fp.push('Compose: Netz web nicht external');
  }
  let wf = null;
  const wfText = read('.github/workflows/ci.yml') ?? '';
  try { wf = YAML.parse(wfText); } catch {}
  const deploy = wf?.jobs?.deploy;
  if (!deploy) fp.push('ci.yml: Job deploy fehlt');
  else {
    const needs = [deploy.needs].flat().filter(Boolean);
    if (!needs.includes('images')) fp.push('Job deploy: needs ohne images');
    if (!String(deploy.if ?? '').includes("refs/heads/main")) fp.push('Job deploy: nicht auf main beschränkt');
    if (deploy.container) fp.push('Job deploy: mit container');
    const text = YAML.stringify(deploy);
    for (const s of ['DEPLOY_HOST', 'DEPLOY_USER', 'DEPLOY_SSH_KEY', 'DEPLOY_KNOWN_HOSTS']) if (!text.includes(`secrets.${s}`)) fp.push(`Job deploy: secrets.${s} nicht benutzt`);
    if (!text.includes('vars.LIVE_DOMAIN')) fp.push('Job deploy: vars.LIVE_DOMAIN nicht benutzt');
    if (/StrictHostKeyChecking[ =]+(no|accept-new|off)/i.test(text) || /ssh-keyscan/.test(text)) fp.push('Job deploy: Host-Schlüssel wird nicht geprüft');
    if (!text.includes('report-live.mjs')) fp.push('Job deploy: report-live.mjs nicht aufgerufen');
    if (!/download-artifact@/.test(text)) fp.push('Job deploy: Artefakt levelboard-report nicht geladen');
  }
  if (!fs.existsSync(path.join(target, 'checks/report-live.mjs'))) fp.push('checks/report-live.mjs fehlt');
  if (!/LEVELBOARD_COMMIT=\$\{?REVISION\}?/.test(read('backend/Dockerfile') ?? '')) fp.push('backend/Dockerfile: LEVELBOARD_COMMIT=${REVISION} fehlt');
  // Kein privater Schlüssel im Repo oder in der Historie
  if (findSecret(run('git', ['log', '-p', '--all', '--no-color']).out)) fp.push('Schlüssel- oder Token-Muster in der Git-Historie');
  add('L8-K1', 'deploy/compose.yml, Job deploy und Commit im Backend erfüllen die Eckpunkte; kein Schlüssel im Repo', fp.length === 0, fp.join('; '));

  // ---- L8-K2: Job deploy grün, Logs ohne Geheimnisse ----
  const jp = [];
  const ciRun = ghJson(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&head_sha=${head}&per_page=1`)?.workflow_runs?.[0];
  if (!ciRun) jp.push('kein Lauf für den aktuellen Commit');
  else {
    const jobs = ghJson(`repos/${REPO}/actions/runs/${ciRun.id}/jobs`)?.jobs ?? [];
    const job = jobs.find((j) => j.name === 'deploy');
    if (job?.conclusion !== 'success') jp.push(`Job deploy: ${job?.conclusion ?? 'fehlt'}`);
    if (job?.started_at && job?.completed_at) nebenwerte.deployJobS = Math.round((Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000);
    const logs = run('gh', ['run', 'view', String(ciRun.id), '--repo', REPO, '--log'], { cwd: out });
    if (logs.code !== 0) jp.push('Logs des Laufs nicht lesbar');
    else if (findSecret(logs.out)) jp.push('Schlüssel- oder Token-Muster in den Logs der Pipeline');
  }
  add('L8-K2', 'Job deploy des letzten Laufs grün; keine Geheimnisse in den Logs', jp.length === 0, jp.join('; '));

  // ---- L8-K3: Live von außen ----
  const lp = [];
  const root = await call('GET', '/');
  nebenwerte.liveAntwortMs = root.ms;
  if (root.status !== 200) lp.push(`GET / → ${root.status || root.text}`);
  else {
    const health = await call('GET', '/api/health');
    if (health.status !== 200 || health.type !== 'application/json' || !vHealth(health.json)) lp.push(`/api/health: ${health.status} ${health.type} ${health.text.slice(0, 80)}`);
    else if (health.json.commit !== head) lp.push(`/api/health meldet Commit ${health.json.commit}, erwartet ${head}`);
    const levels = await call('GET', '/api/levels');
    if (levels.status !== 200 || !vResults(levels.json)) lp.push(`/api/levels: ${levels.status} ${ajv.errorsText(vResults.errors)}`);
    else {
      if (levels.json.run.id !== RUN_ID) lp.push(`run.id „${levels.json.run.id}“`);
      if (levels.json.run.commit !== head) lp.push(`run.commit „${levels.json.run.commit}“`);
      const notPassed = levels.json.levels.slice(0, 5).filter((l) => l.status !== 'bestanden').map((l) => l.level);
      if (notPassed.length) lp.push(`live nicht bestanden: Level ${notPassed.join(', ')}`);
    }
    for (const p of ['/api/unbekannt', '/api/levels/0']) {
      const r = await call('GET', p);
      if (r.status !== 404 || !vError(r.json)) lp.push(`${p} → ${r.status} ${r.text.slice(0, 60)}`);
    }
    const cfg = await call('GET', '/config.json');
    if (!same(cfg.json, { source: 'api' })) lp.push(`/config.json: ${cfg.text.slice(0, 60)}`);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${LIVE}/`, { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelector('[data-testid="board"]')?.getAttribute('data-state') === 'ok', null, { timeout: 15_000 }).catch(() => lp.push('Seite erreicht nicht data-state="ok"'));
      const source = await page.getByTestId('run-source').getAttribute('data-source').catch(() => null);
      if (source !== 'api') lp.push(`run-source: ${source}`);
      const commit = (await page.getByTestId('run-commit').textContent({ timeout: 5_000 }).catch(() => null))?.trim();
      if (commit !== head.slice(0, 7)) lp.push(`run-commit zeigt „${commit}“, erwartet ${head.slice(0, 7)}`);
      await page.screenshot({ path: path.join(out, 'level8-live.png'), fullPage: true }).catch(() => {});
    } catch (e) {
      lp.push(`Browser: ${e.message.split('\n')[0]}`);
    } finally {
      await browser.close();
    }
  }
  add('L8-K3', 'Live von außen: gültiges HTTPS, Seite aus dem Backend mit aktuellem Commit, API laut Spec, Level 1–5 bestanden', lp.length === 0, lp.join('; ') || `${LIVE} (${root.ms} ms)`);

  // ---- L8-K4: make level8 + make check ----
  run('make', ['down']);
  const env = { ...process.env, RUN_ID, LIVE_DOMAIN };
  const lv = run('make', ['level8'], { env });
  const check = lv.code === 0 ? run('make', ['check'], { env }) : { code: null, out: '', err: '' };
  fs.writeFileSync(path.join(out, 'make-check-l8.log'), lv.out + lv.err + check.out + check.err);
  const data = readJson(path.join(target, 'frontend/dist/results.json'));
  const lists = [LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, LEVEL7_CHECKS, LEVEL8_CHECKS];
  const all8 = data && lists.every((names, i) => data.levels[i].status === 'bestanden' && same(data.levels[i].checks.map((c) => c.name), names));
  add('L8-K4', 'make level8 und make check: Level 1–8 bestanden mit den Checks der Spec', lv.code === 0 && check.code === 0 && !!all8,
    [lv.code !== 0 && `make level8: Exit-Code ${lv.code}`, lv.code === 0 && check.code !== 0 && `make check: Exit-Code ${check.code}`,
      !all8 && `Status: ${data?.levels?.slice(0, 8).map((l) => l.status).join('/')}`].filter(Boolean).join('; '));
  nebenwerte.selbstmessung = data?.levels?.[7]?.status ?? null;
  run('make', ['down']);
}

const passed = criteria.length >= 4 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
fs.writeFileSync(path.join(out, 'judge-level8.json'), JSON.stringify({ level: 8, passed, checkedAt: new Date().toISOString(), target, live: LIVE, criteria, nebenwerte }, null, 2));
console.log(`\nLevel 8 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
