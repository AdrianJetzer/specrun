// Specrun – Tokens und Kosten eines Laufs, unabhängig vom Agent-Harness (ab Spec 2.0.0).
// Aufruf: node runner/verbrauch.mjs --harness <claude|opencode> --protokoll <ordner|datei> --bauzeit <bauzeit.json> [--preise <datei>]
// → JSON auf stdout (gleiches Format wie runner/tokens.mjs, ergänzt um Harness, Reasoning und Kosten).
//
// - Der Adapter des Harness (runner/adapter/<harness>.mjs) liefert pro Antwort Zeit, Modell, Tokens, Werkzeugaufrufe.
// - Die Phasen kommen aus bauzeit.json des Agenten: Eine Phase endet beim passedAt eines Levels mit eigener Bauzeit;
//   Levels mit inLevel gehören zur Phase des Levels, in dem sie enthalten sind.
// - Kosten aus runner/preise.json, pro Antwort (inkl. Preisstufe bei langem Prompt). Unbekanntes Modell → null.
// - „Ausgabe“ zählt das Nachdenken mit (Claude weist es nicht getrennt aus); „reasoning“ zeigt den getrennten Anteil.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const harness = arg('harness', 'claude');
const protokoll = arg('protokoll');
const bauzeitDatei = arg('bauzeit');
const preise = JSON.parse(fs.readFileSync(arg('preise', path.join(here, 'preise.json')), 'utf8'));
if (!protokoll || !fs.existsSync(protokoll)) {
  console.error('Aufruf: node runner/verbrauch.mjs --harness <claude|opencode> --protokoll <ordner|datei> --bauzeit <bauzeit.json>');
  process.exit(2);
}
const { lesen } = await import(`./adapter/${harness}.mjs`);
const antworten = lesen(protokoll);
let bauzeit = { start: null, levels: {} };
try { bauzeit = JSON.parse(fs.readFileSync(bauzeitDatei, 'utf8')); } catch {}

/** Kosten einer Antwort in USD oder null (unbekanntes Modell). */
function kosten(a) {
  const p0 = preise[a.modell];
  if (!p0) return null;
  const prompt = a.eingabe + a.cacheSchreiben5m + a.cacheSchreiben1h + a.cacheLesen;
  const p = p0.lang && prompt > p0.langAb ? p0.lang : p0;
  return (a.eingabe * p.eingabe + a.cacheSchreiben5m * p.cacheSchreiben5m + a.cacheSchreiben1h * p.cacheSchreiben1h
    + a.cacheLesen * p.cacheLesen + (a.ausgabe + a.reasoning) * p.ausgabe) / 1e6;
}

function summe(liste) {
  const s = { eingabe: 0, cacheSchreiben: 0, cacheLesen: 0, ausgabe: 0, reasoning: 0 };
  let k = 0;
  let unbekannt = false;
  for (const a of liste) {
    s.eingabe += a.eingabe;
    s.cacheSchreiben += a.cacheSchreiben5m + a.cacheSchreiben1h;
    s.cacheLesen += a.cacheLesen;
    s.ausgabe += a.ausgabe + a.reasoning;
    s.reasoning += a.reasoning;
    const c = kosten(a);
    if (c === null) unbekannt = true;
    else k += c;
  }
  s.gesamt = s.eingabe + s.cacheSchreiben + s.cacheLesen + s.ausgabe;
  s.kostenUsd = unbekannt ? null : Math.round(k * 100) / 100;
  const gemeldet = liste.map((a) => a.kostenGemeldet).filter((x) => typeof x === 'number');
  s.kostenGemeldetUsd = gemeldet.length ? Math.round(gemeldet.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  return s;
}

// Phasengrenzen aus bauzeit.json: Levels mit eigener Bauzeit, aufsteigend
const grenzen = Object.entries(bauzeit.levels ?? {})
  .filter(([, e]) => typeof e?.buildS === 'number')
  .map(([n, e]) => ({ level: Number(n), t: Date.parse(e.passedAt) }))
  .sort((a, b) => a.level - b.level);
const start = antworten[0]?.t ?? null;
const ende = antworten.at(-1)?.t ?? null;
const phasen = [];
let von = -Infinity;
let ab = 1;
for (const g of grenzen) {
  const liste = antworten.filter((a) => a.t > von && a.t <= g.t);
  phasen.push({
    phase: ab === g.level ? `Level ${g.level}` : `Level ${ab}–${g.level}`,
    bisLevel: g.level,
    dauerS: Math.round((g.t - (von === -Infinity ? Date.parse(bauzeit.start ?? '') || start : von)) / 1000),
    kumuliertS: Math.round((g.t - (Date.parse(bauzeit.start ?? '') || start)) / 1000),
    antworten: liste.length,
    werkzeugaufrufe: liste.reduce((n, a) => n + a.werkzeuge, 0),
    tokens: summe(liste),
  });
  von = g.t;
  ab = g.level + 1;
}
const rest = antworten.filter((a) => a.t > von);
console.log(JSON.stringify({
  quelle: `Protokoll des Harness (${harness}), Phasen aus bauzeit.json`,
  harness,
  modelle: [...new Set(antworten.map((a) => a.modell))],
  start: start ? new Date(start).toISOString() : null,
  ende: ende ? new Date(ende).toISOString() : null,
  dauerS: start && ende ? Math.round((ende - start) / 1000) : null,
  antworten: antworten.length,
  werkzeugaufrufe: antworten.reduce((n, a) => n + a.werkzeuge, 0),
  erreichtesLevel: grenzen.at(-1)?.level ?? 0,
  gesamt: summe(antworten),
  phasen,
  danach: rest.length && grenzen.length ? { dauerS: Math.round((ende - von) / 1000), antworten: rest.length, tokens: summe(rest) } : null,
}, null, 2));
