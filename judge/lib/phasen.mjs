// Prüfer: eigene Nachrechnung des Verbrauchs pro Level aus dem Session-Protokoll des Agenten
// (Regeln: spec/05-datenmodell.md, „Verbrauch pro Level“). Bewusst unabhängig vom Code des Agenten geschrieben.
import fs from 'node:fs';
import path from 'node:path';

// [Eingabe, Cache schreiben 5 min, 1 h, Cache lesen, Ausgabe] in USD pro Mio. Tokens
const PREIS = {
  'claude-opus-5-5': [4, 5, 8, 0.2, 20],
  'claude-sonnet-5-5': [2, 2.5, 4, 0.1, 10],
  'claude-haiku-5-5': [0.1, 0.125, 0.2, 0.01, 0.5],
};
// Haiku 5.5 ab Spec 1.4.0: Anfragen mit Prompt über 100'000 Tokens (Eingabe + Cache) zahlen die höheren Preise
const PREIS_LANG = { 'claude-haiku-5-5': { ab: 100_000, preis: [0.5, 0.625, 1, 0.05, 2.5] } };
let preisstufen = true;
/** Für Läufe vor Spec 1.4.0: Haiku immer zum Grundpreis rechnen (wie deren Spec es vorschrieb). */
export function setzePreisstufen(an) { preisstufen = an; }
export function hatPreisstufen(target) {
  const v = specVersion(target);
  return !v || v[0] > 1 || (v[0] === 1 && v[1] >= 4);
}

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
    const lang = preisstufen ? PREIS_LANG[modell] : undefined;
    const p = lang && v[0] + v[1] + v[2] + v[3] > lang.ab ? lang.preis : PREIS[modell];
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
/** Spec-Version des Laufs aus <ziel>/spec/00-start.md, z. B. [1, 2, 0]; unbekannt: null. */
export function specVersion(target) {
  try {
    const m = /Spec-Version:\*\*\s*(\d+)\.(\d+)\.(\d+)/.exec(fs.readFileSync(path.join(target, 'spec/00-start.md'), 'utf8'));
    return m ? m.slice(1).map(Number) : null;
  } catch { return null; }
}

/** Bauzeit (buildS) gibt es erst ab Spec 1.3.0; für ältere Läufe wird sie aus der Nachrechnung entfernt. */
export function hatBauzeit(target) {
  const v = specVersion(target);
  return !v || v[0] > 1 || (v[0] === 1 && v[1] >= 3);
}
/** Verbrauch nachtragen (GET/PUT /api/usage, Tokens und Kosten im Bericht) erst ab Spec 2.1.0. */
export function hatVerbrauch(target) {
  const v = specVersion(target);
  return !v || v[0] > 2 || (v[0] === 2 && v[1] >= 1);
}
export function ohneBauzeit(erg) {
  if (!erg) return erg;
  return Object.fromEntries(Object.entries(erg).map(([k, t]) => [k, t && 'buildS' in t ? Object.fromEntries(Object.entries(t).filter(([f]) => f !== 'buildS')) : t]));
}

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
  // Bauzeit: Beginn = Ende der vorigen Phase (bei der ersten: erste Antwort), Ende = letzte Antwort der Phase
  const mitBau = (teil, beginn) => ({ ...summe(teil), buildS: teil.length ? Math.round((teil[teil.length - 1].t - beginn) / 1000) : 0 });
  const setze = (von, bis, teil, beginn) => { erg[bis] = mitBau(teil, beginn); for (let n = von; n < bis; n++) erg[n] = { inLevel: bis }; };
  let vorher = -Infinity;
  for (const g of grenzen) { setze(g.von, g.bis, liste.filter((x) => x.t > vorher && x.t <= g.t), vorher === -Infinity ? liste[0].t : vorher); vorher = g.t; }
  const rest = liste.filter((x) => x.t > vorher);
  const restBeginn = vorher === -Infinity ? liste[0].t : vorher;
  let jetzt = 0;
  for (const l of stand) { if (l.status !== 'bestanden') break; jetzt = l.level; }
  const fehler = stand.find((l) => l.status === 'fehlgeschlagen');
  if (jetzt > beste) {
    setze(beste + 1, jetzt, rest, restBeginn);
    if (fehler && fehler.level > beste) erg[fehler.level] = mitBau([], restBeginn);
  } else if (fehler && fehler.level > beste) erg[fehler.level] = mitBau(rest, restBeginn);
  const geprueft = new Set(stand.filter((l) => l.status === 'bestanden' || l.status === 'fehlgeschlagen').map((l) => l.level));
  for (const k of Object.keys(erg)) if (!geprueft.has(Number(k))) delete erg[k];
  return erg;
}
