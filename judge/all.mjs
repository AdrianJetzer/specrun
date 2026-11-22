// Prüft alle Levels nacheinander und bricht beim ersten nicht bestandenen ab.
// Aufruf: node all.mjs <ziel-ordner> [ausgabe-ordner] [höchstes-level]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [targetArg, outArg, maxArg] = process.argv.slice(2);
if (!targetArg) {
  console.error('Aufruf: node all.mjs <ziel-ordner> [ausgabe-ordner] [höchstes-level]');
  process.exit(2);
}
const target = path.resolve(targetArg);
const out = path.resolve(outArg ?? path.join(here, '.out'));
const available = fs.readdirSync(here).map((f) => Number(/^level(\d+)\.mjs$/.exec(f)?.[1])).filter(Boolean).sort((a, b) => a - b);
const max = Number(maxArg ?? Math.max(...available));
fs.mkdirSync(out, { recursive: true });

let reached = 0;
const levels = [];
for (const n of available.filter((n) => n <= max)) {
  console.log(`\n════════ Level ${n} ════════`);
  const r = spawnSync('node', [path.join(here, `level${n}.mjs`), target, out], { stdio: 'inherit' });
  let res;
  try {
    res = JSON.parse(fs.readFileSync(path.join(out, `judge-level${n}.json`), 'utf8'));
  } catch {
    // Prüfer für dieses Level ist abgestürzt: Level gilt als nicht bestanden, Lauf bleibt auswertbar
    console.log(`❌ Prüfer für Level ${n} ist abgebrochen (Exit-Code ${r.status}) – Level gilt als nicht bestanden`);
    res = { level: n, passed: false, criteria: [{ id: `L${n}-ABBRUCH`, name: 'Prüfer abgebrochen', ok: false, detail: `Exit-Code ${r.status}` }], nebenwerte: {} };
    fs.writeFileSync(path.join(out, `judge-level${n}.json`), JSON.stringify(res, null, 2));
  }
  levels.push({ level: n, passed: res.passed });
  if (r.status !== 0 || !res.passed) break;
  reached = n;
}
// Nebenwert: Verbrauch pro Level laut Agent (results.json aus dem letzten make check) gegen die eigene Nachrechnung
let tokens = null;
try {
  const data = JSON.parse(fs.readFileSync(path.join(target, 'frontend/dist/results.json'), 'utf8'));
  const { phasenVerbrauch, hatBauzeit, ohneBauzeit, hatPreisstufen, setzePreisstufen, specVersion } = await import('./lib/phasen.mjs');
  // Ab Spec 2.0.0 meldet der Agent keine Tokens mehr; der Vergleich entfällt (Tokens kommen vom Adapter im Runner)
  if ((specVersion(target)?.[0] ?? 2) >= 2) throw new Error('ab 2.0.0 kein Token-Vergleich');
  setzePreisstufen(hatPreisstufen(target));
  const roh = phasenVerbrauch(process.env.SPECRUN_PROTOKOLL ?? '/lauf/protokoll', data.levels.filter((l) => l.checkedAt).map((l) => ({ level: l.level, status: l.status })));
  const own = hatBauzeit(target) ? roh : ohneBauzeit(roh);
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  if (own) tokens = { abweichendeLevels: data.levels.filter((l) => l.checkedAt && JSON.stringify(canon(l.metrics?.tokens)) !== JSON.stringify(canon(own[l.level]))).map((l) => l.level), pruefer: own };
} catch {}
const summary = { reachedLevel: reached, score: reached * 10, maxChecked: max, levels, tokens, checkedAt: new Date().toISOString() };
fs.writeFileSync(path.join(out, 'judge-summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nErreichtes Level laut Prüfer: ${reached} → Score ${reached * 10} / 100`);
