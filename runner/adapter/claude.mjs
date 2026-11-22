// Adapter Claude Code: liest die Session-Protokolle (*.jsonl unter dem Protokoll-Ordner) und liefert
// pro Antwort Zeit, Modell, Tokens und Anzahl Werkzeugaufrufe im neutralen Format von runner/verbrauch.mjs.
import fs from 'node:fs';
import path from 'node:path';

function dateien(d, acc = []) {
  if (!fs.existsSync(d)) return acc;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) dateien(p, acc);
    else if (e.name.endsWith('.jsonl')) acc.push(p);
  }
  return acc;
}

export function lesen(dir) {
  const antworten = new Map();
  for (const f of dateien(dir)) {
    for (const zeile of fs.readFileSync(f, 'utf8').split('\n')) {
      let d;
      try { d = JSON.parse(zeile); } catch { continue; }
      const m = d?.type === 'assistant' ? d.message : null;
      if (!m?.id || !m.usage || m.model === '<synthetic>') continue;
      const werkzeuge = (Array.isArray(m.content) ? m.content : []).filter((c) => c?.type === 'tool_use').length;
      const vorher = antworten.get(m.id);
      if (vorher) { vorher.werkzeuge += werkzeuge; continue; } // dieselbe Antwort steht in mehreren Zeilen
      const u = m.usage;
      antworten.set(m.id, {
        t: Date.parse(d.timestamp),
        modell: m.model,
        eingabe: u.input_tokens ?? 0,
        cacheSchreiben5m: u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0),
        cacheSchreiben1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
        cacheLesen: u.cache_read_input_tokens ?? 0,
        ausgabe: u.output_tokens ?? 0, // enthält bei Claude das Nachdenken
        reasoning: 0,
        kostenGemeldet: null,
        werkzeuge,
      });
    }
  }
  return [...antworten.values()].sort((a, b) => a.t - b.t);
}
