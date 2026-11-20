// Erzeugt runs/<id>/report.md aus meta.json, claude.json und dem Prüfer-Ergebnis.
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
const judge = json('judge/judge-level1.json');
const seconds = Number(read('agent_seconds.txt') ?? NaN);
const timeout = read('agent_timeout.txt') !== null;
const files = (read('files.txt') ?? '').split('\n').filter(Boolean);

// Score: 10 Punkte pro durchgehend bestandenem Level (bisher nur Level 1 prüfbar)
const levelsPassed = judge?.passed ? 1 : 0;
const score = levelsPassed * 10;

const u = claude?.usage ?? {};
const n = (v) => (typeof v === 'number' ? v.toLocaleString('de-CH') : '?');
const fmtS = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)} min ${s % 60} s` : '?');
const nw = judge?.nebenwerte ?? {};

const lines = [
  `# Durchlauf ${meta.runId ?? path.basename(dir)}${meta.fake ? ' (FAKE – Referenz statt Agent)' : ''}`,
  '',
  '| | |',
  '|---|---|',
  `| **Score** | **${score} / 100** (erreichtes Level: ${levelsPassed}) |`,
  `| Spec-Version | ${meta.specVersion ?? '?'} |`,
  `| Modell | ${meta.model ?? '?'} |`,
  `| Claude Code | ${meta.claudeCode ?? '?'} |`,
  `| Start | ${meta.startedAt ?? '?'} |`,
  `| Bauordner | \`${meta.buildDir ?? '?'}\` |`,
  '',
  '## Agent',
  '',
  `- Ergebnis: ${timeout ? '⏱ **Zeitlimit erreicht**' : claude?.subtype ?? (claude ? '?' : 'keine Ausgabe')}${claude?.is_error ? ' (mit Fehler)' : ''}`,
  `- Dauer: ${fmtS(seconds)} (Limit ${meta.timeoutMin ?? '?'} min)`,
  `- Kosten: ${typeof claude?.total_cost_usd === 'number' ? `$${claude.total_cost_usd.toFixed(2)}` : '?'} (Budget $${meta.budgetUsd ?? '?'})`,
  `- Turns: ${claude?.num_turns ?? '?'}`,
  `- Tokens: Eingabe ${n(u.input_tokens)}, Cache-Lesen ${n(u.cache_read_input_tokens)}, Cache-Schreiben ${n(u.cache_creation_input_tokens)}, Ausgabe ${n(u.output_tokens)}`,
  `- Angelegte Dateien: ${files.length}`,
  '',
  '## Level 1 laut Prüfer',
  '',
  judge ? `**${judge.passed ? '✅ bestanden' : '❌ nicht bestanden'}**` : '_kein Prüfer-Ergebnis_',
  '',
  ...(judge?.criteria ?? []).map((c) => `- ${c.ok ? '✅' : '❌'} **${c.id}** ${c.name}${c.detail ? ` – ${c.detail}` : ''}`),
  '',
  '## Selbst- vs. Fremdmessung',
  '',
  `- Agent meldet: ${nw.selbstmessung ?? '–'}`,
  `- Prüfer misst: ${nw.fremdmessung ?? '–'}`,
  `- Abweichung: ${nw.abweichung === undefined ? '–' : nw.abweichung ? '⚠ ja' : 'nein'}`,
  '',
  '## Nebenwerte',
  '',
  `- \`make level1\`: ${nw.makeLevel1Ms ? `${(nw.makeLevel1Ms / 1000).toFixed(1)} s` : '–'}`,
  `- \`make check\`: ${nw.makeCheckMs ? `${(nw.makeCheckMs / 1000).toFixed(1)} s` : '–'}`,
  `- Bundle (dist/assets): ${nw.bundleBytes ? `${(nw.bundleBytes / 1024).toFixed(1)} KB` : '–'}`,
  `- Screenshots: \`judge/screenshots/\` (Optik-Bewertung offen)`,
  '',
  '## Fehlgeschlagene Prüfer-Tests',
  '',
  ...((nw.judgeTests ?? []).filter((t) => !t.ok).map((t) => `- ${t.title}\n  \`${(t.error || '').split('\n')[0].slice(0, 200)}\``)),
  ...((nw.judgeTests ?? []).some((t) => !t.ok) ? [] : ['_keine_']),
  '',
  '## Spec-Lücken (→ nächste Iteration)',
  '',
  '_nach Durchsicht ergänzen_',
  '',
];

fs.writeFileSync(path.join(dir, 'report.md'), lines.join('\n'));
console.log(`Score: ${score} / 100`);
