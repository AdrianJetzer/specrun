// Unabhängiger Prüfer für Level 7 (Images in der Pipeline).
// Aufruf: node level7.mjs <ziel-ordner> [ausgabe-ordner]
// Braucht GH_TOKEN (Lese-Token) und RUN_ID. Setzt voraus, dass Level 1–6 bestanden sind (judge/all.mjs).
// Die Images werden ohne Docker direkt aus der Registry gelesen (Manifest, Konfiguration, Labels).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, LEVEL7_CHECKS, CONTAINER_CHECKS } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level7.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const RUN_ID = process.env.RUN_ID ?? '';
const REPO = `specrun-lab/levelboard-${RUN_ID}`;
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
const head = run('git', ['rev-parse', 'HEAD']).out.trim();

// ---- Registry ohne Anmeldung lesen ----
const ACCEPT = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';
async function registryImage(name, tag) {
  const tr = await fetch(`https://ghcr.io/token?scope=repository:${name}:pull`);
  if (!tr.ok) return { error: `kein anonymes Token (${tr.status}) – Paket nicht öffentlich?` };
  const { token } = await tr.json();
  const auth = { Authorization: `Bearer ${token}` };
  let mr = await fetch(`https://ghcr.io/v2/${name}/manifests/${tag}`, { headers: { ...auth, Accept: ACCEPT } });
  if (!mr.ok) return { error: `Manifest ${tag} nicht abrufbar (${mr.status})` };
  let manifest = await mr.json();
  if (manifest.manifests) {
    // Index: amd64-Variante wählen
    const m = manifest.manifests.find((x) => x.platform?.architecture === 'amd64' && x.platform?.os === 'linux') ?? manifest.manifests[0];
    mr = await fetch(`https://ghcr.io/v2/${name}/manifests/${m.digest}`, { headers: { ...auth, Accept: ACCEPT } });
    manifest = await mr.json();
  }
  const size = (manifest.layers ?? []).reduce((s, l) => s + (l.size ?? 0), 0);
  const cr = await fetch(`https://ghcr.io/v2/${name}/blobs/${manifest.config.digest}`, { headers: auth });
  if (!cr.ok) return { error: `Konfiguration nicht abrufbar (${cr.status})` };
  const config = (await cr.json()).config ?? {};
  return { config, size };
}

console.log(`Prüfer Level 7 → ${target} (Repo ${REPO})\n`);

if (!RUN_ID || !process.env.GH_TOKEN) {
  add('L7-K0', 'Prüfer-Umgebung: RUN_ID und GH_TOKEN gesetzt', false, 'RUN_ID oder GH_TOKEN fehlt');
} else {
  // ---- L7-K1: Dateien (Dockerfiles, nginx, Compose) ----
  const fp = [];
  const be = read('backend/Dockerfile') ?? '';
  const fe = read('frontend/Dockerfile') ?? '';
  const ngx = read('frontend/nginx-container.conf') ?? '';
  if (!/^FROM\s+golang:1\.27\.4-alpine\s+AS\s+\w+/im.test(be)) fp.push('Backend: Build-Stufe nicht golang:1.27.4-alpine');
  if (!/^FROM\s+alpine:3\.23\s*$/im.test(be)) fp.push('Backend: Laufzeit nicht alpine:3.23');
  if (!/CGO_ENABLED=0/.test(be) || !/-buildvcs=false/.test(be)) fp.push('Backend: Build ohne CGO_ENABLED=0 bzw. -buildvcs=false');
  if (!/^USER\s+levelboard\s*$/im.test(be) || !/-u\s+10001\b/.test(be)) fp.push('Backend: nicht als Benutzer levelboard (UID 10001)');
  if (!/^FROM\s+node:26\.13\.0-alpine\s+AS\s+\w+/im.test(fe)) fp.push('Frontend: Build-Stufe nicht node:26.13.0-alpine');
  if (!/^FROM\s+nginx:1\.31\.9-alpine\s*$/im.test(fe)) fp.push('Frontend: Laufzeit nicht nginx:1.31.9-alpine');
  if (!/"source"\s*:\s*"api"/.test(fe)) fp.push('Frontend: config.json im Image nicht {"source":"api"}');
  for (const f of ['backend', 'frontend']) if (!/org\.opencontainers\.image\.source/.test(f === 'backend' ? be : fe)) fp.push(`${f}: Label org.opencontainers.image.source fehlt`);
  if (!/proxy_pass\s+http:\/\/backend:8081;/.test(ngx)) fp.push('nginx-container.conf: proxy_pass nicht http://backend:8081');
  if (!/charset\s+off;/.test(ngx)) fp.push('nginx-container.conf: charset off fehlt');
  if (!/listen\s+8080;/.test(ngx)) fp.push('nginx-container.conf: listen nicht 8080');
  let compose = null;
  try { compose = YAML.parse(read('docker-compose.yml') ?? ''); } catch {}
  const svc = compose?.services ?? {};
  if (!svc.backend || !svc.frontend) fp.push('docker-compose.yml: Dienste backend/frontend fehlen');
  else {
    if (!JSON.stringify(svc.backend.healthcheck?.test ?? '').includes('/api/health')) fp.push('Compose: Healthcheck des Backends fehlt');
    if (!(svc.backend.volumes ?? []).some((v) => String(v).endsWith(':/data'))) fp.push('Compose: Volume für /data fehlt');
    if (svc.backend.ports) fp.push('Compose: Backend darf nicht nach außen veröffentlicht werden');
    if (!(svc.frontend.ports ?? []).map(String).includes('8080:8080')) fp.push('Compose: Frontend nicht auf 8080:8080');
    if (svc.frontend.depends_on?.backend?.condition !== 'service_healthy') fp.push('Compose: Frontend wartet nicht auf gesundes Backend');
    if (!String(svc.backend.image ?? '').includes('${IMAGE_PREFIX') || !String(svc.frontend.image ?? '').includes('${IMAGE_TAG')) fp.push('Compose: image ohne IMAGE_PREFIX/IMAGE_TAG');
  }
  const main = read('backend/main.go') ?? '';
  if (!/LEVELBOARD_ADDR/.test(main + (read('backend/server.go') ?? ''))) fp.push('Backend liest LEVELBOARD_ADDR nicht (main.go)');
  add('L7-K1', 'Dockerfiles, nginx-container.conf und docker-compose.yml erfüllen die Eckpunkte', fp.length === 0, fp.join('; '));

  // ---- L7-K2: Job images grün, Container-Report ----
  const jp = [];
  const ciRun = ghJson(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&head_sha=${head}&per_page=1`)?.workflow_runs?.[0];
  if (!ciRun) jp.push('kein Lauf für den aktuellen Commit');
  else {
    const jobs = ghJson(`repos/${REPO}/actions/runs/${ciRun.id}/jobs`)?.jobs ?? [];
    const job = jobs.find((j) => j.name === 'images');
    if (job?.conclusion !== 'success') jp.push(`Job images: ${job?.conclusion ?? 'fehlt'}`);
    if (job?.started_at && job?.completed_at) nebenwerte.imagesJobS = Math.round((Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-'));
    const dl = run('gh', ['run', 'download', String(ciRun.id), '--repo', REPO, '--name', 'levelboard-container-report', '--dir', dir], { cwd: out });
    const file = ['playwright.json', 'checks/.out/playwright.json', '.out/playwright.json'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
    const report = file ? readJson(file) : null;
    if (dl.code !== 0 || !report) jp.push('Artefakt levelboard-container-report fehlt');
    else {
      const specs = [];
      const walk = (s) => { (s.suites ?? []).forEach(walk); if (s.title === 'container') specs.push(...(s.specs ?? [])); };
      report.suites.forEach(walk);
      if (!same(specs.map((s) => s.title), CONTAINER_CHECKS)) jp.push(`Container-Checks: ${JSON.stringify(specs.map((s) => s.title))}`);
      const failed = specs.filter((s) => !s.ok).map((s) => s.title);
      if (failed.length) jp.push(`nicht bestanden: ${failed.join('; ')}`);
    }
  }
  add('L7-K2', 'Job images grün; Container-Report mit den 6 Checks der Spec, alle bestanden', jp.length === 0, jp.join('; '));

  // ---- L7-K3: Images öffentlich, Labels, Laufzeit-Konfiguration ----
  const ip = [];
  const sizes = {};
  for (const part of ['frontend', 'backend']) {
    const img = await registryImage(`${REPO}-${part}`, head).catch((e) => ({ error: e.message }));
    if (img.error) { ip.push(`${part}: ${img.error}`); continue; }
    sizes[part] = Math.round(img.size / 1024 / 1024 * 10) / 10;
    const labels = img.config.Labels ?? {};
    if (labels['org.opencontainers.image.revision'] !== head) ip.push(`${part}: Label revision „${labels['org.opencontainers.image.revision']}“`);
    if (!String(labels['org.opencontainers.image.source'] ?? '').endsWith(`/${REPO}`)) ip.push(`${part}: Label source „${labels['org.opencontainers.image.source']}“`);
    if (part === 'backend') {
      if (!['levelboard', '10001'].includes(String(img.config.User ?? '').split(':')[0])) ip.push(`backend: User „${img.config.User}“`);
      const env = Object.fromEntries((img.config.Env ?? []).map((e) => e.split(/=(.*)/s).slice(0, 2)));
      if (env.LEVELBOARD_ADDR !== '0.0.0.0:8081' || env.LEVELBOARD_DB !== '/data/levelboard.db') ip.push('backend: LEVELBOARD_ADDR/LEVELBOARD_DB falsch');
      if (!img.config.ExposedPorts?.['8081/tcp']) ip.push('backend: Port 8081 nicht freigegeben');
    } else if (!img.config.ExposedPorts?.['8080/tcp']) ip.push('frontend: Port 8080 nicht freigegeben');
  }
  nebenwerte.imageGroessenMB = sizes;
  add('L7-K3', 'Beide Images öffentlich mit Tag des Commits; Labels und Laufzeit-Konfiguration stimmen', ip.length === 0, ip.join('; ') || `Größe: Frontend ${sizes.frontend} MB, Backend ${sizes.backend} MB`);

  // ---- L7-K4: make level7 + make check ----
  run('make', ['down']);
  const lv = run('make', ['level7'], { env: { ...process.env, RUN_ID } });
  const check = lv.code === 0 ? run('make', ['check'], { env: { ...process.env, RUN_ID } }) : { code: null, out: '', err: '' };
  fs.writeFileSync(path.join(out, 'make-check-l7.log'), lv.out + lv.err + check.out + check.err);
  const data = readJson(path.join(target, 'frontend/dist/results.json'));
  const lists = [LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, LEVEL5_CHECKS, LEVEL6_CHECKS, LEVEL7_CHECKS];
  const all7 = data && lists.every((names, i) => data.levels[i].status === 'bestanden' && same(data.levels[i].checks.map((c) => c.name), names));
  add('L7-K4', 'make level7 und make check: Level 1–7 bestanden mit den Checks der Spec', lv.code === 0 && check.code === 0 && !!all7,
    [lv.code !== 0 && `make level7: Exit-Code ${lv.code}`, lv.code === 0 && check.code !== 0 && `make check: Exit-Code ${check.code}`,
      !all7 && `Status: ${data?.levels?.slice(0, 7).map((l) => l.status).join('/')}`].filter(Boolean).join('; '));
  nebenwerte.selbstmessung = data?.levels?.[6]?.status ?? null;
  run('make', ['down']);
}

const passed = criteria.length >= 4 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
fs.writeFileSync(path.join(out, 'judge-level7.json'), JSON.stringify({ level: 7, passed, checkedAt: new Date().toISOString(), target, criteria, nebenwerte }, null, 2));
console.log(`\nLevel 7 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
