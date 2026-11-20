// Unabhängiger Prüfer für Level 4 (Datenbank).
// Aufruf: node level4.mjs <ziel-ordner> [ausgabe-ordner]
// Setzt voraus, dass Level 1–3 bestanden sind (judge/all.mjs). Der API-Vertrag aus Level 3 wurde dort
// bereits gegen denselben Code geprüft. Hier: Kriterien aus spec/levels/level-04.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, LEVEL4_CHECKS, DB_SCHEMA, startState } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level4.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const WEB = 'http://127.0.0.1:8080';
const API = 'http://127.0.0.1:8081';
const DB = path.join(target, '.run/levelboard.db');
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
async function call(method, p, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let r;
  try {
    r = await fetch(`${API}${p}`, init);
  } catch (e) {
    // Backend nicht erreichbar: als Status 0 werten, damit die Prüfung weiterläuft und das Kriterium scheitert
    return { status: 0, type: null, allow: null, json: null, text: `nicht erreichbar: ${e.cause?.code ?? e.message}` };
  }
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, type: r.headers.get('content-type'), allow: r.headers.get('allow'), json, text };
}
const rep = (ok, durationMs, metrics) => ({ checks: [{ name: 'p', ok }], durationMs, ...(metrics ? { metrics } : {}) });
const hist = async (n, q = '?limit=500') => (await call('GET', `/api/levels/${n}/history${q}`)).json;
function withDb(fn) {
  const db = new DatabaseSync(DB, { readOnly: true });
  try { return fn(db); } finally { db.close(); }
}

// Schema der Historie (openapi.yaml: History)
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const entrySchema = {
  type: 'object', additionalProperties: false, required: ['id', 'status', 'checkedAt', 'durationMs', 'checks', 'metrics'],
  properties: {
    id: { type: 'integer', minimum: 1 }, status: { enum: ['bestanden', 'fehlgeschlagen'] }, checkedAt: { type: 'string', format: 'date-time' },
    durationMs: { type: 'integer', minimum: 0 }, metrics: { type: 'object' },
    checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'ok'], properties: { name: { type: 'string', minLength: 1 }, ok: { type: 'boolean' } } } },
  },
};
const vHistory = ajv.compile({ type: 'object', additionalProperties: false, required: ['level', 'entries'], properties: { level: { type: 'integer', minimum: 1, maximum: 10 }, entries: { type: 'array', items: entrySchema } } });
const vResults = ajv.compile(JSON.parse(fs.readFileSync(path.join(here, '../spec/results.schema.json'), 'utf8')));

const publicFile = path.join(target, 'frontend/public/results.json');
const distFile = path.join(target, 'frontend/dist/results.json');
console.log(`Prüfer Level 4 → ${target}\n`);

// ---- L4-K1: make level4 ----
run('make', ['down']);
const start = run('make', ['level4']);
fs.writeFileSync(path.join(out, 'make-level4.log'), start.out);
nebenwerte.makeLevel4Ms = start.ms;
const webUp = start.code === 0 && (await up(`${WEB}/`, 60_000));
const apiUp = start.code === 0 && (await up(`${API}/api/health`, 60_000));
const dbExists = fs.existsSync(DB);
add('L4-K1', 'make level4 startet alles, .run/levelboard.db existiert', webUp && apiUp && dbExists,
  start.code !== 0 ? `Exit-Code ${start.code}` : [!webUp && '8080 antwortet nicht', !apiUp && '8081 antwortet nicht', !dbExists && 'keine .run/levelboard.db'].filter(Boolean).join('; ') || `${(start.ms / 1000).toFixed(1)} s`);

const publicHashBefore = sha(publicFile);

if (webUp && apiUp && dbExists) {
  // ---- L4-K2: Schema der Datei ----
  const sp = [];
  try {
    withDb((db) => {
      const uv = db.prepare('PRAGMA user_version').get().user_version;
      if (uv !== 1) sp.push(`user_version ${uv} statt 1`);
      for (const [table, cols] of Object.entries(DB_SCHEMA)) {
        const info = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => [c.name, String(c.type).toUpperCase(), c.notnull, c.pk]);
        if (!same(info, cols)) sp.push(`${table}: ${JSON.stringify(info)}`);
      }
      const idx = db.prepare(`PRAGMA index_info(reports_level)`).all().map((c) => c.name);
      if (!same(idx, ['level', 'id'])) sp.push(`Index reports_level: ${JSON.stringify(idx)}`);
      const lv = db.prepare('SELECT level, status FROM levels ORDER BY level').all();
      if (lv.length !== 10 || lv.some((l, i) => l.level !== i + 1 || l.status !== 'offen')) sp.push('levels: nicht 10 offene Startzeilen');
      if (db.prepare('SELECT COUNT(*) AS n FROM reports').get().n !== 0) sp.push('reports nach dem Start nicht leer');
    });
  } catch (e) {
    sp.push(`DB nicht lesbar: ${e.message}`);
  }
  add('L4-K2', 'Datenbankdatei hat das vorgegebene Schema (user_version 1)', sp.length === 0, sp.join('; '));

  // ---- L4-K3: Historie ----
  const hp = [];
  const expect = (c, m) => c || hp.push(m);
  let r = await call('GET', '/api/levels/1/history');
  expect(r.status === 200 && vHistory(r.json) && r.json.level === 1 && r.json.entries.length === 0, `leere Historie: ${r.status} ${r.text.slice(0, 80)}`);
  expect(r.type === 'application/json', `Historie: Content-Type „${r.type}“`);
  await call('POST', '/api/levels/1/result', rep(true, 11));
  await call('POST', '/api/levels/2/result', rep(true, 21, { a: 1 }));
  await call('POST', '/api/levels/1/result', rep(false, 12));       // Level 2 wird gesperrt und geleert
  const c409 = await call('POST', '/api/levels/2/result', rep(true, 22));
  expect(c409.status === 409, `Meldung an Level 2 nach Fehlschlag: ${c409.status} statt 409`);
  await call('POST', '/api/levels/1/result', rep(true, 13));
  const h1 = await hist(1);
  expect(vHistory(h1), `Historie Level 1 außerhalb des Schemas: ${ajv.errorsText(vHistory.errors)}`);
  expect(same(h1?.entries?.map((e) => e.durationMs), [13, 12, 11]), `Historie Level 1: ${JSON.stringify(h1?.entries?.map((e) => e.durationMs))} statt [13,12,11]`);
  expect(same(h1?.entries?.map((e) => e.status), ['bestanden', 'fehlgeschlagen', 'bestanden']), 'Historie Level 1: Status falsch');
  const ids = h1?.entries?.map((e) => e.id) ?? [];
  expect(ids.every((id, i) => i === 0 || id < ids[i - 1]), 'Historie nicht nach id absteigend');
  const h2 = await hist(2);
  expect(same(h2?.entries?.map((e) => e.durationMs), [21]) && same(h2?.entries?.[0]?.metrics, { a: 1 }), `Historie Level 2: ${JSON.stringify(h2?.entries)} (erwartet nur die angenommene Meldung, auch nach dem Leeren)`);
  const lvl1 = (await call('GET', '/api/levels/1')).json;
  expect(h1?.entries?.[0]?.checkedAt === lvl1?.checkedAt && same(h1?.entries?.[0]?.checks, lvl1?.checks), 'neuester Historieneintrag ≠ aktueller Stand von Level 1');
  r = await call('GET', '/api/levels/1/history?limit=2');
  expect(r.json?.entries?.length === 2 && r.json.entries[0].durationMs === 13, 'limit=2 wirkt nicht');
  for (const q of ['0', '501', 'abc', '-1', '1.5']) expect((await call('GET', `/api/levels/1/history?limit=${q}`)).status === 400, `limit=${q} nicht 400`);
  expect((await call('GET', '/api/levels/11/history')).status === 404, 'Historie Level 11 nicht 404');
  r = await call('POST', '/api/levels/1/history', {});
  expect(r.status === 405 && (r.allow ?? '').includes('GET'), `POST auf Historie: ${r.status} Allow „${r.allow}“`);
  // Datei und API stimmen überein
  try {
    withDb((db) => {
      const rows = db.prepare('SELECT id, level, duration_ms FROM reports ORDER BY id DESC').all();
      expect(same(rows.filter((x) => x.level === 1).map((x) => x.duration_ms), [13, 12, 11]), 'Tabelle reports passt nicht zur Historie');
      const dbl = db.prepare('SELECT status, duration_ms FROM levels WHERE level = 1').get();
      expect(dbl.status === 'bestanden' && dbl.duration_ms === 13, 'Tabelle levels passt nicht zur API');
      const upd = db.prepare(`SELECT value FROM meta WHERE key = 'updated_at'`).get()?.value;
      expect(upd === lvl1?.checkedAt, 'meta.updated_at ≠ letzter checkedAt');
    });
  } catch (e) {
    hp.push(`DB nicht lesbar: ${e.message}`);
  }
  add('L4-K3', 'Historie: Reihenfolge, Inhalte, limit, 409 nicht gespeichert, Datei = API', hp.length === 0, hp.slice(0, 5).join('; '));

  // ---- L4-K4: Persistenz ----
  const beforeLevels = (await call('GET', '/api/levels')).json;
  const beforeH1 = await hist(1);
  const restart = run('make', ['restart-backend']);
  fs.writeFileSync(path.join(out, 'make-restart-backend.log'), restart.out);
  const back = restart.code === 0 && (await up(`${API}/api/health`, 30_000));
  const afterLevels = back ? (await call('GET', '/api/levels')).json : null;
  const afterH1 = back ? await hist(1) : null;
  const kept = back && same(afterLevels, beforeLevels) && same(afterH1, beforeH1);
  add('L4-K4', 'make restart-backend behält Stand und Historie', kept,
    restart.code !== 0 ? `Exit-Code ${restart.code}` : !back ? 'Backend kommt nicht zurück' : !kept ? 'Daten nach Neustart verändert' : '');

  // ---- L4-K5: Last ----
  const countBefore = (await hist(1, '?limit=500'))?.entries?.length ?? 0;
  const N = 100;
  const res = await Promise.all(Array.from({ length: N }, (_, i) => call('POST', '/api/levels/1/result', rep(i % 3 !== 0, 1000 + i))));
  const fivexx = res.filter((x) => x.status >= 500).length;
  const nok = res.filter((x) => x.status !== 200).length;
  const countAfter = (await hist(1, '?limit=500'))?.entries?.length ?? 0;
  const final = (await call('GET', '/api/levels')).json;
  const f1 = final?.levels?.[0];
  const consistent = vResults(final) && f1 && (f1.status === 'bestanden') === f1.checks.every((c) => c.ok) &&
    final.levels.slice(1).every((l) => l.status === (f1.status === 'bestanden' ? 'offen' : 'gesperrt'));
  const newest = (await hist(1, '?limit=1'))?.entries?.[0];
  add('L4-K5', `${N} gleichzeitige Meldungen: kein 5xx, genau ${N} neue Einträge, konsistent`,
    fivexx === 0 && nok === 0 && countAfter - countBefore === N && consistent && newest?.durationMs === f1?.durationMs,
    [fivexx && `${fivexx}× 5xx`, nok && `${nok} Antworten ≠ 200`, countAfter - countBefore !== N && `${countAfter - countBefore} neue Einträge`, !consistent && 'Endzustand inkonsistent',
      newest?.durationMs !== f1?.durationMs && 'neuester Eintrag ≠ aktueller Stand'].filter(Boolean).join('; '));

  // Neustart über make level4 setzt zurück
  run('make', ['level4']);
  await up(`${API}/api/health`, 60_000);
  const fresh = (await call('GET', '/api/levels')).json;
  const freshH = await hist(1);
  nebenwerte.resetNachLevel4 = same(fresh?.levels, startState().levels) && freshH?.entries?.length === 0;

  // ---- L4-K6: Go ----
  const gomod = fs.readFileSync(path.join(target, 'backend/go.mod'), 'utf8');
  const direct = [...gomod.matchAll(/^\s*(?:require\s+)?([\w./-]+)\s+(v[\w.+-]+)\s*$/gm)].map((m) => `${m[1]} ${m[2]}`);
  const directOk = same(direct, ['modernc.org/sqlite v1.62.0']);
  const vet = run('go', ['vet', './...'], { cwd: path.join(target, 'backend') });
  const test = run('go', ['test', '-count=1', '-cover', './...'], { cwd: path.join(target, 'backend') });
  const cov = test.out.match(/coverage:\s*([\d.]+)%/);
  nebenwerte.goCoverage = cov ? Number(cov[1]) : null;
  nebenwerte.goTestFiles = fs.readdirSync(path.join(target, 'backend')).filter((f) => f.endsWith('_test.go')).length;
  fs.writeFileSync(path.join(out, 'go-test-l4.log'), vet.out + '\n' + test.out);
  add('L4-K6', 'Go: genau modernc.org/sqlite v1.62.0, go vet sauber, go test grün', directOk && vet.code === 0 && test.code === 0,
    [!directOk && `direkte Abhängigkeiten: ${JSON.stringify(direct)}`, vet.code !== 0 && 'go vet meldet Probleme', test.code !== 0 && 'go test schlägt fehl'].filter(Boolean).join('; ') || `Abdeckung ${nebenwerte.goCoverage ?? '?'} %`);

  // ---- L4-K7: make check ----
  const check = run('make', ['check']);
  fs.writeFileSync(path.join(out, 'make-check-l4.log'), check.out);
  nebenwerte.makeCheckMs = check.ms;
  const data = readJson(distFile);
  const valid = data !== null && vResults(data);
  const names = (k) => (data?.levels?.[k - 1]?.checks ?? []).map((c) => c.name);
  const all4 = [1, 2, 3, 4].every((k) => data?.levels?.[k - 1]?.status === 'bestanden');
  const namesOk = same(names(1), LEVEL1_CHECKS) && same(names(2), LEVEL2_CHECKS) && same(names(3), LEVEL3_CHECKS) && same(names(4), LEVEL4_CHECKS);
  add('L4-K7', 'make check: Exit 0, schemagültig, Level 1–4 bestanden mit den Checks der Spec', check.code === 0 && valid && all4 && namesOk,
    [check.code !== 0 && `Exit-Code ${check.code}`, !valid && 'Schema verletzt', !all4 && `Status: ${[1, 2, 3, 4].map((k) => data?.levels?.[k - 1]?.status).join('/')}`,
      !namesOk && `Checks L4: ${JSON.stringify(names(4))}`].filter(Boolean).join('; '));
  fs.writeFileSync(path.join(out, 'agent-results-l4.json'), JSON.stringify(data, null, 2));
  nebenwerte.selbstmessung = data?.levels?.[3]?.status ?? null;
}

// ---- L4-K8: Startdatei, make down ----
const startOk = publicHashBefore !== null && sha(publicFile) === publicHashBefore && same(readJson(publicFile), startState());
run('make', ['down']);
const webDown = await gone(`${WEB}/`, 10_000);
const apiDown = await gone(`${API}/api/health`, 10_000);
add('L4-K8', 'Startdatei unverändert, make down gibt 8080 und 8081 frei', startOk && webDown && apiDown,
  [!startOk && 'public/results.json verändert', !webDown && '8080 antwortet weiterhin', !apiDown && '8081 antwortet weiterhin'].filter(Boolean).join('; '));

const passed = criteria.length === 8 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
fs.writeFileSync(path.join(out, 'judge-level4.json'), JSON.stringify({ level: 4, passed, checkedAt: new Date().toISOString(), target, criteria, nebenwerte }, null, 2));
console.log(`\nLevel 4 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
