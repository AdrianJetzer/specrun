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
  const res = JSON.parse(fs.readFileSync(path.join(out, `judge-level${n}.json`), 'utf8'));
  levels.push({ level: n, passed: res.passed });
  if (r.status !== 0 || !res.passed) break;
  reached = n;
}
const summary = { reachedLevel: reached, score: reached * 10, maxChecked: max, levels, checkedAt: new Date().toISOString() };
fs.writeFileSync(path.join(out, 'judge-summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nErreichtes Level laut Prüfer: ${reached} → Score ${reached * 10} / 100`);
