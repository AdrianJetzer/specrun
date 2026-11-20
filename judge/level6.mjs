// Unabhängiger Prüfer für Level 6 (Repo + CI).
// Aufruf: node level6.mjs <ziel-ordner> [ausgabe-ordner]
// Braucht GH_TOKEN (Lese-Token des Prüfers für specrun-lab) und RUN_ID (z. B. lauf-006) in der Umgebung.
// Setzt voraus, dass Level 1–5 bestanden sind (judge/all.mjs). Kriterien aus spec/levels/level-06.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, SECRET_PATTERNS, startState } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level6.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const RUN_ID = process.env.RUN_ID ?? '';
const REPO = `specrun-lab/levelboard-${RUN_ID}`;
const IMAGE = 'ghcr.io/specrun-lab/devcontainer:1';
const criteria = [];
const nebenwerte = { repo: REPO };
const add = (id, name, ok, detail = '') => {
  criteria.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` – ${detail}` : ''}`);
};
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: target, encoding: 'utf8', timeout: 300_000, maxBuffer: 256 * 1024 * 1024, ...opts });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
};
const gh = (args) => run('gh', args, { cwd: out });
const ghJson = (endpoint) => {
  const r = gh(['api', endpoint]);
  if (r.code !== 0) return null;
  try { return JSON.parse(r.out); } catch { return null; }
};
const git = (args) => run('git', args).out.trim();
const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha = (f) => (fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);
const findSecret = (text) => SECRET_PATTERNS.find((re) => re.test(text));
const LISTS = [LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS];

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const vResults = ajv.compile(JSON.parse(fs.readFileSync(path.join(here, '../spec/results.schema.json'), 'utf8')));
console.log(`Prüfer Level 6 → ${target} (Repo ${REPO})\n`);

if (!RUN_ID || !process.env.GH_TOKEN) {
  add('L6-K0', 'Prüfer-Umgebung: RUN_ID und GH_TOKEN gesetzt', false, [!RUN_ID && 'RUN_ID fehlt', !process.env.GH_TOKEN && 'GH_TOKEN fehlt'].filter(Boolean).join('; '));
} else {
  // ---- L6-K1: Repo und gepushter Stand ----
  const repo = ghJson(`repos/${REPO}`);
  const head = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain']);
  const remoteMain = ghJson(`repos/${REPO}/branches/main`)?.commit?.sha;
  const remoteUrl = git(['remote', 'get-url', 'origin']);
  add('L6-K1', 'Repo öffentlich mit main; lokaler HEAD = main auf GitHub, nichts uncommittet',
    !!repo && repo.visibility === 'public' && repo.default_branch === 'main' && head && head === remoteMain && dirty === '',
    [!repo && 'Repo nicht gefunden', repo && repo.visibility !== 'public' && `Sichtbarkeit ${repo.visibility}`, repo && repo.default_branch !== 'main' && `Standard-Branch ${repo.default_branch}`,
      head !== remoteMain && `HEAD ${head.slice(0, 7)} ≠ main ${String(remoteMain).slice(0, 7)}`, dirty && 'uncommittete Änderungen'].filter(Boolean).join('; '));
  nebenwerte.commits = Number(git(['rev-list', '--count', 'HEAD'])) || null;

  // ---- L6-K2: Eckpunkte der Pipeline ----
  const wp = [];
  let wf = null;
  try {
    wf = YAML.parse(fs.readFileSync(path.join(target, '.github/workflows/ci.yml'), 'utf8'));
  } catch (e) {
    wp.push(`ci.yml fehlt oder ist kein gültiges YAML (${e.message.split('\n')[0]})`);
  }
  if (wf) {
    const on = wf.on ?? wf[true]; // YAML 1.1 liest „on“ manchmal als true
    const pushBranches = on?.push?.branches ?? [];
    if (wf.name !== 'CI') wp.push(`name „${wf.name}“`);
    if (!pushBranches.includes('main') || !(on && 'workflow_dispatch' in on)) wp.push('Auslöser: push auf main und workflow_dispatch');
    const jobs = Object.keys(wf.jobs ?? {});
    const job = wf.jobs?.check;
    // Level 6: genau der Job „check“; ab Level 7 kommt rechtmäßig der Job „images“ dazu
    if (!jobs.includes('check') || jobs.some((j) => !['check', 'images'].includes(j))) wp.push(`Jobs ${JSON.stringify(jobs)} statt ["check"] (ab Level 7 zusätzlich "images")`);
    if (job) {
      if (job['runs-on'] !== 'ubuntu-latest') wp.push(`runs-on ${job['runs-on']}`);
      if (job['timeout-minutes'] !== 20) wp.push(`timeout-minutes ${job['timeout-minutes']}`);
      const img = typeof job.container === 'string' ? job.container : job.container?.image;
      if (img !== IMAGE) wp.push(`Container-Image „${img}“`);
      if (!String(job.container?.options ?? '').includes('--user root')) wp.push('options ohne --user root');
      const env = { ...(wf.env ?? {}), ...(job.env ?? {}) };
      if (env.GOMODCACHE !== '/home/dev/go/pkg/mod' || env.GOCACHE !== '/home/dev/.cache/go-build') wp.push('GOMODCACHE/GOCACHE nicht auf den Vorrat im Image');
      const steps = job.steps ?? [];
      const runs = steps.map((s) => String(s.run ?? '').trim());
      const iCheckout = steps.findIndex((s) => String(s.uses ?? '').startsWith('actions/checkout@'));
      const iL5 = runs.findIndex((r) => /\bmake level5\b/.test(r));
      const iCheck = runs.findIndex((r) => /\bmake check\b/.test(r));
      const up = steps.find((s) => String(s.uses ?? '').startsWith('actions/upload-artifact@'));
      if (!(iCheckout >= 0 && iCheckout < iL5 && iL5 < iCheck)) wp.push('Schritte nicht in der Reihenfolge checkout → make level5 → make check');
      if (!up) wp.push('kein actions/upload-artifact');
      else {
        if (up.with?.name !== 'levelboard-report') wp.push(`Artefakt-Name „${up.with?.name}“`);
        const paths = String(up.with?.path ?? '');
        if (!paths.includes('frontend/dist/results.json') || !paths.includes('checks/.out/playwright.json')) wp.push('Artefakt ohne results.json bzw. playwright.json');
        if (!String(up.if ?? '').includes('always()')) wp.push('Artefakt ohne if: always()');
      }
    } else wp.push('Job check fehlt');
  }
  add('L6-K2', '.github/workflows/ci.yml erfüllt die Eckpunkte', wp.length === 0, wp.join('; '));

  // ---- L6-K3: letzter Lauf für HEAD ----
  const runsAll = ghJson(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&per_page=100`);
  nebenwerte.pipelineLaeufe = runsAll?.total_count ?? null;
  const ciRun = ghJson(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&head_sha=${head}&per_page=1`)?.workflow_runs?.[0];
  if (ciRun?.run_started_at && ciRun?.updated_at) nebenwerte.pipelineDauerS = Math.round((Date.parse(ciRun.updated_at) - Date.parse(ciRun.run_started_at)) / 1000);
  add('L6-K3', 'Letzter Lauf von CI für den aktuellen Commit: completed/success', ciRun?.status === 'completed' && ciRun?.conclusion === 'success',
    !ciRun ? 'kein Lauf für den aktuellen Commit' : `${ciRun.status}/${ciRun.conclusion}`);

  // ---- L6-K4: Artefakt ----
  const ap = [];
  if (!ciRun) ap.push('kein Lauf');
  else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l6-report-'));
    const dl = gh(['run', 'download', String(ciRun.id), '--repo', REPO, '--name', 'levelboard-report', '--dir', dir]);
    if (dl.code !== 0) ap.push(`Artefakt levelboard-report nicht ladbar: ${dl.err.trim().split('\n')[0]}`);
    else {
      const pick = (names) => names.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
      const resFile = pick(['results.json', 'frontend/dist/results.json']);
      const pwFile = pick(['playwright.json', 'checks/.out/playwright.json', '.out/playwright.json']);
      const data = resFile ? readJson(resFile) : null;
      if (!data) ap.push('results.json fehlt im Artefakt');
      else {
        if (!vResults(data)) ap.push(`results.json verletzt das Schema (${ajv.errorsText(vResults.errors)})`);
        for (let n = 1; n <= 5; n++) {
          const l = data.levels?.[n - 1];
          if (l?.status !== 'bestanden') ap.push(`Level ${n}: ${l?.status}`);
          else if (!same(l.checks.map((c) => c.name), LISTS[n - 1])) ap.push(`Level ${n}: Checks weichen von der Spec ab`);
        }
      }
      if (!pwFile || !readJson(pwFile)?.suites) ap.push('playwright.json fehlt oder ist leer');
      fs.cpSync(dir, path.join(out, 'artefakt-l6'), { recursive: true });
    }
  }
  add('L6-K4', 'Artefakt levelboard-report: Level 1–5 bestanden mit den Checks der Spec', ap.length === 0, ap.join('; '));

  // ---- L6-K5: keine Zugangsdaten ----
  const sp = [];
  const history = run('git', ['log', '-p', '--all', '--no-color']).out;
  if (findSecret(history)) sp.push('Token-Muster in der Git-Historie');
  const tracked = run('git', ['grep', '-I', '-n', '-E', 'github_pat_|gh[opsur]_[A-Za-z0-9]{30,}|sk-ant-']).out;
  if (tracked && findSecret(tracked)) sp.push('Token-Muster in Dateien des Repos');
  if (findSecret(remoteUrl) || /:\/\/[^/]*@/.test(remoteUrl)) sp.push('Zugangsdaten in der Remote-Adresse');
  if (ciRun) {
    const logs = gh(['run', 'view', String(ciRun.id), '--repo', REPO, '--log']);
    if (logs.code !== 0) sp.push('Logs des Laufs nicht lesbar');
    else if (findSecret(logs.out)) sp.push('Token-Muster in den Logs der Pipeline');
  }
  add('L6-K5', 'Keine Zugangsdaten in Repo, Historie, Remote-Adresse und Pipeline-Logs', sp.length === 0, sp.join('; '));

  // ---- L6-K6: make level6 + make check lokal ----
  const publicFile = path.join(target, 'frontend/public/results.json');
  const before = sha(publicFile);
  run('make', ['down']);
  const lv6 = run('make', ['level6'], { env: { ...process.env, RUN_ID } });
  fs.writeFileSync(path.join(out, 'make-level6.log'), lv6.out + lv6.err);
  const check = lv6.code === 0 ? run('make', ['check'], { env: { ...process.env, RUN_ID } }) : { code: null, out: '', err: '' };
  fs.writeFileSync(path.join(out, 'make-check-l6.log'), check.out + check.err);
  const data = readJson(path.join(target, 'frontend/dist/results.json'));
  const all6 = data && vResults(data) && LISTS.every((names, i) => data.levels[i].status === 'bestanden' && same(data.levels[i].checks.map((c) => c.name), names));
  add('L6-K6', 'make level6 und make check: Level 1–6 bestanden mit den Checks der Spec', lv6.code === 0 && check.code === 0 && !!all6,
    [lv6.code !== 0 && `make level6: Exit-Code ${lv6.code}`, lv6.code === 0 && check.code !== 0 && `make check: Exit-Code ${check.code}`,
      !all6 && `Status: ${data?.levels?.slice(0, 6).map((l) => l.status).join('/')}`].filter(Boolean).join('; '));
  nebenwerte.selbstmessung = data?.levels?.[5]?.status ?? null;
  run('make', ['down']);
  if (sha(publicFile) !== before || !same(readJson(publicFile), startState())) add('L6-K7', 'Startdatei unverändert', false, 'public/results.json verändert');
}

const passed = criteria.length >= 6 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
fs.writeFileSync(path.join(out, 'judge-level6.json'), JSON.stringify({ level: 6, passed, checkedAt: new Date().toISOString(), target, criteria, nebenwerte }, null, 2));
console.log(`\nLevel 6 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
