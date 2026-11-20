// Unabhängiger Prüfer für Level 3 (REST-Backend in Go).
// Aufruf: node level3.mjs <ziel-ordner> [ausgabe-ordner]
// Setzt voraus, dass Level 1 und 2 bestanden sind (das prüft judge/all.mjs vorher).
// Prüft die Kriterien aus spec/levels/level-03.md („Bestanden, wenn“).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LEVEL1_CHECKS, LEVEL2_CHECKS, LEVEL3_CHECKS, TITLES, startState } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] ?? '');
const out = path.resolve(process.argv[3] ?? path.join(here, '.out'));
if (!process.argv[2] || !fs.existsSync(path.join(target, 'Makefile'))) {
  console.error('Aufruf: node level3.mjs <ziel-ordner mit Makefile> [ausgabe-ordner]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const WEB = 'http://127.0.0.1:8080';
const API = 'http://127.0.0.1:8081';
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
async function up(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function down(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { await fetch(url); } catch { return true; }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
async function call(method, p, { body, type = 'application/json', raw } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined || raw !== undefined) {
    init.headers['Content-Type'] = type;
    init.body = raw ?? JSON.stringify(body);
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

// Schemas: Gesamtstand und Level aus results.schema.json, dazu Health und Error
const schema = JSON.parse(fs.readFileSync(path.join(here, '../spec/results.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const vResults = ajv.compile(schema);
const vLevel = ajv.compile({ ...schema.$defs.level, $id: 'level' });
const vError = ajv.compile({ type: 'object', additionalProperties: false, required: ['error'], properties: { error: { type: 'string', minLength: 1 } } });
// commit: ab Spec 0.8.0 (lokal null); ältere Läufe ohne das Feld bleiben gültig
const vHealth = ajv.compile({ type: 'object', additionalProperties: false, required: ['status', 'version'], properties: { status: { const: 'ok' }, version: { type: 'string', minLength: 1 }, commit: { type: ['string', 'null'] } } });

const publicFile = path.join(target, 'frontend/public/results.json');
const distFile = path.join(target, 'frontend/dist/results.json');

console.log(`Prüfer Level 3 → ${target}\n`);

// ---- L3-K1: make level3 startet nginx und Backend ----
run('make', ['down']);
const start = run('make', ['level3']);
fs.writeFileSync(path.join(out, 'make-level3.log'), start.out);
nebenwerte.makeLevel3Ms = start.ms;
const webUp = start.code === 0 && (await up(`${WEB}/`, 60_000));
const apiUp = start.code === 0 && (await up(`${API}/api/health`, 60_000));
add('L3-K1', 'make level3 startet nginx (8080) und Backend (8081)', webUp && apiUp,
  start.code !== 0 ? `Exit-Code ${start.code}` : !webUp ? '8080 antwortet nicht' : !apiUp ? '8081 antwortet nicht' : `${(start.ms / 1000).toFixed(1)} s`);

const publicHashBefore = sha(publicFile);
const ok1 = { checks: [{ name: 'a', ok: true }], durationMs: 7 };
const fail1 = { checks: [{ name: 'a', ok: true }, { name: 'b', ok: false }], durationMs: 9, metrics: { x: 1 } };

if (webUp && apiUp) {
  // ---- L3-K2: API-Vertrag (Schema, Regeln, Fehler) ----
  const p = [];
  const expect = (cond, msg) => cond || p.push(msg);
  const isJson = (r, what) => expect(r.type === 'application/json', `${what}: Content-Type „${r.type}“`);
  const isError = (r, code, what) => {
    expect(r.status === code, `${what}: Status ${r.status} statt ${code}`);
    isJson(r, what);
    expect(r.json && vError(r.json), `${what}: Fehlerobjekt ungültig (${r.text.slice(0, 80)})`);
  };

  // Startzustand
  let r = await call('GET', '/api/health');
  expect(r.status === 200 && vHealth(r.json), `health: ${r.status} ${r.text.slice(0, 80)}`);
  isJson(r, 'health');
  r = await call('GET', '/api/levels');
  expect(r.status === 200 && vResults(r.json), `GET /api/levels: Schema verletzt (${ajv.errorsText(vResults.errors)})`);
  isJson(r, 'GET /api/levels');
  const st = startState();
  expect(r.json && same(r.json.levels, st.levels), 'Startzustand der Levels weicht von public/results.json ab');
  expect(r.json?.run?.updatedAt === null && r.json?.run?.version === '0.1.0', 'run im Startzustand falsch (updatedAt null, version 0.1.0)');
  r = await call('GET', '/api/levels/3');
  expect(r.status === 200 && vLevel(r.json) && r.json.level === 3 && r.json.title === TITLES[2], `GET /api/levels/3: ${r.status} ${r.text.slice(0, 80)}`);

  // Reihenfolge-Regel vor jeder Meldung
  isError(await call('POST', '/api/levels/2/result', { body: ok1 }), 409, 'Level 2 vor Level 1');

  // Melden: bestanden
  const t0 = Date.now();
  r = await call('POST', '/api/levels/1/result', { body: ok1 });
  expect(r.status === 200 && vResults(r.json), `Meldung Level 1: ${r.status} ${ajv.errorsText(vResults.errors)}`);
  const l1 = r.json?.levels?.[0];
  expect(l1?.status === 'bestanden', `Level 1 nach Meldung: ${l1?.status}`);
  expect(l1?.durationMs === 7 && same(l1?.checks, ok1.checks) && same(l1?.metrics, {}), 'Level 1: durationMs/checks/metrics nicht übernommen');
  expect(l1?.title === TITLES[0], 'Level 1: Titel verändert');
  expect(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(l1?.checkedAt ?? '') && Math.abs(Date.parse(l1.checkedAt) - t0) < 60_000, `checkedAt „${l1?.checkedAt}“ nicht im Format toISOString() oder nicht jetzt`);
  expect(r.json?.run?.updatedAt === l1?.checkedAt, 'run.updatedAt ≠ checkedAt');
  expect(r.json?.levels?.slice(1).every((l) => l.status === 'offen'), 'höhere Levels nach Bestehen nicht offen');

  // Melden: Level 2 bestanden, dann Level 2 fehlgeschlagen
  r = await call('POST', '/api/levels/2/result', { body: ok1 });
  expect(r.status === 200 && r.json?.levels?.[1]?.status === 'bestanden', `Meldung Level 2: ${r.status}`);
  r = await call('POST', '/api/levels/2/result', { body: fail1 });
  const lv = r.json?.levels ?? [];
  expect(lv[1]?.status === 'fehlgeschlagen' && same(lv[1]?.metrics, { x: 1 }), 'Level 2 nach Fehlschlag falsch');
  expect(lv[0]?.status === 'bestanden', 'Level 1 durch Meldung von Level 2 verändert');
  expect(lv.slice(2).every((l) => l.status === 'gesperrt' && l.checkedAt === null && l.durationMs === null && l.checks.length === 0), 'höhere Levels nach Fehlschlag nicht gesperrt/leer');
  isError(await call('POST', '/api/levels/3/result', { body: ok1 }), 409, 'Level 3 nach Fehlschlag von Level 2');
  r = await call('GET', '/api/levels/2');
  expect(r.status === 200 && vLevel(r.json) && r.json.status === 'fehlgeschlagen', 'GET /api/levels/2 spiegelt Meldung nicht');
  // erneut bestanden → höhere wieder offen
  r = await call('POST', '/api/levels/2/result', { body: ok1 });
  expect(r.json?.levels?.slice(2).every((l) => l.status === 'offen'), 'höhere Levels nach erneutem Bestehen nicht wieder offen');

  // Fehlerfälle 400
  const bad = {
    'kaputtes JSON': { raw: '{kaputt' },
    'checks fehlt': { body: { durationMs: 1 } },
    'checks leer': { body: { checks: [], durationMs: 1 } },
    '101 checks': { body: { checks: Array.from({ length: 101 }, () => ({ name: 'a', ok: true })), durationMs: 1 } },
    'name leer': { body: { checks: [{ name: '', ok: true }], durationMs: 1 } },
    'ok fehlt': { body: { checks: [{ name: 'a' }], durationMs: 1 } },
    'durationMs fehlt': { body: { checks: [{ name: 'a', ok: true }] } },
    'durationMs negativ': { body: { checks: [{ name: 'a', ok: true }], durationMs: -1 } },
    'durationMs Kommazahl': { raw: '{"checks":[{"name":"a","ok":true}],"durationMs":1.5}' },
    'unbekanntes Feld': { body: { ...ok1, extra: 1 } },
    'unbekanntes Feld im Check': { body: { checks: [{ name: 'a', ok: true, x: 1 }], durationMs: 1 } },
    'metrics kein Objekt': { body: { ...ok1, metrics: [] } },
  };
  for (const [name, opts] of Object.entries(bad)) isError(await call('POST', '/api/levels/1/result', opts), 400, name);
  r = await call('POST', '/api/levels/1/result', { body: { ...ok1, metrics: null } });
  expect(r.status === 200 && same(r.json?.levels?.[0]?.metrics, {}), 'metrics: null sollte als {} gelten');

  // 404, 405, 413, 415
  for (const pth of ['/api/levels/0', '/api/levels/11', '/api/levels/abc', '/api/unbekannt', '/gibt-es-nicht']) isError(await call('GET', pth), 404, `GET ${pth}`);
  isError(await call('POST', '/api/levels/11/result', { body: ok1 }), 404, 'POST Level 11');
  for (const [m, pth, allow] of [['DELETE', '/api/levels', 'GET'], ['POST', '/api/health', 'GET'], ['GET', '/api/levels/1/result', 'POST'], ['PUT', '/api/levels/1', 'GET']]) {
    const x = await call(m, pth);
    isError(x, 405, `${m} ${pth}`);
    expect((x.allow ?? '').includes(allow), `${m} ${pth}: Allow „${x.allow}“ ohne ${allow}`);
  }
  isError(await call('POST', '/api/levels/1/result', { raw: JSON.stringify({ checks: [{ name: 'x'.repeat(70 * 1024), ok: true }], durationMs: 1 }) }), 413, '70 KB Body');
  isError(await call('POST', '/api/levels/1/result', { body: ok1, type: 'text/plain' }), 415, 'text/plain');
  expect((await call('POST', '/api/levels/1/result', { body: ok1, type: 'application/json; charset=utf-8' })).status === 200, 'charset-Parameter wird abgelehnt');
  // Prüfreihenfolge: ungültiges Level schlägt Methode, Content-Type schlägt Body
  isError(await call('DELETE', '/api/levels/99'), 404, 'Reihenfolge 404 vor 405');
  isError(await call('POST', '/api/levels/1/result', { raw: '{kaputt', type: 'text/plain' }), 415, 'Reihenfolge 415 vor 400');

  add('L3-K2', 'API-Vertrag: Schema, Regeln und Fehlercodes', p.length === 0, p.slice(0, 6).join('; ') + (p.length > 6 ? ` … (+${p.length - 6})` : ''));
  nebenwerte.apiProbleme = p;

  // ---- L3-K3: gleichzeitige Meldungen ----
  const n = 50;
  const results = await Promise.all(Array.from({ length: n }, (_, i) =>
    i % 5 === 4 ? call('GET', '/api/levels') : call('POST', '/api/levels/1/result', { body: { checks: [{ name: `p${i}`, ok: i % 2 === 0 }], durationMs: i } })));
  const errors5xx = results.filter((x) => x.status >= 500).length;
  const final = (await call('GET', '/api/levels')).json;
  const f1 = final?.levels?.[0];
  const consistent = vResults(final) && f1 && ((f1.status === 'bestanden') === f1.checks.every((c) => c.ok)) &&
    final.levels.slice(1).every((l) => l.status === (f1.status === 'bestanden' ? 'offen' : 'gesperrt'));
  add('L3-K3', `${n} gleichzeitige Anfragen: kein 5xx, konsistenter Endzustand`, errors5xx === 0 && consistent,
    [errors5xx && `${errors5xx}× 5xx`, !consistent && 'Endzustand inkonsistent'].filter(Boolean).join('; '));

  // ---- L3-K4: Neustart setzt zurück ----
  run('make', ['down']);
  await down(`${API}/api/health`, 10_000);
  const restart = run('make', ['level3']);
  const back = restart.code === 0 && (await up(`${API}/api/health`, 60_000));
  const afterRestart = back ? (await call('GET', '/api/levels')).json : null;
  add('L3-K4', 'Neustart setzt das Backend auf den Startzustand zurück', back && same(afterRestart?.levels, startState().levels),
    !back ? 'Backend kommt nach Neustart nicht hoch' : '');

  // ---- L3-K5: Go-Qualität ----
  const gomod = fs.readFileSync(path.join(target, 'backend/go.mod'), 'utf8');
  // Bis Level 3 keine Abhängigkeit; ab Level 4 ist genau modernc.org/sqlite v1.62.0 erlaubt (spec/levels/level-04.md)
  const direct = [...gomod.matchAll(/^\s*(?:require\s+)?([\w./-]+)\s+(v[\w.+-]+)\s*$/gm)].map((m) => `${m[1]} ${m[2]}`);
  const noDeps = direct.every((d) => d === 'modernc.org/sqlite v1.62.0');
  const vet = run('go', ['vet', './...'], { cwd: path.join(target, 'backend') });
  const test = run('go', ['test', '-count=1', '-cover', './...'], { cwd: path.join(target, 'backend') });
  const cov = test.out.match(/coverage:\s*([\d.]+)%/);
  nebenwerte.goCoverage = cov ? Number(cov[1]) : null;
  nebenwerte.goTestFiles = fs.readdirSync(path.join(target, 'backend')).filter((f) => f.endsWith('_test.go')).length;
  fs.writeFileSync(path.join(out, 'go-test.log'), vet.out + '\n' + test.out);
  add('L3-K5', 'Go: keine Abhängigkeiten, go vet sauber, go test grün', noDeps && vet.code === 0 && test.code === 0 && nebenwerte.goTestFiles > 0,
    [!noDeps && `unerlaubte Abhängigkeiten: ${JSON.stringify(direct)}`, vet.code !== 0 && 'go vet meldet Probleme', test.code !== 0 && 'go test schlägt fehl', nebenwerte.goTestFiles === 0 && 'keine *_test.go']
      .filter(Boolean).join('; ') || `Abdeckung ${nebenwerte.goCoverage ?? '?'} %`);

  // ---- L3-K6: make check (Level 1–3) ----
  const check = run('make', ['check']);
  fs.writeFileSync(path.join(out, 'make-check-l3.log'), check.out);
  nebenwerte.makeCheckMs = check.ms;
  const data = readJson(distFile);
  const valid = data !== null && vResults(data);
  const names = (k) => (data?.levels?.[k - 1]?.checks ?? []).map((c) => c.name);
  const all3 = [1, 2, 3].every((k) => data?.levels?.[k - 1]?.status === 'bestanden');
  const namesOk = same(names(1), LEVEL1_CHECKS) && same(names(2), LEVEL2_CHECKS) && same(names(3), LEVEL3_CHECKS);
  add('L3-K6', 'make check: Exit 0, schemagültig, Level 1–3 bestanden mit den Checks der Spec', check.code === 0 && valid && all3 && namesOk,
    [check.code !== 0 && `Exit-Code ${check.code}`, !valid && 'Schema verletzt', !all3 && `Status: ${[1, 2, 3].map((k) => data?.levels?.[k - 1]?.status).join('/')}`,
      !namesOk && `Checks L3: ${JSON.stringify(names(3))}`].filter(Boolean).join('; '));
  fs.writeFileSync(path.join(out, 'agent-results-l3.json'), JSON.stringify(data, null, 2));
  nebenwerte.selbstmessung = data?.levels?.[2]?.status ?? null;

  // ---- L3-K7: Startdatei unverändert ----
  const startOk = sha(publicFile) === publicHashBefore && same(readJson(publicFile), startState());
  add('L3-K7', 'public/results.json bleibt im Startzustand', startOk, startOk ? '' : 'Datei verändert');
}

// ---- L3-K8: make down beendet alles ----
run('make', ['down']);
const webDown = await down(`${WEB}/`, 10_000);
const apiDown = await down(`${API}/api/health`, 10_000);
add('L3-K8', 'make down beendet nginx und Backend (8080 und 8081 frei)', webDown && apiDown,
  [!webDown && '8080 antwortet weiterhin', !apiDown && '8081 antwortet weiterhin'].filter(Boolean).join('; '));

const passed = criteria.length === 8 && criteria.every((c) => c.ok);
nebenwerte.fremdmessung = passed ? 'bestanden' : 'fehlgeschlagen';
nebenwerte.abweichung = nebenwerte.selbstmessung !== undefined && (nebenwerte.selbstmessung === 'bestanden') !== passed;
fs.writeFileSync(path.join(out, 'judge-level3.json'), JSON.stringify({ level: 3, passed, checkedAt: new Date().toISOString(), target, criteria, nebenwerte }, null, 2));
console.log(`\nLevel 3 laut Prüfer: ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`);
if (nebenwerte.abweichung) console.log('⚠ Selbstmessung des Agenten weicht vom Prüfer ab');
process.exit(passed ? 0 : 1);
