# 03 – Architektur

## Projektstruktur (im Arbeitsverzeichnis)
```
Makefile
.gitignore                 – node_modules/, dist/, .run/, .out/, test-results/
frontend/
  package.json
  package-lock.json        – durch npm install erzeugt, wird von npm ci benötigt
  index.html
  vite.config.ts
  tsconfig.json
  nginx.conf               – ab Level 2
  public/results.json      – Startzustand: alle 10 Levels „offen“
  src/
    main.tsx
    App.tsx
    results.ts             – Typen, Laden, Prüfen, Auswerten, Formatieren
    styles.css
    components/            – Header.tsx, Summary.tsx, LevelCard.tsx, Notice.tsx
checks/
  package.json
  package-lock.json
  playwright.config.ts
  tests/level1.spec.ts
  tests/level2.spec.ts     – ab Level 2
  write-results.mjs
```

## Frontend
Vite + React + TypeScript, ohne weitere Bibliotheken (kein Router, kein CSS-Framework, keine UI-Bibliothek).

`frontend/package.json`:
```json
{
  "name": "levelboard-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "19.3.1",
    "react-dom": "19.3.1"
  },
  "devDependencies": {
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.3.0",
    "typescript": "7.0.2",
    "vite": "8.3.8"
  }
}
```

`frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 8080, strictPort: true, host: '127.0.0.1' },
});
```

`frontend/tsconfig.json` (eine einzige Datei, keine Projekt-Referenzen):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`frontend/index.html`: `<html lang="de">`, `<meta charset="UTF-8">`, Viewport-Meta, `<meta name="color-scheme" content="dark">`, `<title>Levelboard</title>`, `<div id="root">`, Modul-Script `/src/main.tsx`.

`main.tsx` rendert `<App/>` in `StrictMode` und importiert `styles.css`.

## Prüfsuite
`checks/package.json`:
```json
{
  "name": "levelboard-checks",
  "private": true,
  "type": "module",
  "devDependencies": {
    "@playwright/test": "1.65.1"
  }
}
```

`checks/playwright.config.ts`:
- `testDir: './tests'`, `retries: 0`, `timeout: 15000`
- Reporter: `list` und `json` mit `outputFile: '.out/playwright.json'`
- `use.baseURL`: Umgebungsvariable `BASE_URL`, Standard `http://127.0.0.1:8080`

Was die Suite pro Level prüft und wie sie ihr Ergebnis meldet, steht in der jeweiligen Level-Datei und in `05-datenmodell.md`.

## Makefile – feste Befehle
Der Prüfer nutzt ausschließlich diese Befehle. Sie müssen aus dem Arbeitsverzeichnis heraus funktionieren, wiederholt aufrufbar sein und dürfen nicht interaktiv sein.

| Befehl | Verhalten |
|---|---|
| `make level1` | ruft zuerst `make down` auf. Dann in `frontend/`: `npm ci`, `npm run build`. Danach startet es `vite preview` **im Hintergrund**: Prozessnummer in `.run/frontend.pid`, Ausgabe in `.run/frontend.log`, stdin von `/dev/null`. Es schreibt `1` in die Datei `.run/level`. Es wartet höchstens 60 s, bis `http://127.0.0.1:8080/` antwortet, und gibt dann `Levelboard läuft auf http://127.0.0.1:8080` aus. Antwortet der Port nicht, gibt es die Logs aus `.run/` aus und endet mit Fehlercode. Der Befehl kehrt zurück, während die Seite weiterläuft. |
| `make level2` | ruft zuerst `make down` auf, baut das Frontend wie `level1` und startet dann nginx aus dem Projektordner mit `nginx -p "$(CURDIR)/" -e .run/nginx-error.log -c frontend/nginx.conf`. Vorher legt es `.run/nginx-tmp/` an. nginx schreibt seine Prozessnummer selbst nach `.run/nginx.pid`. Es schreibt `2` nach `.run/level` und wartet wie `level1` auf Port 8080 (gleiche Meldung). |
| `make check` | prüft **alle Levels von 1 bis zum zuletzt gestarteten** (Wert aus `.run/level`; fehlt die Datei: das höchste gebaute Level, derzeit 2). Es installiert die Abhängigkeiten in `checks/`, falls `node_modules` fehlt (`npm ci`), und führt `npx playwright install chromium` aus. Dann lässt es genau die Dateien `tests/level1.spec.ts` … `tests/level<N>.spec.ts` mit `BASE_URL=$(URL)` laufen (Make-Variable `URL`, Standard `http://127.0.0.1:8080`). Danach führt es **immer** `node write-results.mjs 1 … N` aus, auch wenn Tests fehlschlagen. Der Exit-Code ist 0 genau dann, wenn alle Checks bestanden sind. |
| `make down` | beendet die Prozesse aus `.run/frontend.pid` und `.run/nginx.pid`, falls vorhanden, und löscht beide PID-Dateien sowie `.run/level`. Ohne laufenden Prozess ist es ohne Fehler. |

## Ports
| Port | Dienst |
|---|---|
| 8080 | Levelboard-Seite, nur auf `127.0.0.1` (Level 1: `vite preview`, Level 2: nginx) |
