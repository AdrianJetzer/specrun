// Adapter OpenCode (Version 2): liest die Sitzungs-Datenbank (SQLite, im Container über OPENCODE_DB nach
// <lauf>/protokoll/opencode.db gelenkt) nur lesend und liefert pro Antwort Zeit, Modell, Tokens und Werkzeugaufrufe.
// Aufbau laut Datenbank: session_message (type 'assistant', data.tokens/cost/model/content; Werkzeuge als content-Blöcke 'tool').
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function lesen(ort, { sitzung } = {}) {
  const datei = fs.statSync(ort).isDirectory() ? path.join(ort, 'opencode.db') : ort;
  const db = new DatabaseSync(datei, { readOnly: true });
  try {
    const filter = sitzung ? 'AND m.session_id = ?' : '';
    const zeilen = db.prepare(
      `SELECT m.id, m.time_created AS t, m.data AS data
         FROM session_message m WHERE m.type = 'assistant' ${filter} ORDER BY m.time_created`,
    ).all(...(sitzung ? [sitzung] : []));
    return zeilen.flatMap((z) => {
      let d;
      try { d = JSON.parse(z.data); } catch { return []; }
      const tk = d.tokens ?? {};
      const m = d.model;
      const modell = typeof m === 'string' ? m : m?.providerID && (m.id ?? m.modelID) ? `${m.providerID}/${m.id ?? m.modelID}` : (m?.id ?? '?');
      return [{
        t: Number(z.t),
        modell,
        eingabe: tk.input ?? 0,
        cacheSchreiben5m: tk.cache?.write ?? 0, // OpenCode unterscheidet keine Cache-Dauer
        cacheSchreiben1h: 0,
        cacheLesen: tk.cache?.read ?? 0,
        ausgabe: tk.output ?? 0,
        reasoning: tk.reasoning ?? 0, // bei OpenCode getrennt ausgewiesen
        kostenGemeldet: typeof d.cost === 'number' ? d.cost : null,
        // Werkzeugaufrufe stehen als Blöcke vom Typ 'tool' im Inhalt der Antwort
        werkzeuge: Array.isArray(d.content) ? d.content.filter((c) => c?.type === 'tool').length : 0,
      }];
    });
  } finally {
    db.close();
  }
}
