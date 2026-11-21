// Prüfer: eigene Nachrechnung des Verbrauchs pro Level aus dem Session-Protokoll des Agenten
// (Regeln: spec/05-datenmodell.md, „Verbrauch pro Level“). Bewusst unabhängig vom Code des Agenten geschrieben.
import fs from 'node:fs';
import path from 'node:path';

const PREIS = {
  'claude-opus-5-5': [4, 5, 8, 0.2, 20],
  'claude-sonnet-5-5': [2, 2.5, 4, 0.1, 10],
  'claude-haiku-5-5': [0.1, 0.125, 0.2, 0.01, 0.5],
};

function dateien(d, acc = []) {
  if (!fs.existsSync(d)) return acc;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) dateien(p, acc);
    else if (e.name.endsWith('.jsonl')) acc.push(p);
  }
  return acc;
}

function summe(liste) {
  const s = [0, 0, 0, 0, 0];
  let kosten = 0;
  const modelle = new Set();
  for (const { modell, u } of liste) {
    const w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const w5 = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
    const v = [u.input_tokens ?? 0, w5, w1, u.cache_read_input_tokens ?? 0, u.output_tokens ?? 0];
    v.forEach((x, i) => { s[i] += x; });
    modelle.add(modell);
    const p = PREIS[modell];
    kosten += p ? v.reduce((a, x, i) => a + x * p[i], 0) / 1e6 : NaN;
  }
  const iso = (t) => (t === undefined ? null : new Date(t).toISOString());
  return {
    models: [...modelle].sort(), responses: liste.length,
    input: s[0], cacheWrite5m: s[1], cacheWrite1h: s[2], cacheRead: s[3], output: s[4], total: s.reduce((a, b) => a + b, 0),
    costUsd: Math.round(kosten * 100) / 100, from: iso(liste[0]?.t), until: iso(liste.at(-1)?.t),
  };
}

/**
 * Verbrauch je Level aus dem Protokoll im Ordner `dir`.
 * stand: Status je geprüftem Level des zu prüfenden make check, aufsteigend ([{ level, status }]).
 * Ergebnis: { [level]: Token-Objekt | { inLevel } } oder null, wenn es kein Protokoll gibt.
 */
export function phasenVerbrauch(dir, stand) {
  const antworten = new Map();
  const befehle = new Map();
  const ausgaben = [];
  for (const f of dateien(dir)) {
    for (const zeile of fs.readFileSync(f, 'utf8').split('\n')) {
      let d;
      try { d = JSON.parse(zeile); } catch { continue; }
      if (!d || typeof d !== 'object') continue;
      const t = Date.parse(d.timestamp ?? '');
      const m = d.message;
      if (d.type === 'assistant' && m?.id && m.usage) {
        for (const c of Array.isArray(m.content) ? m.content : []) if (c?.type === 'tool_use' && c.name === 'Bash') befehle.set(c.id, String(c.input?.command ?? ''));
        if (m.model !== '<synthetic>' && !antworten.has(m.id)) antworten.set(m.id, { t, modell: m.model, u: m.usage });
      }
      if (d.type === 'user') {
        const inhalt = m?.content;
        const r = d.toolUseResult;
        if (r && typeof r === 'object' && ('stdout' in r || 'stderr' in r)) {
          const id = Array.isArray(inhalt) ? inhalt.find((x) => x?.type === 'tool_result')?.tool_use_id : undefined;
          ausgaben.push({ t, id, text: `${r.stdout ?? ''}\n${r.stderr ?? ''}` });
        }
        const text = typeof inhalt === 'string' ? inhalt : Array.isArray(inhalt) ? inhalt.map((x) => (typeof x?.text === 'string' ? x.text : '')).join('\n') : '';
        if (text.includes('<task-notification>')) ausgaben.push({ t, id: /<tool-use-id>([^<]+)<\/tool-use-id>/.exec(text)?.[1], text });
      }
    }
  }
  const liste = [...antworten.values()].sort((a, b) => a.t - b.t);
  if (liste.length === 0) return null;

  const grenzen = [];
  let beste = 0;
  for (const a of ausgaben.sort((x, y) => x.t - y.t)) {
    if (!/make\s+check\b/.test(befehle.get(a.id) ?? '')) continue;
    const ok = new Set([...a.text.matchAll(/Level (\d+): bestanden/g)].map((x) => Number(x[1])));
    let n = 0;
    while (ok.has(n + 1)) n++;
    if (n > beste) { grenzen.push({ t: a.t, von: beste + 1, bis: n }); beste = n; }
  }

  const erg = {};
  const setze = (von, bis, teil) => { erg[bis] = summe(teil); for (let n = von; n < bis; n++) erg[n] = { inLevel: bis }; };
  let vorher = -Infinity;
  for (const g of grenzen) { setze(g.von, g.bis, liste.filter((x) => x.t > vorher && x.t <= g.t)); vorher = g.t; }
  const rest = liste.filter((x) => x.t > vorher);
  let jetzt = 0;
  for (const l of stand) { if (l.status !== 'bestanden') break; jetzt = l.level; }
  const fehler = stand.find((l) => l.status === 'fehlgeschlagen');
  if (jetzt > beste) {
    setze(beste + 1, jetzt, rest);
    if (fehler && fehler.level > beste) erg[fehler.level] = summe([]);
  } else if (fehler && fehler.level > beste) erg[fehler.level] = summe(rest);
  const geprueft = new Set(stand.filter((l) => l.status === 'bestanden' || l.status === 'fehlgeschlagen').map((l) => l.level));
  for (const k of Object.keys(erg)) if (!geprueft.has(Number(k))) delete erg[k];
  return erg;
}
