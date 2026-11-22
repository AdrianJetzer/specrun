// Specrun – wandelt den gemessenen Verbrauch (tokens.json von runner/verbrauch.mjs) in das Format von
// PUT /api/usage (Spec 2.1.0, 05-datenmodell.md „Verbrauch“).
// Aufruf: node runner/usage.mjs <tokens.json>  → JSON auf stdout
// - total: ganzer Lauf (inkl. der Arbeit nach dem letzten make check)
// - levels: pro Phase beim höchsten Level die Werte, die Levels davor der Phase { inLevel }
import fs from 'node:fs';

const datei = process.argv[2];
if (!datei) {
  console.error('Aufruf: node runner/usage.mjs <tokens.json>');
  process.exit(2);
}
const t = JSON.parse(fs.readFileSync(datei, 'utf8'));
if (!t.harness || !t.gesamt || !Array.isArray(t.phasen) || t.phasen.some((p) => typeof p.bisLevel !== 'number')) {
  console.error(`✖ ${datei} ist nicht im Format von runner/verbrauch.mjs (ab Spec 2.0.0)`);
  process.exit(1);
}
const zahlen = (s) => ({ output: s.ausgabe, total: s.gesamt, costUsd: s.kostenUsd ?? null });
const levels = {};
let ab = 1;
for (const p of [...t.phasen].sort((a, b) => a.bisLevel - b.bisLevel)) {
  for (let n = ab; n < p.bisLevel; n++) levels[n] = { inLevel: p.bisLevel };
  levels[p.bisLevel] = zahlen(p.tokens);
  ab = p.bisLevel + 1;
}
console.log(JSON.stringify({
  harness: t.harness ?? null,
  models: t.modelle ?? [],
  measuredAt: new Date().toISOString(),
  total: zahlen(t.gesamt),
  levels,
}, null, 2));
