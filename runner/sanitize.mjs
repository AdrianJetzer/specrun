// Entfernt persönliche, lokale Pfade aus allen Textdateien eines Laufordners,
// damit Laufberichte gefahrlos in ein öffentliches Repo können.
//   <Specrun-Ordner>  → <specrun>
//   <Home-Ordner>     → ~
//   /private/tmp/…, /tmp/… (temporäre Ordner) → <tmp>/…
//   Benutzername (übrige Vorkommen) → <user>
// Aufruf: node runner/sanitize.mjs <run-dir> <specrun-root>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [dir, root] = process.argv.slice(2).map((p) => path.resolve(p ?? ''));
if (!process.argv[2] || !process.argv[3]) {
  console.error('Aufruf: node runner/sanitize.mjs <run-dir> <specrun-root>');
  process.exit(2);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Reihenfolge wichtig: längster/spezifischster Pfad zuerst
const rules = [
  [new RegExp(esc(root), 'g'), '<specrun>'],
  [new RegExp(esc(os.homedir()), 'g'), '~'],
  [/\/private\/tmp\//g, '<tmp>/'],
  [/(?<![\w.~])\/tmp\//g, '<tmp>/'],
  // Benutzername auch dort, wo er in kodierten Pfaden steckt (z. B. „-Users-<name>-“)
  [new RegExp(esc(os.userInfo().username), 'g'), '<user>'],
];

const TEXT = /\.(md|json|log|txt|ya?ml)$/i;
let changed = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (TEXT.test(e.name)) {
      const before = fs.readFileSync(p, 'utf8');
      let after = before;
      for (const [re, rep] of rules) after = after.replace(re, rep);
      if (after !== before) {
        fs.writeFileSync(p, after);
        changed++;
      }
    }
  }
};
walk(dir);
console.log(`Pfade bereinigt in ${changed} Datei(en)`);
