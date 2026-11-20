// Specrun – Token-Verbrauch eines Laufs, aufgeteilt nach Phasen bis zum jeweils nächsten bestandenen Level.
// Aufruf: node runner/tokens.mjs <protokoll-ordner>   → JSON auf stdout
//
// Quelle: Session-Protokolle von Claude Code (*.jsonl, im Agent-Container unter ~/.claude/projects).
// - Tokens: aus message.usage jeder Antwort des Agenten, je Antwort (message.id) nur einmal gezählt.
// - Phasen: Ein Level gilt als erreicht, sobald die Ausgabe eines Befehls, der „make check“ enthält
//   (direkt oder als Hintergrund-Meldung desselben Befehls), „Level 1: bestanden … Level n: bestanden“
//   durchgehend zeigt. Gelesene Dateien und andere Befehle (z. B. `cat spec/…` mit Beispielen) zählen nicht.
// - Eine Phase reicht vom Ende der vorigen bis zu dem Zeitpunkt, an dem das erreichte Level steigt.
//   Steigt es um mehrere Stufen auf einmal, heißt die Phase z. B. „Level 3–4“.
// Der Bericht enthält nur Zahlen, keine Inhalte aus dem Protokoll.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Aufruf: node runner/tokens.mjs <protokoll-ordner>');
  process.exit(2);
}

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.jsonl')) files.push(p);
  }
};
walk(dir);

const responses = new Map(); // message.id → { t, usage, model, tools }
const commands = new Map(); // tool_use.id → Befehl (nur Bash)
const outputs = []; // { t, text } – nur Ausgaben von Befehlen
const sessions = new Set();
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.sessionId) sessions.add(d.sessionId);
    const t = Date.parse(d.timestamp ?? '');
    if (d.type === 'assistant' && d.message?.id && d.message.usage) {
      const uses = (d.message.content ?? []).filter((c) => c?.type === 'tool_use');
      for (const u of uses) if (u.name === 'Bash') commands.set(u.id, String(u.input?.command ?? ''));
      const tools = uses.length;
      const prev = responses.get(d.message.id);
      if (!prev) responses.set(d.message.id, { t, usage: d.message.usage, model: d.message.model, tools });
      else prev.tools += tools;
    }
    if (d.type === 'user') {
      const r = d.toolUseResult;
      const c = d.message?.content;
      const toolId = Array.isArray(c) ? c.find((x) => x?.type === 'tool_result')?.tool_use_id : undefined;
      if (r && typeof r === 'object' && ('stdout' in r || 'stderr' in r)) outputs.push({ t, id: toolId, text: `${r.stdout ?? ''}\n${r.stderr ?? ''}` });
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === 'string' ? x.text : '')).join('\n') : '';
      if (text.includes('<task-notification>')) outputs.push({ t, id: text.match(/<tool-use-id>([^<]+)<\/tool-use-id>/)?.[1], text });
    }
  }
}

// Erreichtes Level je Befehlsausgabe: höchstes n, für das „Level 1…n: bestanden“ durchgehend vorkommt
const reachedIn = (text) => {
  const passed = new Set([...text.matchAll(/Level (\d+): bestanden/g)].map((m) => Number(m[1])));
  let n = 0;
  while (passed.has(n + 1)) n++;
  return n;
};
const steps = []; // { t, from, to }
let best = 0;
for (const o of outputs.sort((a, b) => a.t - b.t)) {
  if (!/make\s+check\b/.test(commands.get(o.id) ?? '')) continue; // nur Ausgaben von „make check“
  const n = reachedIn(o.text);
  if (n > best) {
    steps.push({ t: o.t, from: best + 1, to: n });
    best = n;
  }
}

const sum = (list) => {
  const tot = { eingabe: 0, cacheSchreiben: 0, cacheLesen: 0, ausgabe: 0 };
  for (const r of list) {
    tot.eingabe += r.usage.input_tokens ?? 0;
    tot.cacheSchreiben += r.usage.cache_creation_input_tokens ?? 0;
    tot.cacheLesen += r.usage.cache_read_input_tokens ?? 0;
    tot.ausgabe += r.usage.output_tokens ?? 0;
  }
  tot.gesamt = tot.eingabe + tot.cacheSchreiben + tot.cacheLesen + tot.ausgabe;
  return tot;
};

const all = [...responses.values()].sort((a, b) => a.t - b.t);
const start = all[0]?.t ?? null;
const end = all.at(-1)?.t ?? null;
const phases = [];
let from = start;
for (const s of steps) {
  const list = all.filter((r) => r.t >= from && r.t <= s.t);
  phases.push({
    phase: s.from === s.to ? `Level ${s.to}` : `Level ${s.from}–${s.to}`,
    bisLevel: s.to,
    dauerS: Math.round((s.t - from) / 1000),
    kumuliertS: Math.round((s.t - start) / 1000),
    antworten: list.length,
    werkzeugaufrufe: list.reduce((n, r) => n + r.tools, 0),
    tokens: sum(list),
    tokensKumuliert: sum(all.filter((r) => r.t <= s.t)),
  });
  from = s.t;
}
const rest = all.filter((r) => r.t > from);
const result = {
  quelle: 'Session-Protokolle von Claude Code',
  dateien: files.length,
  sessions: sessions.size,
  modelle: [...new Set(all.map((r) => r.model).filter(Boolean))],
  start: start ? new Date(start).toISOString() : null,
  ende: end ? new Date(end).toISOString() : null,
  dauerS: start && end ? Math.round((end - start) / 1000) : null,
  antworten: all.length,
  werkzeugaufrufe: all.reduce((n, r) => n + r.tools, 0),
  erreichtesLevel: best,
  gesamt: sum(all),
  phasen: phases,
  danach: rest.length ? { dauerS: Math.round((end - from) / 1000), antworten: rest.length, tokens: sum(rest) } : null,
};
console.log(JSON.stringify(result, null, 2));
