// Erzeugt runs/<id>/report.md aus meta.json, claude.json bzw. cost.txt und den Prüfer-Ergebnissen.
// Aufruf: node runner/report.mjs <run-dir>
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '');
const read = (f) => {
  try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return null; }
};
const json = (f) => {
  try { return JSON.parse(read(f)); } catch { return null; }
};

const meta = json('meta.json') ?? {};
const claude = json('claude.json');
const cost = read('cost.txt');
const tok = json('tokens.json');
const summary = json('judge/judge-summary.json');
const levelResults = [];
for (let n = 1; n <= 10; n++) {
  const r = json(`judge/judge-level${n}.json`);
  if (r) levelResults.push(r);
}
// Alte Läufe (nur Level 1, ohne Zusammenfassung) weiterhin auswerten
const reached = summary?.reachedLevel ?? (levelResults[0]?.passed ? 1 : 0);
const score = reached * 10;

const seconds = Number(read('agent_seconds.txt') ?? NaN);
const timeout = read('agent_timeout.txt') !== null;
const files = (read('files.txt') ?? '').split('\n').filter(Boolean);
const u = claude?.usage ?? {};
const n = (v) => (typeof v === 'number' ? v.toLocaleString('de-CH') : '?');
const fmtS = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)} min ${s % 60} s` : '?');

const agentLines = claude
  ? [
      `- Ergebnis: ${timeout ? '⏱ **Zeitlimit erreicht**' : claude.subtype ?? '?'}${claude.is_error ? ' (mit Fehler)' : ''}`,
      `- Dauer: ${fmtS(seconds)} (Limit ${meta.timeoutMin ?? '?'} min)`,
      `- Kosten: ${typeof claude.total_cost_usd === 'number' ? `$${claude.total_cost_usd.toFixed(2)}` : '?'} (Budget $${meta.budgetUsd ?? '?'})`,
      `- Turns: ${claude.num_turns ?? '?'}`,
      `- Tokens: Eingabe ${n(u.input_tokens)}, Cache-Lesen ${n(u.cache_read_input_tokens)}, Cache-Schreiben ${n(u.cache_creation_input_tokens)}, Ausgabe ${n(u.output_tokens)}`,
    ]
  : tok
    ? [
        `- Modell: ${tok.modelle.join(', ') || '?'}`,
        `- Dauer der Session: ${fmtS(tok.dauerS)}; ${tok.antworten} Antworten, ${tok.werkzeugaufrufe} Werkzeugaufrufe`,
        `- Tokens gesamt: ${n(tok.gesamt.gesamt)} (Eingabe ${n(tok.gesamt.eingabe)}, Cache-Schreiben ${n(tok.gesamt.cacheSchreiben)}, Cache-Lesen ${n(tok.gesamt.cacheLesen)}, Ausgabe ${n(tok.gesamt.ausgabe)})`,
        `- Laut eigener Prüfsuite erreicht: Level ${tok.erreichtesLevel}`,
      ]
  : cost
    ? ['- Ausgabe von `/cost`:', '', '```', cost, '```']
    : ['- Kosten, Tokens und Dauer: _nicht erfasst_'];

const lines = [
  `# Durchlauf ${meta.runId ?? path.basename(dir)}${meta.fake ? ' (FAKE – Referenz statt Agent)' : ''}`,
  '',
  '| | |',
  '|---|---|',
  `| **Score** | **${score} / 100** (erreichtes Level: ${reached}) |`,
  `| Spec-Version | ${meta.specVersion ?? '?'} |`,
  `| Modell | ${meta.model ?? '?'} |`,
  ...(meta.claudeCode ? [`| Claude Code | ${meta.claudeCode} |`] : []),
  `| Bauordner | \`${meta.buildDir ?? '?'}\` |`,
  ...(meta.notes ? [`| Hinweis | ${meta.notes} |`] : []),
  '',
  '## Agent',
  '',
  ...agentLines,
  `- Angelegte Dateien: ${files.length}`,
  '',
];

if (tok?.phasen?.length) {
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '–');
  lines.push(
    '## Tokens pro Level',
    '',
    'Eine Phase reicht bis zu dem Zeitpunkt, an dem `make check` des Agenten das nächste Level erstmals bestanden meldet. „Gesamt“ enthält Cache-Lesen, also den wiederholt mitgeschickten Gesprächsverlauf.',
    '',
    '| Phase | Dauer | kumuliert | Antworten | Werkzeugaufrufe | Ausgabe-Tokens | Anteil Ausgabe | Tokens gesamt |',
    '|---|---|---|---|---|---|---|---|',
    ...tok.phasen.map((p) => `| ${p.phase} | ${fmtS(p.dauerS)} | ${fmtS(p.kumuliertS)} | ${p.antworten} | ${p.werkzeugaufrufe} | ${n(p.tokens.ausgabe)} | ${pct(p.tokens.ausgabe, tok.gesamt.ausgabe)} | ${n(p.tokens.gesamt)} |`),
    ...(tok.danach ? [`| danach | ${fmtS(tok.danach.dauerS)} | – | ${tok.danach.antworten} | – | ${n(tok.danach.tokens.ausgabe)} | ${pct(tok.danach.tokens.ausgabe, tok.gesamt.ausgabe)} | ${n(tok.danach.tokens.gesamt)} |`] : []),
    `| **Summe** | ${fmtS(tok.dauerS)} | | ${tok.antworten} | ${tok.werkzeugaufrufe} | ${n(tok.gesamt.ausgabe)} | 100 % | ${n(tok.gesamt.gesamt)} |`,
    '',
  );
}

for (const r of levelResults) {
  const nw = r.nebenwerte ?? {};
  lines.push(
    `## Level ${r.level} laut Prüfer: ${r.passed ? '✅ bestanden' : '❌ nicht bestanden'}`,
    '',
    ...(r.criteria ?? []).map((c) => `- ${c.ok ? '✅' : '❌'} **${c.id}** ${c.name}${c.detail ? ` – ${c.detail}` : ''}`),
    '',
    `Selbstmessung: ${nw.selbstmessung ?? '–'} · Fremdmessung: ${nw.fremdmessung ?? '–'} · Abweichung: ${nw.abweichung === undefined ? '–' : nw.abweichung ? '⚠ ja' : 'nein'}`,
    '',
  );
  const failed = (nw.judgeTests ?? []).filter((t) => !t.ok);
  if (failed.length) {
    lines.push('Fehlgeschlagene Prüfer-Tests:', ...failed.map((t) => `- ${t.title}\n  \`${(t.error || '').split('\n')[0].slice(0, 200)}\``), '');
  }
}

const nw1 = levelResults[0]?.nebenwerte ?? {};
const nw2 = levelResults[1]?.nebenwerte ?? {};
const nw3 = levelResults[2]?.nebenwerte ?? {};
const nw4 = levelResults[3]?.nebenwerte ?? {};
const nw5 = levelResults[4]?.nebenwerte ?? {};
const nw6 = levelResults[5]?.nebenwerte ?? {};
const nw7 = levelResults[6]?.nebenwerte ?? {};
lines.push(
  '## Nebenwerte',
  '',
  `- \`make level1\`: ${nw1.makeLevel1Ms ? `${(nw1.makeLevel1Ms / 1000).toFixed(1)} s` : '–'}`,
  ...(nw2.makeLevel2Ms ? [`- \`make level2\`: ${(nw2.makeLevel2Ms / 1000).toFixed(1)} s`] : []),
  ...(nw3.makeLevel3Ms ? [`- \`make level3\`: ${(nw3.makeLevel3Ms / 1000).toFixed(1)} s`] : []),
  ...(nw4.makeLevel4Ms ? [`- \`make level4\`: ${(nw4.makeLevel4Ms / 1000).toFixed(1)} s`] : []),
  ...(nw5.makeLevel5Ms ? [`- \`make level5\`: ${(nw5.makeLevel5Ms / 1000).toFixed(1)} s`] : []),
  ...(nw6.repo ? [`- Repo: https://github.com/${nw6.repo}`] : []),
  ...(nw6.pipelineLaeufe ? [`- Pipeline-Läufe: ${nw6.pipelineLaeufe}${nw6.pipelineDauerS ? `, letzter Lauf ${nw6.pipelineDauerS} s` : ''}, Commits: ${nw6.commits ?? '?'}`] : []),
  ...(nw7.imageGroessenMB ? [`- Image-Größen (komprimiert): Frontend ${nw7.imageGroessenMB.frontend ?? '?'} MB, Backend ${nw7.imageGroessenMB.backend ?? '?'} MB${nw7.imagesJobS ? `; Job images ${nw7.imagesJobS} s` : ''}`] : []),
  ...(nw5.liveVerzoegerungMs ? [`- Live-Anzeige: erste Änderung nach ${(nw5.liveVerzoegerungMs / 1000).toFixed(1)} s sichtbar`] : []),
  ...((nw4.goCoverage ?? nw3.goCoverage) !== undefined ? [`- Go-Testabdeckung: ${(nw4.goCoverage ?? nw3.goCoverage) ?? '?'} % (${(nw4.goTestFiles ?? nw3.goTestFiles) ?? '?'} Testdateien)`] : []),
  `- \`make check\`: ${(nw5.makeCheckMs ?? nw4.makeCheckMs ?? nw3.makeCheckMs ?? nw2.makeCheckMs ?? nw1.makeCheckMs) ? `${((nw5.makeCheckMs ?? nw4.makeCheckMs ?? nw3.makeCheckMs ?? nw2.makeCheckMs ?? nw1.makeCheckMs) / 1000).toFixed(1)} s` : '–'}`,
  `- Bundle (dist/assets): ${nw1.bundleBytes ? `${(nw1.bundleBytes / 1024).toFixed(1)} KB` : '–'}`,
  '- Screenshots: `judge/screenshots/` (Optik-Bewertung offen)',
  '',
  '## Spec-Lücken (→ nächste Iteration)',
  '',
  '_nach Durchsicht ergänzen_',
  '',
);

fs.writeFileSync(path.join(dir, 'report.md'), lines.join('\n'));
console.log(`Score: ${score} / 100`);
