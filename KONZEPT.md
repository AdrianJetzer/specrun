# Konzept: Specrun – „Levelboard“, eine App, die sich selbst misst

**Stand:** 2026-11-20 · **Status:** Entwurf v3 (Fragerunde 3 eingearbeitet), noch nichts gebaut

## Namen

| Ebene | Name |
|---|---|
| Experiment (Spec, Prüfer, Runner – unser Projekt) | **Specrun** |
| Produkt, das der Agent baut | **Levelboard** |
| GitHub-Test-Organisation (Sandkasten für die Agenten) | **`specrun-lab`** (Verfügbarkeit noch prüfen) |
| Repo pro Durchlauf | `levelboard-<durchlauf-id>` |
| Images | `ghcr.io/specrun-lab/levelboard-frontend`, `…/levelboard-backend` |
| Live-Adresse | `levelboard.<deine-domain>` |

Unser Projekt und die Repos der Agenten sind strikt getrennt. Die Agenten sehen Specrun nie.

---

## 1. Idee in drei Sätzen

Ein Coding-Agent bekommt **nur eine Spezifikation** und muss ohne Rückfragen einen Pfad aus **10 Levels** meistern: von einer statischen Seite bis zu einer live deployten Anwendung mit Frontend, Backend, Datenbank, Docker und CI/CD.
Das Produkt, das er dabei baut, ist zugleich die **Anzeigetafel für seine eigene Leistung**: Die Seite zeigt die 10 Levels und ihre Messergebnisse.
Ein **unabhängiger Prüfer** misst danach nach, ob die Levels wirklich geschafft sind. Nur sein Urteil zählt für den Score.

---

## 2. Rollen

| Rolle | Wer | Sieht was | Aufgabe |
|---|---|---|---|
| **Spezifikation** | wir (hier, iterativ) | – | beschreibt Produkt, Levels, Schnittstellen und Prüfregeln vollständig |
| **Coding-Agent** | frische `claude -p`-Session | nur `spec/` und die Startausrüstung | baut Level für Level, schreibt eigene Prüfskripte und meldet seine Ergebnisse |
| **Levelboard** | das gebaute Produkt | – | zeigt die 10 Levels mit Status und Metriken an |
| **Prüfer** | Skripte hier im Repo, für den Agenten unsichtbar | das Ergebnis des Agenten (Ordner, Repo, URL) | prüft jedes Level unabhängig, bricht beim ersten Fehler ab, berechnet den Score |

**Grundsatz:** Die Selbstmessung des Agenten ist das Schaustück, die Messung des Prüfers ist die Wahrheit. Die **Abweichung** zwischen beiden ist selbst eine Metrik: Wie ehrlich und wie genau misst sich der Agent?

---

## 3. Entschiedene Eckpunkte

| Thema | Entscheidung |
|---|---|
| Frontend | **Vite + React** (TypeScript) |
| Backend | **Go**, nur Standardbibliothek (`net/http`) für die REST-API |
| Datenbank | **SQLite im Arbeitsspeicher**, als reine Go-Bibliothek (`modernc.org/sqlite`, ohne C-Compiler) |
| Webserver | **nginx**, ab Level 2, **lokal installiert** (kein Docker). Dieselbe `nginx.conf` wandert in Level 7 ins Image |
| Lokales Docker | **keins** (entschieden 2026-11-20): Der Agent startet lokal nie Container. Images werden nur in der Pipeline gebaut und dort im Runner getestet, live laufen sie erst beim Hoster |
| Prüfskripte des Agenten | vorgegeben: **Playwright (TypeScript)**; ab Level 1 vorhanden und Level für Level erweitert |
| Level 9 | der **Coding-Agent prüft seine eigene Live-Seite** |
| Scheitern | **Schluss beim ersten Fehler**; Score = höchstes durchgehend geschafftes Level |
| Images bauen | ausschließlich **GitHub Actions** (Level 7); Test der Images per `docker compose` im Runner |
| Registry | **GitHub Container Registry (GHCR)** |
| Hosting | **eigener kleiner Server (VPS) bei Hetzner**. Die Pipeline deployt per SSH mit `docker compose` |
| Zugangsdaten | als **Organisations-Secrets der GitHub-Test-Organisation**. Der Agent sieht weder SSH-Schlüssel noch Server-Zugang |
| Unabhängiger Prüfer | Level 1–5 in einem **eigenen Prüfer-Container** (gleiches Image wie der Agent, in VS Code geöffnet, Werk des Agenten nur lesbar), Level 6–10 und der Lasttest in einem **Prüfer-Workflow in GitHub Actions** |
| Grenzwerte | **locker starten**: zuerst nur messen und protokollieren; feste Grenzen erst nach den ersten Durchläufen. Von Anfang an gelten nur ein Zeit- und ein Kostenlimit |
| Optik | wird bewertet, aber nur als **Nebenwert** (zählt nicht zum Score) |
| Design-Stil | **technisch-sachlich**, wie ein Monitoring-Dashboard: dunkel, klare Statusfarben, Zahlen im Vordergrund |
| Adresse | **Subdomain mit HTTPS**, von uns eingerichtet (DNS + Caddy auf dem Server, Teil der Startausrüstung) |
| Server-Einrichtung | **per Skript** (cloud-init + Setup-Skript), jederzeit identisch neu aufsetzbar |
| Spec-Aufbau | **Mischform**: thematische Grundlagen + eine Datei pro Level (siehe Abschnitt 12) |
| Vorgehen | **Level für Level** (siehe Abschnitt 11) |

---

## 4. Die 10 Levels

Für jedes Level gilt dasselbe Schema:
- **Ziel:** was entstehen soll
- **Selbstprüfung:** was das Prüfskript des Agenten misst
- **Nachprüfung:** was unser Prüfer unabhängig kontrolliert
- **Bestanden, wenn:** das harte Kriterium des Prüfers

### Level 1 – Statische Seite, lokal gestartet
- **Ziel:** Ein Vite+React-Projekt in `frontend/` zeigt die 10 Levels als Karten. Die Daten kommen aus einer statischen Datei `public/results.json`. `npm run build` erzeugt `dist/`, und `make level1` startet den Build lokal mit `vite preview` auf Port 8080.
- **Selbstprüfung:** Der Agent legt in `checks/` eine Playwright-Suite an. Sie öffnet die Seite, prüft, dass 10 Level-Karten sichtbar sind und keine JS-Fehler auftreten, und schreibt das Ergebnis nach `results.json`.
- **Nachprüfung:** Der Prüfer baut das Frontend mit eigener Test-`results.json` und prüft: 10 Karten, korrekte Status-Darstellung, keine Konsolenfehler.
- **Bestanden, wenn:** alle Prüfungen grün sind.

### Level 2 – Seite läuft im Webserver
- **Ziel:** `dist/` wird von einem **lokal installierten nginx** ausgeliefert (kein Docker), mit eigener `nginx.conf` im Projekt. Port 8080, Start mit `make level2`. Dieselbe Konfiguration wird in Level 7 ins Image übernommen.
- **Selbstprüfung:** HTTP 200, richtiger Content-Type, Header für Caching und Komprimierung, echter 404 für fehlende Dateien. Die Playwright-Suite läuft gegen nginx; `make check` prüft dabei alle gebauten Levels.
- **Nachprüfung:** Der Prüfer startet mit `make level2`, prüft, dass wirklich nginx antwortet, kontrolliert die Header und wiederholt die Darstellungstests aus Level 1.
- **Bestanden, wenn:** die Seite über nginx identisch zu Level 1 funktioniert und die Header-Regeln erfüllt sind.

### Level 3 – REST-Backend
- **Ziel:** Ein Go-Service auf Port 8081. Er liefert `GET /api/health` sowie `GET /api/levels` und `POST /api/levels/{n}/result`. Die Daten liegen vorerst im Speicher.
- **Selbstprüfung:** Die Endpunkte werden aufgerufen und die Antworten gegen das in der Spec festgelegte JSON-Schema geprüft.
- **Nachprüfung:** Der Prüfer hat eigene API-Tests gegen die Schnittstellen-Definition in der Spec (als OpenAPI-Datei). Dazu gehören auch Fehlerfälle: 404, ungültiges JSON, falsche Level-Nummer.
- **Bestanden, wenn:** alle API-Tests grün sind.

### Level 4 – Datenbank
- **Ziel:** Die Ergebnisse liegen in SQLite (im Arbeitsspeicher), mit festem Schema und einer Migration beim Start. Dazu kommt eine Historie: jeder Prüflauf ist ein eigener Eintrag.
- **Selbstprüfung:** Ergebnisse schreiben und wieder lesen; die Historie wächst mit jedem Lauf.
- **Nachprüfung:** Der Prüfer schreibt über die API und liest zurück, auch bei parallelen Schreibzugriffen. Ein Blick in den Code bestätigt, dass wirklich SQL genutzt wird und nicht nur eine Map.
- **Bestanden, wenn:** die Daten konsistent sind und die Historie stimmt.

### Level 5 – Frontend und Backend verbunden
- **Ziel:** Die Seite lädt die Ergebnisse von `/api/levels` statt aus `results.json`. nginx leitet `/api/*` an das Backend weiter, es gibt also keine CORS-Probleme. Die Prüfsuite meldet ihre Ergebnisse per `POST` an die API.
- **Selbstprüfung:** Prüfsuite laufen lassen; danach zeigt die Seite die neuen Ergebnisse.
- **Nachprüfung:** Der Prüfer schreibt ein Test-Ergebnis per API und prüft im Browser, dass es angezeigt wird.
- **Bestanden, wenn:** die Daten vollständig von der API bis zur Anzeige durchkommen.

### Level 6 – Repo + CI
- **Ziel:** Der Agent legt per `gh` in der Test-Organisation ein Repo an (Name: `levelboard-<durchlauf-id>`) und pusht den Code. Eine GitHub-Actions-Pipeline baut Frontend und Backend und führt die Prüfsuite für die Levels 1–5 im Runner aus (nginx und Backend direkt im Runner, ohne Images).
- **Selbstprüfung:** Der Agent wartet auf den Pipeline-Lauf (`gh run watch`) und liest dessen Ergebnis aus.
- **Nachprüfung:** Der Prüfer liest über die GitHub-API den Status des Pipeline-Laufs und prüft, dass die Tests darin wirklich gelaufen sind (Test-Report als Artefakt).
- **Bestanden, wenn:** die Pipeline grün ist und der Test-Report alle Checks der Levels 1–5 enthält.

### Level 7 – Images in der Pipeline
- **Ziel:** Zwei Images, **nur in der Pipeline gebaut** (lokal nie gestartet):
  - **frontend:** mehrstufiger Build. Node baut `dist/`, danach nginx mit `dist/` und der `nginx.conf` aus Level 2/5.
  - **backend:** mehrstufiger Build. Go kompiliert eine einzige Datei, die in einem schlanken Basis-Image landet.

  Die Pipeline startet beide per `docker compose` **im Runner**, lässt die Prüfsuite dagegen laufen und pusht die Images erst danach mit dem Commit-Hash als Tag in die GHCR.
- **Selbstprüfung:** Der Agent wartet auf den Pipeline-Lauf und prüft, dass die Images in der GHCR liegen.
- **Nachprüfung:** Der Prüfer liest Pipeline-Status und Test-Report, prüft die Images in der GHCR und startet sie in einem eigenen Prüfer-Workflow in GitHub Actions.
- **Bestanden, wenn:** die Pipeline grün ist, die Tests gegen die Container gelaufen sind und beide Images abrufbar sind. Die Image-Größen werden vorerst nur protokolliert.

### Level 8 – Deployment auf den Hetzner-Server
- **Ziel:** Ein Deploy-Job in der Pipeline verbindet sich per SSH mit dem Server. Er überträgt die `docker-compose.yml`, zieht die Images aus der GHCR und startet sie. Danach ist die Seite unter der öffentlichen Adresse erreichbar. Die Zugangsdaten kommen ausschließlich aus den Org-Secrets.
- **Selbstprüfung:** HTTP 200 auf die öffentliche URL und auf `/api/health`.
- **Nachprüfung:** Der Prüfer ruft die öffentliche URL von außen auf und prüft Seite und API.
- **Bestanden, wenn:** die Seite live ist und das deployte Image zum Commit passt (die App zeigt Version und Commit an).

### Level 9 – Agent prüft live
- **Ziel:** Der Agent lässt seine gesamte Prüfsuite gegen die **Live-URL** laufen, inklusive eines kurzen Lasttests mit fester Last und Dauer laut Spec. Die Ergebnisse meldet er an die Live-API.
- **Selbstprüfung:** Das ist dieses Level selbst.
- **Nachprüfung:** Der Prüfer-Workflow lässt eine eigene Prüfsuite und einen eigenen Lasttest gegen die Live-URL laufen und vergleicht die Werte mit den Meldungen des Agenten.
- **Bestanden, wenn:** die Live-Prüfung ohne Fehler durchläuft und die Meldungen vollständig sind. Die Abweichung zwischen Selbst- und Fremdmessung und die Performance werden vorerst nur protokolliert.

### Level 10 – Metriken veröffentlicht
- **Ziel:** Die Live-Seite zeigt den Abschlussbericht:
  - alle 10 Levels mit Status
  - Zeitpunkt jeder Prüfung
  - Antwortzeiten (p50/p95)
  - Image-Größen
  - Pipeline-Dauer
  - eine Zusammenfassung
- **Selbstprüfung:** Der Agent ruft die Live-Seite auf und prüft, dass alle Metriken sichtbar sind.
- **Nachprüfung:** Der Prüfer prüft die Seite auf Vollständigkeit (Metriken nach Spec-Liste) und Konsistenz mit der API.
- **Bestanden, wenn:** alle Pflicht-Metriken sichtbar und stimmig sind.

---

## 5. Feste Schnittstellen für den Prüfer

Damit der Prüfer unabhängig messen kann, schreibt die Spec **feste Befehle und Pfade** vor. So muss der Prüfer nicht raten, wie etwas gestartet wird:

```
make level1   … make level10   # baut/startet, was das Level braucht
make check                     # Prüfsuite des Agenten (lokal)
make check URL=https://…       # Prüfsuite gegen eine beliebige URL
make down                      # alles stoppen
```

Vorgegebene Projektstruktur:
```
frontend/          Vite+React-Projekt, nginx.conf, Dockerfile
backend/           Go-Modul, Dockerfile
checks/            Playwright-Prüfsuite des Agenten
deploy/            docker-compose.prod.yml für den Server
docker-compose.yml
.github/workflows/ci.yml
Makefile
```

Weitere Festlegungen in der Spec:
- **Ports:** 8080 (Web) und 8081 (API)
- **API:** als OpenAPI-Datei
- **Ergebnisformat:** JSON-Schema für eine Level-Meldung
- **Testkennungen:** feste `data-testid`s für alle Level-Karten und Metriken

---

## 6. Ablauf eines Durchlaufs

1. **Vorbereitung** (Skript `run.sh`):
   - Startausrüstung prüfen und Durchlauf-ID vergeben.
   - Bauordner außerhalb des Repos anlegen und `spec/` hineinkopieren.
   - Lokal nur `GH_TOKEN` setzen.
2. **Agent baut:** `claude -p` mit einem festen Start-Prompt, Zeit- und Kostenlimit, Ausgabe als JSON (Kosten, Tokens, Turns).
3. **Prüfer misst:**
   - Level 1–5 im Prüfer-Container (`<lauf>/judge`, Befehl `/specrun/runner/pruefen.sh`).
   - Level 6–10 über den Prüfer-Workflow in GitHub Actions.
   - Abbruch beim ersten Fehler.
4. **Optik-Bewertung:** Ein Bewertungs-Agent beurteilt Screenshots (hell, dunkel, mobil). Das Ergebnis ist ein Nebenwert.
5. **Bericht:** `runs/<id>/report.md`. Inhalt:
   - erreichtes Level und Score
   - Nebenwerte
   - Abweichung zwischen Selbst- und Fremdmessung
   - Spec-Lücken für die nächste Iteration
6. **Aufräumen:**
   - GitHub-Repo und GHCR-Images des Durchlaufs löschen oder archivieren.
   - Auf dem Server die Container stoppen und alte Images löschen.

---

## 7. Score

- **Hauptscore:** 10 Punkte pro durchgehend geschafftem Level, also 0–100.
- **Nebenwerte** zählen nicht zum Score, werden aber für den Vergleich von Durchläufen protokolliert:

| Nebenwert | Woher |
|---|---|
| Kosten in USD, Tokens, Turns | JSON-Ausgabe von `claude -p` |
| Gesamtdauer und Dauer pro Level | Zeitstempel der Meldungen |
| Selbst- vs. Fremdmessung | Anzahl und Größe der Abweichungen |
| Performance live (p50/p95, Fehlerrate) | Lasttest des Prüfer-Workflows |
| Image-Größen | Prüfer |
| Optik | Bewertungs-Agent |

**Grenzwerte:** Vorerst wird nur gemessen. Nach den ersten Durchläufen legen wir anhand der echten Werte feste Grenzen fest, z. B. für Image-Größen, p95 und Toleranzen. Von Anfang an gelten nur:
- ein Zeitlimit pro Durchlauf, z. B. 90 Minuten
- ein Kostenlimit pro Durchlauf, z. B. 25 USD

Die Kosten kennt nur unser Runner, nicht der Agent selbst. Sie erscheinen deshalb im Bericht und nicht auf der Levelboard-Seite.

---

## 8. Startausrüstung (muss vor dem Durchlauf bereitstehen)

Da es keine Rückfragen gibt, muss alles vorbereitet sein. Die Spec listet es auf, `run.sh` prüft es vorab.

**Auf dem Mac**
- Node, Go, nginx, `gh`, `make` – **kein Docker** (Images entstehen nur in der Pipeline). Agent und Prüfer arbeiten in Containern aus demselben Image; auf dem Mac braucht es nur Podman und VS Code.
- Playwright-Browser
- Genaue Versionen legen wir noch fest.

**GitHub-Test-Organisation**
- Eigene Organisation nur für diese Durchläufe.
- **Organisations-Secrets**, für alle Repos der Organisation verfügbar:
  - `DEPLOY_HOST`: Adresse des Servers
  - `DEPLOY_USER`: Benutzer auf dem Server
  - `DEPLOY_SSH_KEY`: privater Schlüssel, nur für den Deploy-Benutzer
- Lokales Token für den Agenten mit genau diesen Rechten: Repos in der Organisation anlegen, Actions, Packages schreiben.

**Hetzner-Server (von uns per Skript eingerichtet)**
- Kleinster passender Cloud-Server mit Ubuntu LTS.
- Einrichtung über eine **cloud-init-Datei** und ein **Setup-Skript** in Specrun. Damit lässt sich der Server jederzeit in Minuten identisch neu aufsetzen. Das Skript richtet ein:
  - Docker und Docker Compose
  - Benutzer `deploy` mit dem SSH-Schlüssel; er darf nur Docker nutzen
  - Firewall: nur SSH, HTTP und HTTPS offen
  - **Caddy** als Reverse-Proxy mit automatischem HTTPS (Let's Encrypt) für `levelboard.<deine-domain>`. Caddy leitet alles an `localhost:8080` weiter, also an den Frontend-Container des Agenten.
- **DNS:** Ein A-Eintrag `levelboard.<deine-domain>` zeigt auf den Server. Den legen wir einmalig an.
- Leserechte für die GHCR, damit der Server die Images ziehen kann. Am einfachsten sind öffentliche Packages in `specrun-lab`; sonst ein Lese-Token auf dem Server.
- Damit ist HTTPS **nicht** Aufgabe des Agenten. Er deployt nur hinter Caddy auf Port 8080.

**Zugangsdaten**
- Lokal hat der Agent nur `GH_TOKEN`.
- Alles für den Server liegt ausschließlich in den Org-Secrets.
- Nichts davon gehört in die Spec, ins Repo oder in Logs.

---

## 9. Risiken und Sicherheit

| Risiko | Gegenmaßnahme |
|---|---|
| Agent arbeitet mit echten Zugangsdaten | lokal nur ein eng begrenztes GitHub-Token; Server-Zugang nur über Org-Secrets in der Pipeline; Test-Organisation statt Hauptkonto |
| Server wird kompromittiert oder verkonfiguriert | Wegwerf-Server, jederzeit neu aufsetzbar (am besten per Skript); `deploy`-Benutzer mit minimalen Rechten |
| Agent schreibt Secrets ins Repo oder in Logs | Spec verbietet es ausdrücklich; der Prüfer scannt das Repo nach Secrets; ein Fund macht den Durchlauf ungültig |
| Agent misst sich selbst geschönt | unabhängiger Prüfer; die Abweichung wird gemessen |
| In-Memory-DB verliert die Daten bei jedem Container-Neustart | bewusst akzeptiert; Level 9 und 10 schreiben die Live-Ergebnisse nach dem Deployment neu |
| Kosten laufen aus dem Ruder (Agent hängt in einer Schleife) | Zeit- und Kostenlimit für die Session; die Serverkosten sind fix |
| Reste vergangener Durchläufe | Aufräumschritt im Runner, eindeutige Namen pro Durchlauf |
| Durchläufe überschneiden sich auf dem Server | vorerst nur ein Durchlauf gleichzeitig |

---

## 10. Was du vorab klären bzw. bereitstellen musst

Das sind keine Konzeptfragen mehr, sondern Voraussetzungen, die nur du schaffen kannst:

1. **Domain:** Unter welcher Domain soll `levelboard.…` laufen, und hast du Zugriff auf deren DNS?
2. **Hetzner-Konto:** vorhanden, oder muss es angelegt werden?
3. **GitHub:** Ist `specrun-lab` als Organisation frei? Legst du sie an (kostenloser Plan reicht vermutlich)?
4. **Unser eigenes Repo:** Soll Specrun selbst in ein (privates) GitHub-Repo, oder bleibt es vorerst lokal?

Diese Punkte brauchen wir erst ab Level 6. Level 1 bis 5 laufen komplett lokal.

---

## 11. Vorgehen: Level für Level

Für jedes Level wiederholen wir denselben Zyklus:

1. **Definieren:** Ziel, Prüfregeln und Spec-Abschnitt besprechen.
2. **Referenz bauen:** Wir bauen das Level hier selbst.
3. **Prüfer bauen:** Der Prüfer für dieses Level entsteht.
4. **Nachbau-Test:** Ein Agent baut aus der Spec bis zu diesem Level.
5. **Auswerten:** Wo der Prüfer anschlägt, schärfen wir die Spec. Dann zurück zu Schritt 4, bis es stabil läuft.
6. **Weiter:** nächstes Level.

So fallen Spec-Lücken früh auf, und jeder Nachbau-Test bleibt kurz und günstig.

---

## 12. Aufbau von Specrun

### Ordner von Specrun (unser Projekt)
```
KONZEPT.md          – dieses Dokument
CLAUDE.md           – Arbeitsregeln für uns
spec/               – die Spezifikation (einzige Eingabe für den Agenten)
reference/          – unsere Referenz-Implementierung des Levelboards
judge/              – unabhängiger Prüfer (lokal + GitHub-Workflow)
infra/              – cloud-init, Server-Setup-Skript, Caddy-Konfiguration
runner/             – run.sh, Bewertung, Aufräumen
runs/<id>/          – Ergebnisse und Berichte je Durchlauf
```

### Aufbau der Spezifikation (Mischform)
```
spec/
  00-start.md            – Arbeitsanweisung, Regeln, Definition of Done, Reihenfolge
  01-produkt.md          – was das Levelboard ist und zeigt
  02-startausruestung.md – vorhandene Werkzeuge, Versionen, Umgebungsvariablen, was verboten ist
  03-architektur.md      – Projektstruktur, Ports, Makefile-Befehle
  04-api.md + openapi.yaml – REST-Schnittstelle
  05-datenmodell.md      – DB-Schema, JSON-Schema einer Level-Meldung
  06-design.md           – Design-Tokens, Layout, Komponenten, data-testids
  levels/
    level-01.md … level-10.md – Ziel, Liefergegenstände, Selbstprüfung, Bestehensregel
  CHANGELOG.md
```

Eine Level-Datei beschreibt nur, was in diesem Level **neu** dazukommt, und verweist auf die Grundlagen. Bei „Level für Level“ wachsen pro Iteration eine Level-Datei und die betroffenen Grundlagen-Abschnitte.

---

## 13. Level 1 im Detail – „Statische Seite, lokal gestartet“

**Status (2026-11-20):** Referenz gebaut (`reference/`), Spec v0.1.0 geschrieben (`spec/`), Prüfer gebaut (`judge/level1.mjs`). Der Prüfer besteht gegen die Referenz und findet in der Gegenprobe alle drei absichtlich eingebauten Fehler. Als Nächstes folgt der erste Nachbau-Test.

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Inhalt der Seite | Kopfzeile + Zusammenfassung + 10 Level-Karten |
| Status je Level | 4 Werte: `offen`, `bestanden`, `fehlgeschlagen`, `gesperrt` |
| Datenformat | `results.json` hat **exakt das Format der späteren Antwort von `GET /api/levels`**. In Level 5 wird nur die Quelle getauscht |
| Darstellung | nur dunkles Theme, responsiv (Desktop-Raster, Handy einspaltig ab 375 px) |
| Design | **exakt vorgegeben**: Farben, Abstände, Schrift, Layout, Texte |

### Seitenaufbau
1. **Kopfzeile**
   - Links das Logo und der Name „Levelboard“.
   - Rechts die Durchlauf-ID und die Version.
2. **Zusammenfassung**
   - Erreichtes Level als große Zahl, z. B. „3 / 10“, dazu ein Fortschrittsbalken.
   - Zeitpunkt der letzten Prüfung.
3. **10 Level-Karten im Raster.** Jede Karte zeigt:
   - Nummer und Titel
   - Status als farbiges Abzeichen
   - Zeitpunkt der Prüfung und Dauer (oder „–“)
   - Zahl der bestandenen Einzelprüfungen, z. B. „4/4 Checks“
4. **Leer- und Fehlerzustand:** Fehlt `results.json` oder ist sie ungültig, erscheint ein klarer Hinweis statt einer leeren Seite. Die 10 Karten werden dann als `offen` angezeigt.

### Datenformat (Entwurf, wird in der Spec als JSON-Schema fixiert)
```json
{
  "run": { "id": "2026-11-21-01", "version": "0.1.0", "commit": null, "updatedAt": "2026-11-21T10:15:00Z" },
  "levels": [
    {
      "level": 1,
      "title": "Statische Seite",
      "status": "bestanden",
      "checkedAt": "2026-11-21T10:14:58Z",
      "durationMs": 2310,
      "checks": [ { "name": "Seite lädt ohne Fehler", "ok": true } ],
      "metrics": {}
    }
  ]
}
```
- `levels` enthält immer alle 10 Einträge. Die Titel sind fest in der Spec vorgegeben.
- `metrics` ist in Level 1 leer und wird ab späteren Levels gefüllt (Antwortzeiten, Image-Größen …).
- **„Erreichtes Level“** = höchstes Level, bis zu dem alle Levels `bestanden` sind. Die Seite berechnet es selbst.

### Zusammenspiel Seite ↔ Prüfsuite
- Die Seite lädt `results.json` **zur Laufzeit** (`fetch`), sie ist nicht fest in den Build eingebaut.
- `make check` startet die Playwright-Suite gegen `http://127.0.0.1:8080`. Danach schreibt sie das Ergebnis für Level 1 **nur in den ausgelieferten Build** (`frontend/dist/results.json`). Nach einem Neuladen zeigt die Seite „Level 1 bestanden“.
- **Neustart setzt zurück** (entschieden 2026-11-20): Die Quelle `frontend/public/results.json` bleibt immer „alles offen“. Jedes `make level1` baut neu und beginnt damit wieder bei null. Die Seite zeigt nie veraltete Ergebnisse aus einem früheren Lauf.
- Selbstprüfungen der Suite in Level 1, mindestens:
  - Seite lädt (HTTP 200)
  - Titel ist „Levelboard“
  - 10 Karten sichtbar
  - keine Konsolenfehler
  - ausgewählte Darstellungen auf Handy-Breite stimmen

### Makefile in Level 1
| Befehl | Wirkung |
|---|---|
| `make level1` | `npm ci` + `npm run build` + `vite preview` auf Port 8080 (im Hintergrund, PID-Datei) |
| `make check` | Playwright-Suite gegen Port 8080, schreibt `results.json` |
| `make down` | stoppt alles, was gestartet wurde |

### Nachprüfung durch den Prüfer
1. `make level1` läuft durch, Port 8080 antwortet innerhalb von 60 s.
2. Der Prüfer ersetzt `results.json` durch **eigene Testdaten**: alle 4 Status, fehlende Felder, ungültige Datei. Dann prüft er die Darstellung: Abzeichen, Texte, „Erreichtes Level“, Fehlerhinweis.
3. Er prüft alle `data-testid`s aus der Spec.
4. Die Konsole zeigt keine Fehler.
5. `make check` läuft durch und erzeugt eine `results.json`, die zum Schema passt und Level 1 als `bestanden` meldet.
6. Nebenwerte: Optik-Bewertung (Screenshots Desktop und Handy), Build-Dauer, Bundle-Größe.

**Bestanden, wenn:** Punkte 1–5 grün sind.

### Was dafür in die Spec muss
- `00-start.md`: Arbeitsanweisung, Regeln, Ablauf Level für Level
- `01-produkt.md`: Zweck des Levelboards, die 10 Level-Titel
- `02-startausruestung.md`: Node- und npm-Version, Playwright, `make`
- `03-architektur.md`: nur der Teil für Level 1 (`frontend/`, `checks/`, `Makefile`, Port 8080)
- `05-datenmodell.md`: JSON-Schema von `results.json`
- `06-design.md`: Design-Tokens, Layout, Komponenten, Texte, `data-testid`s
- `levels/level-01.md`

### Ergebnis
Alle vier Schritte sind erledigt.
- **Erster Nachbau** am 2026-11-20: manuell in einem Dev Container gestartet.
- **Ergebnis laut Prüfer:** Level 1 bestanden (K1–K6), Score 10/100, keine Abweichung zwischen Selbst- und Fremdmessung. Der Code ist eigenständig geschrieben, nicht von der Referenz kopiert.
- **Bericht:** `runs/2026-11-20-01-container/`.
- **Einschränkung:** Der Lauf fand in einem bestehenden Projekt mit eigener `CLAUDE.md` statt.

---

## 14. Level 2 im Detail – „Seite läuft im Webserver“

**Status (2026-11-20):** gebaut. Erledigt sind:
- Dev Container (`infra/devcontainer/`, mit Podman getestet)
- Referenz (`reference/`, auf macOS und im Container unter Linux grün)
- Spec v0.2.0
- Prüfer `judge/level2.mjs` und `judge/all.mjs`; die Gegenprobe findet beide eingebauten nginx-Fehler
- Runner für Container-Läufe (`runner/prepare-run.sh`, `runner/pruefen.sh`, `runner/uebernehmen.sh`)

Offen ist noch der Nachbau-Test bis Level 2 (Lauf 003 läuft).

**Umgestellt nach Lauf 003** (2026-11-20, erledigt): Das Volume `specrun-claude-config` speichert Claudes gesamten Zustand (Memory, Sessions, Plugins) über alle Läufe hinweg. Weil jeder Lauf unter `/workspace` arbeitet, könnte ein späterer Agent sich an frühere Läufe erinnern.
- **Neu:** kein Volume mehr. Die Anmeldung kommt nur noch über `CLAUDE_CODE_OAUTH_TOKEN` (aus `claude setup-token`, als Umgebungsvariable auf dem Mac).
- **Dockerfile:** Die Ersteinrichtung wird als erledigt vorgemerkt.
- **Ergebnis:** Jeder Lauf startet mit leerem Gedächtnis.

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Docker | **kein lokales Docker**, siehe Abschnitt 3; nginx ist im Dev Container installiert |
| Startausrüstung | **eigener Dev Container in Specrun** (`infra/devcontainer/`), versioniert, ohne `CLAUDE.md`. Die Spec beschreibt ihn exakt |
| nginx-Regeln | siehe unten (Caching, 404, gzip, Server-Version ausgeblendet) |
| `make check` | prüft **alle gebauten Levels** (ab jetzt 1 und 2) und schreibt für jedes ein Ergebnis. Ein Fehler sperrt alle höheren Levels |
| Prüfer | ~~auf dem Mac~~ → seit 2026-11-20 im **eigenen Prüfer-Container** (siehe unten) |

### Dev Container (`infra/devcontainer/`)
- Linux-Basis-Image mit festen Versionen von:
  - Node.js und npm
  - Go (für Level 3)
  - nginx
  - Systembibliotheken für Playwright-Chromium (vorinstalliert)
  - `make`, `curl`, `git`, `gh`
- **Kein** Docker bzw. Podman im Container.
- Benutzer `dev`, ohne root-Rechte. Der Agent kann also nichts nachinstallieren.
- **Keine `CLAUDE.md`, keine Projekt-Templates.**
- **Ordner pro Lauf:** `specruns_testlaeufe/<nr>/` enthält `spec/` als Unterordner. Genau dieser Ordner ist im Container der Arbeitsordner.
- `spec/02-startausruestung.md` beschreibt diesen Container statt macOS.

### Was nginx können muss
| Regel | Prüfung |
|---|---|
| liefert `dist/` auf Port 8080 aus, `127.0.0.1` | HTTP 200 auf `/` |
| `results.json`: kein Cache | `Cache-Control: no-store` |
| `index.html`: kein Cache | `Cache-Control: no-cache` |
| Dateien unter `/assets/` (mit Hash im Namen): lange cachen | `Cache-Control: public, max-age=31536000, immutable` |
| fehlende Datei → echter 404, kein Fallback auf `index.html` | `GET /gibt-es-nicht.json` → 404 |
| gzip für HTML, JS, CSS, JSON | `Content-Encoding: gzip` bei `Accept-Encoding: gzip` |
| Server-Version ausgeblendet | `Server: nginx` ohne Versionsnummer |

- Die Konfiguration liegt in `frontend/nginx.conf`. Sie läuft ohne root, mit PID-, Log- und Temp-Dateien in `.run/`.
- Dieselbe Datei wird in Level 7 ins Image übernommen. Deshalb arbeitet sie mit relativen bzw. per Variable gesetzten Pfaden.

### Makefile ab Level 2
| Befehl | Wirkung |
|---|---|
| `make level1` | wie bisher (`vite preview`) |
| `make level2` | `make down`, baut das Frontend und startet nginx mit `frontend/nginx.conf` auf Port 8080 im Hintergrund |
| `make check` | prüft Level 1 und 2 gegen die laufende Seite und schreibt beide Ergebnisse |
| `make down` | stoppt `vite preview` **und** nginx |

### Selbstprüfung (neue Checks für Level 2)
- Antwort kommt von nginx (Header `Server`)
- Cache-Header für `results.json`, `index.html` und Assets
- 404 für eine fehlende Datei
- gzip-Komprimierung
- alle Darstellungschecks aus Level 1, diesmal gegen nginx

### Prüfer für Level 2
1. Er prüft zuerst Level 1 wie bisher; scheitert es, ist Schluss.
2. Dann startet er `make level2` und prüft die nginx-Regeln aus der Tabelle.
3. Er wiederholt die Darstellungstests K2–K4 gegen nginx, also auch die fehlende Datei: Mit echtem 404 muss die Seite „Datei fehlt“ zeigen.
4. `make check`: Exit 0, Level 1 und 2 bestanden, die Checks wörtlich wie in der Spec.

~~Risiko: abweichendes nginx auf dem Mac~~ – entfällt, weil der Prüfer jetzt im selben Image läuft wie der Agent.

### Auswirkungen auf die Spec (v0.2.0)
- Level-Titel 6 und 7 ändern sich zu „Repo + CI“ und „Images in der Pipeline“. Betroffen sind Spec, Referenz und die Testdaten des Prüfers.
- `02-startausruestung.md` beschreibt den Dev Container.
- `03-architektur.md`: `make level2`, `nginx.conf`, `make check` für alle Levels.
- `levels/level-02.md` kommt neu dazu.

### Nächster Schritt (erst auf dein Go)
1. Dev Container in `infra/devcontainer/` aufsetzen.
2. Referenz für Level 2 bauen.
3. Spec v0.2.0 schreiben.
4. Prüfer für Level 2 bauen.
5. Nachbau-Test bis Level 2 im neuen Dev Container.

---

## 15. Prüfer im eigenen Container (entschieden 2026-11-20)

Der Prüfer für die Levels 1–5 läuft nicht mehr auf dem Mac, sondern in einem **eigenen Dev Container**. Er wird wie der Agent in VS Code geöffnet. So bleibt jeder Schritt sichtbar, ohne versteckte Automatik.

```
<lauf>/
  env/.devcontainer/      Container des Agenten
  work/                   Arbeitsordner des Agenten
  judge/.devcontainer/    Container des Prüfers (infra/judge-devcontainer, Pfad zu Specrun eingesetzt)
  judge/ergebnis/         Bericht, Logs, Bildschirmfotos
  cost.txt                Ausgabe von /cost
```

| Im Prüfer-Container | Quelle | Rechte |
|---|---|---|
| `/workspace` | `<lauf>/judge` | schreiben |
| `/lauf` | `<lauf>` (Werk des Agenten unter `/lauf/work`) | nur lesen |
| `/specrun` | Specrun | nur lesen |

**Ablauf:** `/specrun/runner/pruefen.sh`
1. Kopiert das Werk des Agenten nach `~/build` (ohne `node_modules`, `dist`, `.run`). Der Prüfer baut aus dem Quellcode.
2. Kopiert den Prüfer und installiert dessen Abhängigkeiten.
3. Legt Metadaten, `files.txt` und `cost.txt` ab.
4. Misst mit `judge/all.mjs` Level für Level.
5. Schreibt den Bericht.

Danach übernimmt `runner/uebernehmen.sh <lauf>` (auf dem Mac) das Ergebnis nach `runs/lauf-<nr>/`.

**Vorteile:**
- gleiche Umgebung wie beim Agenten
- kein Konflikt um Port 8080 (getrennte Netzwerke)
- das Werk des Agenten bleibt unverändert
- kein nginx und kein Playwright auf dem Mac nötig
- keine persönlichen Pfade im Bericht

Der frühere Weg über `runner/judge-run.sh` auf dem Mac ist entfernt.

---

## 16. Level 3 im Detail – „REST-Backend“

**Status (2026-11-20):** gebaut. Erledigt sind:
- Referenz (`reference/backend`, Go-Abdeckung 83,5 %; im Container grün)
- Spec v0.3.0 mit `openapi.yaml` und `04-api.md`
- Prüfer `judge/level3.mjs`; die Gegenprobe findet alle drei eingebauten Fehler

Offen ist noch der Nachbau-Test bis Level 3.

Zusätzlich zum Entwurf unten gibt es einen 8. Check: „Falsche Reihenfolge ergibt 409“.

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Logik | **Regeln im Backend**: Status aus den Checks, Zeitpunkt vom Server, Sperren höherer Levels. Die Regeln aus `write-results.mjs` gelten dort gleich |
| Schnittstelle | **OpenAPI** (`spec/openapi.yaml`) als verbindlicher Vertrag, dazu `spec/04-api.md` mit Regeln und Beispielen |
| Go-Tests | **Pflicht**: `make check` führt `go test ./...` aus; schlägt das fehl, scheitert Level 3. Die Abdeckung wird als Nebenwert gemessen |
| `make level3` | startet **nginx (wie Level 2) und das Backend** |
| Ergebnisse | `make check` schreibt **weiter in `results.json`**. Die Seite liest erst ab Level 5 von der API |

### Backend
- `backend/`, Go 1.27.4, **nur Standardbibliothek**: `go.mod` ohne `require`, Routing mit den Mustern von `net/http`, z. B. `GET /api/levels/{n}`.
- Port **8081**, nur an `127.0.0.1` gebunden. Log nach `.run/backend.log`.
- Daten **im Arbeitsspeicher**, abgesichert für gleichzeitige Zugriffe (Mutex).
- **Startzustand:** wie `public/results.json`, also alle 10 Levels offen. `run.id` kommt aus `RUN_ID`, sonst `lokal`.
- Ein Neustart setzt alles zurück.
- Bei SIGTERM beendet sich das Backend sauber; `make down` nutzt das.

### Endpunkte (Entwurf)
| Methode | Pfad | Antwort |
|---|---|---|
| `GET` | `/api/health` | 200 `{"status":"ok","version":"<run.version>"}` |
| `GET` | `/api/levels` | 200, exakt das Format von `results.json` (`results.schema.json`) |
| `GET` | `/api/levels/{n}` | 200, ein Level-Objekt; 404 bei `n` außerhalb 1–10 oder keine Zahl |
| `POST` | `/api/levels/{n}/result` | 200, der neue Gesamtstand (wie `GET /api/levels`) |

**Body von `POST /api/levels/{n}/result`:** `{"checks":[{"name":"…","ok":true}], "durationMs": 1234, "metrics": {}}`
- `checks`: mindestens 1, höchstens 100 Einträge, `name` nicht leer.
- `durationMs`: ganze Zahl ≥ 0.
- `metrics`: optional, ein Objekt.

**Regeln beim Melden:**
- `status` ist `bestanden`, wenn alle Checks ok sind, sonst `fehlgeschlagen`.
- `checkedAt` und `run.updatedAt` setzt der Server.
- Alle höheren Levels werden auf `offen` gesetzt, bei einem Fehlschlag auf `gesperrt`.
- Liegt ein **niedrigeres Level nicht auf `bestanden`**, antwortet der Server mit **409** und ändert nichts. Die Reihenfolge 1 → 2 → 3 ist also Pflicht.

**Fehler** (immer `{"error":"<Text>"}`, `Content-Type: application/json`):
| Code | Fall |
|---|---|
| 400 | ungültiges JSON, fehlende oder falsche Felder |
| 404 | unbekanntes Level oder unbekannter Pfad unter `/api/` |
| 405 | falsche Methode, mit `Allow`-Header |
| 409 | ein niedrigeres Level ist nicht bestanden |
| 413 | Body größer als 64 KB |
| 415 | `Content-Type` ist nicht `application/json` |

### Makefile ab Level 3
| Befehl | Wirkung |
|---|---|
| `make level3` | `make down`, Frontend bauen, nginx starten (wie Level 2), Backend bauen (`go build`) und im Hintergrund starten (`.run/backend.pid`), auf 8080 **und** 8081 warten; schreibt `3` nach `.run/level` |
| `make check` | prüft die Levels 1 bis `.run/level`. Ab Level 3 läuft dazu `go test ./...` |
| `make down` | stoppt zusätzlich das Backend |

### Prüfsuite des Agenten (neue Checks für Level 3, Entwurf)
- Backend antwortet auf `/api/health`
- `GET /api/levels` liefert alle 10 Levels im Schema
- Ergebnis melden setzt Status und Zeitpunkt
- Fehlschlag sperrt höhere Levels
- Ungültige Anfragen ergeben 400
- Unbekanntes Level ergibt 404
- Go-Tests bestehen

### Prüfer für Level 3
1. Level 1 und 2 müssen bestanden sein.
2. `make level3`: Ports 8080 und 8081 antworten.
3. Eigene API-Tests gegen die OpenAPI-Datei:
   - jede Antwort gegen das Schema,
   - alle Regeln und Fehlerfälle (400, 404, 405, 409, 413, 415),
   - die Reihenfolge-Regel.
4. **Gleichzeitige Meldungen**, z. B. 50 parallele POSTs: kein Absturz, ein konsistenter Endzustand.
5. Neustart setzt zurück: nach `make down` und `make level3` ist alles wieder offen.
6. `go.mod` ohne Abhängigkeiten, `go vet` sauber, eigenes `go test` grün. Die Abdeckung ist ein Nebenwert.
7. `make check` meldet Level 1–3 bestanden, mit den Checks wörtlich wie in der Spec.
8. `make down` beendet nginx und Backend; die Ports sind danach frei.

### Auswirkungen auf die Spec (v0.3.0)
- Neu sind `04-api.md`, `openapi.yaml` und `levels/level-03.md`.
- `02`: Go wird ab jetzt genutzt.
- `03`: `backend/`, `make level3`, Port 8081.
- Korrekturen aus Lauf 003: `*.tsbuildinfo` in die `.gitignore`.

### Nächster Schritt (erst auf dein Go)
1. Referenz für Level 3 bauen.
2. Spec v0.3.0 schreiben.
3. Prüfer für Level 3 bauen, mit Gegenprobe.
4. Nachbau-Test bis Level 3.

---

## 17. Level 4 im Detail – „Datenbank“

**Status (2026-11-20):** gebaut. Erledigt sind:
- Referenz mit SQLite (Go-Abdeckung 72,9 %)
- Spec v0.4.0
- Prüfer `judge/level4.mjs`

Die Referenz erreicht im Container Level 4 (Score 40).

**Gegenproben:**
- Ohne eine einzelne Verbindung und ohne `busy_timeout` scheitert schon Level 3: 19 von 50 gleichzeitigen Anfragen enden mit 5xx.
- Eine falsch sortierte Historie und eine fehlende `user_version` erkennt der Prüfer für Level 4. Die Go-Tests der Referenz finden sie ebenfalls.

Dabei ist der Prüfer robuster geworden: Ein nicht erreichbares Backend lässt ihn nicht mehr abbrechen.

**Beobachtung:** Der Go-Proxy lieferte einmal kurz `403`. Jeder frische Container lädt die SQLite-Module neu, das dauert etwa 10 s. Möglich wäre, die Module im Image vorzuhalten. Das ist noch nicht entschieden.

Offen ist noch der Nachbau-Test bis Level 4 (Lauf 004).

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Speicherort | **SQLite als Datei** `.run/levelboard.db`. Ein Neustart nur des Backends behält die Daten; jedes `make levelN` (N ≥ 3) löscht die Datei vorher. „Neustart setzt zurück“ gilt also weiter auf Level-Ebene |
| Bibliothek | genau **eine** Abhängigkeit: `modernc.org/sqlite` **v1.62.0** (reines Go, kein C-Compiler nötig). Sonst weiterhin nur Standardbibliothek, Zugriff über `database/sql` |
| Schema | **exakt vorgegeben** (Tabellen, Spalten, Typen, Migration). Der Prüfer öffnet die Datei selbst (`node:sqlite`) |
| SQLite-Fallen | die Spec **benennt sie kurz**: eine offene Verbindung (`SetMaxOpenConns(1)`), `journal_mode=WAL`, `busy_timeout=5000` |
| Historie | `GET /api/levels/{n}/history` je Level, neueste zuerst, `?limit=` (Standard 50, 1–500) |

### Schema (Entwurf)
```sql
-- Migration 1 (PRAGMA user_version = 1)
CREATE TABLE levels (
  level        INTEGER PRIMARY KEY CHECK (level BETWEEN 1 AND 10),
  status       TEXT    NOT NULL CHECK (status IN ('offen','bestanden','fehlgeschlagen','gesperrt')),
  checked_at   TEXT,                     -- ISO wie toISOString(), NULL wenn offen/gesperrt
  duration_ms  INTEGER,
  checks       TEXT    NOT NULL DEFAULT '[]',   -- JSON-Array
  metrics      TEXT    NOT NULL DEFAULT '{}'    -- JSON-Objekt
);
CREATE TABLE reports (                  -- Historie: jede angenommene Meldung
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  level        INTEGER NOT NULL REFERENCES levels(level),
  status       TEXT    NOT NULL CHECK (status IN ('bestanden','fehlgeschlagen')),
  checked_at   TEXT    NOT NULL,
  duration_ms  INTEGER NOT NULL,
  checks       TEXT    NOT NULL,
  metrics      TEXT    NOT NULL
);
CREATE INDEX reports_level ON reports(level, id);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);  -- 'updated_at'
```
- Beim Start prüft das Backend `PRAGMA user_version`. Ist sie 0, legt es die Tabellen in **einer Transaktion** an, füllt `levels` mit den 10 Startzeilen (`offen`) und setzt `user_version = 1`.
- Eine Meldung ändert `levels`, `reports` und `meta` in **einer Transaktion**. Eine Meldung mit 409 schreibt nichts.

### API-Erweiterung
`GET /api/levels/{n}/history?limit=50`:
```json
{ "level": 2, "entries": [ { "id": 7, "status": "bestanden", "checkedAt": "…", "durationMs": 120, "checks": [ … ], "metrics": {} } ] }
```
- Neueste zuerst (nach `id` absteigend).
- `limit` muss eine ganze Zahl von 1 bis 500 sein, sonst 400.
- Unbekanntes Level ergibt 404, eine falsche Methode 405.
- Alle übrigen Endpunkte bleiben **unverändert**. Die Prüfungen aus Level 3 müssen weiterhin bestehen.

### Makefile ab Level 4
| Befehl | Wirkung |
|---|---|
| `make level4` | wie `make level3`, das Backend nutzt `.run/levelboard.db`. Die Datei wird vorher gelöscht. Schreibt `4` nach `.run/level` |
| `make restart-backend` | **neu**: stoppt nur das Backend und startet es wieder, **ohne** die Datenbank zu löschen. Feste Schnittstelle für den Prüfer |
| `make check` | prüft die Levels 1 bis `.run/level` |

Der Pfad der Datenbank kommt über die Umgebungsvariable `LEVELBOARD_DB` (Standard `.run/levelboard.db`). Auch `make level3` löscht ab jetzt die Datei vor dem Start.

### Prüfsuite des Agenten (neue Checks für Level 4, Entwurf)
- Meldungen erscheinen in der Historie, neueste zuerst
- Historie begrenzt mit limit
- Daten überstehen einen Neustart des Backends (über `make restart-backend`)
- Abgelehnte Meldungen landen nicht in der Historie
- Datenbank hat das vorgegebene Schema (über `node:sqlite` aus der Prüfsuite heraus)

### Prüfer für Level 4
1. Die Levels 1–3 müssen bestanden sein.
2. `make level4` startet alles, und `.run/levelboard.db` existiert.
3. Er öffnet die DB-Datei selbst:
   - Tabellen und Spalten wie in der Spec,
   - `user_version = 1`,
   - nach Meldungen stimmen Datei und API überein.
4. Historie: Reihenfolge, Inhalte, `limit` samt Fehlerfällen; Meldungen mit 409 sind nicht enthalten.
5. Persistenz: Meldungen, dann `make restart-backend`. Danach sind Stand und Historie unverändert.
6. Last: 100 gleichzeitige Meldungen. Kein 5xx, die Historie enthält **genau** 100 neue Einträge, und der Endzustand ist konsistent.
7. Der API-Vertrag aus Level 3 gilt weiterhin; die Prüfungen von L3-K2 werden erneut ausgeführt.
8. `go.mod` hat genau die eine Abhängigkeit in der vorgegebenen Version, `go vet` ist sauber, `go test` grün.
9. `make check` meldet Level 1–4 bestanden. Die Startdatei bleibt unverändert, `make down` gibt die Ports frei.

### Auswirkungen auf die Spec (v0.4.0)
- `04-api.md` und `openapi.yaml` bekommen die Historie.
- `05-datenmodell.md` bekommt das DB-Schema.
- `03` bekommt `make level4`, `make restart-backend` und `LEVELBOARD_DB`.
- `level-03.md`: Die Regel „ohne `require`“ gilt nur bis Level 3. Ab Level 4 ist genau die SQLite-Abhängigkeit erlaubt.
- `levels/level-04.md` kommt neu dazu.

### Nächster Schritt (erst auf dein Go)
1. Referenz für Level 4 bauen.
2. Spec v0.4.0 schreiben.
3. Prüfer für Level 4 bauen, mit Gegenprobe.
4. Nachbau-Test bis Level 4 (Lauf 004 neu).

---

## 18. Level 5 im Detail – „Frontend + Backend“

**Status (2026-11-20):** gebaut. Erledigt sind:
- Referenz (Live-Dashboard, `nginx-api.conf`, Meldung an die API)
- Spec v0.5.0
- Prüfer `judge/level5.mjs` mit Browser

Die Referenz erreicht im Container Level 5 (Score 50); die Live-Anzeige reagiert nach rund 5 s. Die Gegenprobe (keine Abfrage, alte Daten bei Ausfall, fehlendes `charset off`) wird vollständig erkannt.

**Funde beim Bauen:**
- nginx hängt wegen `charset_types` an weitergeleitete JSON-Antworten `; charset=utf-8` an. Abhilfe ist `charset off` im Block `/api/`; das steht jetzt in der Spec.
- Der Go-Proxy lieferte erneut `403` und ließ einen Prüferlauf scheitern. Entschieden: Die Go-Module (`modernc.org/sqlite` v1.62.0 samt Abhängigkeiten) liegen jetzt **im Image**. Builds laufen damit ohne Proxy, Agent und Prüfer sind nicht mehr vom Netz abhängig.
- Im Prüfer war ein eigener Fehler: Meldungen ohne Body. Er prüft jetzt, dass seine eigenen Meldungen angenommen werden.

Noch offen ist die **Prüfung von Lauf 005** (Nachbau der Levels 1–4 mit Spec 0.4.0). Der Lauf ist durchgelaufen, aber noch nicht geprüft.

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Datenquelle | **feste Einstellung** über `config.json` im Build: `{"source":"file"}` (Level 1–4) bzw. `{"source":"api"}` (Level 5). Fällt das Backend aus, zeigt die Seite einen Hinweis, nicht still alte Daten |
| Aktualisierung | im API-Modus **alle 5 Sekunden** `/api/levels` abfragen, also ein Live-Dashboard. Im Datei-Modus wie bisher einmalig |
| Melden | `make check` schreibt **weiter `results.json`** und meldet ab Level 5 **zusätzlich** jedes geprüfte Level per `POST` ans Backend (aufsteigend, Abbruch nach dem ersten Fehlschlag) |
| nginx | **eigene Datei** `frontend/nginx-api.conf` = Regeln aus Level 2 plus `location /api/` → `127.0.0.1:8081`. `nginx.conf` bleibt für Level 2–4 unverändert |

### Frontend
- `public/config.json` mit `{"source":"file"}` gehört zum Build. `make level5` überschreibt `dist/config.json` mit `{"source":"api"}`.
- Beim Start lädt die Seite `/config.json` (`no-store`). Fehlt die Datei oder ist sie ungültig, gilt `file`.
- **Datei-Modus:** unverändert wie in Level 1–4.
- **API-Modus:** `GET /api/levels` über dieselbe Adresse (Port 8080, nginx leitet weiter), danach alle 5 s erneut.
  - Antwort gültig → Anzeige wie bisher (`data-state="ok"`).
  - Netzwerkfehler, 5xx oder HTML statt JSON → `data-state="unavailable"`, Hinweis „Backend nicht erreichbar. Neuer Versuch alle 5 Sekunden.“ und Leerzustand (alle offen). Keine veralteten Daten.
  - Daten verletzen das Schema → `invalid` wie bisher.
  - Ist das Backend wieder da, verschwindet der Hinweis beim nächsten Abruf.
- In der Kopfzeile steht zusätzlich die **Quelle**: „Quelle: Datei“ bzw. „Quelle: Backend“ (`data-testid="run-source"`, `data-source="file|api"`).

### nginx (`frontend/nginx-api.conf`)
- Alle Regeln aus Level 2 bleiben: Cache, 404, gzip, `server_tokens off`.
- `location /api/` → `proxy_pass http://127.0.0.1:8081`. Statuscodes, JSON und Header des Backends werden durchgereicht. Bei `/api/` kommt also auch ein 404 als JSON vom Backend.
- `Cache-Control: no-store` für `/api/` und für `/config.json` (`/config.json` auch in `nginx.conf`).

### Makefile ab Level 5
| Befehl | Wirkung |
|---|---|
| `make level5` | wie `make level4`, aber nginx mit `frontend/nginx-api.conf`. Schreibt `{"source":"api"}` nach `frontend/dist/config.json` und `5` nach `.run/level` |
| `make stop-backend` | **jetzt öffentlich**: beendet nur das Backend (für den Prüfer: Ausfall nachstellen) |
| `make check` | prüft die Levels 1–N. Ab Level 5 meldet `write-results.mjs` zusätzlich an `API_URL` |

### Prüfsuite des Agenten (neue Checks für Level 5, Entwurf)
- Seite liest aus dem Backend
- nginx leitet /api/ an das Backend weiter
- Gemeldetes Ergebnis erscheint ohne Neuladen
- Backend-Ausfall wird angezeigt (Ausfall in Playwright durch Abfangen der Anfrage nachgestellt; das echte Backend läuft weiter)
- Ergebnisse werden ans Backend gemeldet (nach dem Lauf von `write-results.mjs` nicht prüfbar, deshalb als Probe-Meldung über die Weiterleitung)

### Prüfer für Level 5
1. Die Levels 1–4 müssen bestanden sein. Damit ist auch der Datei-Modus weiter geprüft.
2. `make level5`: 8080 und 8081 antworten, `/config.json` liefert `{"source":"api"}`, die Kopfzeile zeigt „Quelle: Backend“.
3. **Weiterleitung:** `/api/health`, `/api/levels` und Fehlerfälle über 8080 sind identisch zum direkten Aufruf (Status, JSON, `Content-Type`). Die Regeln aus Level 2 gelten mit `nginx-api.conf` weiterhin.
4. **Live-Anzeige:** Der Prüfer meldet eigene Ergebnisse (bestanden, fehlgeschlagen, gesperrt). Die Seite zeigt sie **ohne Neuladen** innerhalb von 7 s richtig an.
5. **Ausfall:** Nach `make stop-backend` erscheint innerhalb von 7 s der Hinweis samt Leerzustand. Nach `make restart-backend` sind die Daten wieder da und der Hinweis ist weg.
6. **`make check`:** Exit 0. `results.json` **und** `/api/levels` melden die Levels 1–5 als bestanden, mit den Checks wörtlich wie in der Spec. Die Historie enthält die Meldungen.
7. `public/results.json` und `public/config.json` sind unverändert. `make down` gibt die Ports frei.

### Auswirkungen auf die Spec (v0.5.0)
- `05-datenmodell.md`: `config.json`, Ladezustände im API-Modus, Melden an die API.
- `06-design.md`: Quelle in der Kopfzeile, Hinweis „Backend nicht erreichbar“, `data-testid` `run-source`.
- `03-architektur.md`: `make level5`, `make stop-backend`, `nginx-api.conf`.
- `levels/level-05.md` kommt neu dazu.

### Nächster Schritt (erst auf dein Go)
1. Referenz für Level 5 bauen.
2. Spec v0.5.0 schreiben.
3. Prüfer für Level 5 bauen, mit Gegenprobe.

---

## 19. Level 6 im Detail – „Repo + CI“

**Status (2026-11-20):** gebaut. Erledigt sind:
- Organisation `specrun-lab` und zwei Tokens
- Image `ghcr.io/specrun-lab/devcontainer:1` (amd64 + arm64, öffentlich, ohne Zugangsdaten geprüft)
- Referenz als echtes Repo [`specrun-lab/levelboard-referenz`](https://github.com/specrun-lab/levelboard-referenz), Pipeline grün in rund 80 s
- Spec v0.6.0
- Prüfer `judge/level6.mjs`

Die Referenz erreicht Level 6 (Score 60). Die Gegenprobe (nicht gepusht, falsches Image, ohne `if: always()`, unechtes Token in der Historie) wird vollständig erkannt.

**Funde:**
- **VPN:** Mit aktivem VPN sperrt Google seinen Speicher („not available in your location“). Das betrifft Go-Proxy, Go-Downloads und Chromium und war die Ursache aller `403` der letzten Stunden. Go kommt jetzt zusätzlich aus dem Docker-Hub-Image `golang:1.27.4`.
- **`go build` im Container-Job:** „error obtaining VCS status“, weil Git als root den Arbeitsordner eines anderen Eigentümers ablehnt. Abhilfe ist `GOFLAGS: … -buildvcs=false`; das steht jetzt in der Spec.
- **Aktionen:** `checkout` und `upload-artifact` auf **v7** (v4 nutzt das veraltete Node 20).
- **Paket-Sichtbarkeit:** GitHub legt Pakete privat an. Umstellen geht nur in der Weboberfläche (einmalig erledigt).

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Sichtbarkeit | Die Repos in `specrun-lab` sind **öffentlich**. Actions ist dann kostenlos, und der Code der Agenten ist einsehbar |
| CI-Umgebung | die Pipeline läuft **in unserem Container-Image**, einmalig veröffentlicht als `ghcr.io/specrun-lab/devcontainer:<version>`, also mit gleichen Versionen wie Agent und Prüfer |
| Aufräumen | nach der Prüfung **archiviert** `uebernehmen.sh` das Repo: nur noch lesbar, bleibt als Nachweis |
| Vorgaben | **feste Eckpunkte** (Datei, Auslöser, Job, Image, Schritte, Artefakt); das YAML selbst schreibt der Agent |

### Was du vorab bereitstellen musst
1. **GitHub-Organisation `specrun-lab`** (kostenloser Plan). Unter Einstellungen „Personal access tokens“ müssen fein granulierte Tokens erlaubt sein.
2. **Token für den Agenten** (fein granuliert):
   - Besitzer: `specrun-lab`, „All repositories“, Laufzeit z. B. 30 Tage.
   - Rechte auf Repos: Administration *lesen/schreiben* (zum Anlegen), Contents *lesen/schreiben*, Workflows *lesen/schreiben*, Actions *lesen*, Metadata *lesen*.
   - Auf dem Mac als `SPECRUN_AGENT_GH_TOKEN` setzen (wie das Claude-Token).
3. **Token für den Prüfer**: nur lesen (Contents, Actions, Metadata). Auf dem Mac als `SPECRUN_JUDGE_GH_TOKEN`. Artefakte lassen sich auch bei öffentlichen Repos nur mit Token herunterladen.
4. **Container-Image in der GHCR** veröffentlichen (einmalig, mit deinem eigenen Login) und als Paket **öffentlich** stellen.

### Was der Agent tut
- Im Container stehen `GH_TOKEN` (aus `SPECRUN_AGENT_GH_TOKEN`) und `RUN_ID` (z. B. `lauf-006`, von `prepare-run.sh` gesetzt) bereit.
- Er legt **öffentlich** `specrun-lab/levelboard-<RUN_ID>` an (`gh repo create`). Git-Identität: `Levelboard Agent <agent@specrun.invalid>`. Danach pusht er nach `main`, mit `gh auth setup-git` und HTTPS.
- **Pipeline** `.github/workflows/ci.yml`, feste Eckpunkte:
  - Name `CI`; Auslöser `push` auf `main` und `workflow_dispatch`
  - ein Job `check` auf `ubuntu-latest` mit `container: image: ghcr.io/specrun-lab/devcontainer:<version>`, `options: --user root`
  - `GOMODCACHE` und `GOCACHE` zeigen auf den Vorrat im Image, `PLAYWRIGHT_BROWSERS_PATH` bleibt
  - Schritte: Checkout → `make level5` → `make check` → Artefakt `levelboard-report` hochladen (`frontend/dist/results.json` und `checks/.out/playwright.json`), **auch wenn `make check` scheitert** (`if: always()`)
  - der Job ist nur grün, wenn `make check` grün ist
- `make level6` = `make level5` plus `6` nach `.run/level`. In der Pipeline läuft nur bis Level 5, keine Rekursion.
- **Checks für Level 6** (laufen lokal in `make check` und fragen GitHub ab), Entwurf:
  - Repo existiert und ist öffentlich
  - Lokaler Stand ist gepusht
  - Letzter Pipeline-Lauf ist grün
  - Report enthält Level 1–5 bestanden
- Zugangsdaten nie in Dateien, Logs oder Commits schreiben.

### Prüfer für Level 6
1. Die Levels 1–5 müssen bestanden sein (lokal).
2. Das Repo `specrun-lab/levelboard-<RUN_ID>` existiert, ist öffentlich und hat einen `main`-Branch. Der lokale `HEAD` des Agenten entspricht `origin/main`.
3. `.github/workflows/ci.yml` erfüllt die Eckpunkte: Image, Auslöser, Job, `if: always()` beim Artefakt.
4. Der **letzte Lauf** von `CI` für den Commit von `main` ist `completed/success`.
5. Das **Artefakt** `levelboard-report` existiert. Seine `results.json` meldet Level 1–5 als `bestanden`, mit den Checks wörtlich aus der Spec; `playwright.json` passt dazu.
6. **Keine Zugangsdaten** im Repo, in der ganzen Git-Historie und in den Logs des Laufs (Suche nach Token-Mustern wie `github_pat_`, `ghp_`, `sk-ant-`).
7. Selbstmessung: `make check` meldet Level 1–6 bestanden.
8. Nebenwerte: Dauer des Pipeline-Laufs, Anzahl der Pipeline-Läufe (Versuche des Agenten), Anzahl der Commits.

### Risiken
- Der Agent bekommt echte Schreibrechte in `specrun-lab`. Begrenzt wird das durch Token-Rechte, die Beschränkung auf die eine Organisation und die Laufzeit.
- Die Pipeline-Läufe kosten Zeit, oft mehrere Minuten pro Versuch. Das Zeitlimit des Laufs sollte das berücksichtigen.

### Nächster Schritt (erst auf dein Go)
1. Du legst Organisation und Tokens an (Anleitung folgt).
2. Ich veröffentliche das Image (mit deinem Login) und baue die Referenz für Level 6 als echtes Repo in `specrun-lab`.
3. Spec v0.6.0.
4. Prüfer für Level 6, mit Gegenprobe.

---

## 20. Level 7 im Detail – „Images in der Pipeline“

**Status (2026-11-20):** gebaut. Erledigt sind:
- Referenz mit Dockerfiles, Compose, Container-Suite und Job `images`
- Spec v0.7.0
- Prüfer `judge/level7.mjs`

Im Referenz-Repo sind beide Jobs grün (`check` ~1:20 min, `images` ~2 min). Die Referenz erreicht Level 7 (Score 70); die Images sind komprimiert 25,2 MB (Frontend) und 8,3 MB (Backend) groß. Die Gegenprobe (Backend als root, Port nach außen, falsche Weiterleitung, nicht gepusht) wird vollständig erkannt.

**Funde:**
- **Sichtbarkeit:** Pakete, die per `GITHUB_TOKEN` gepusht werden und über das Label `org.opencontainers.image.source` mit einem öffentlichen Repo verknüpft sind, werden **automatisch öffentlich**. Plan B (Lese-Token auf dem Server) ist nicht nötig.
- **Abweichung vom Entwurf:** Der Prüfer startet die Images nicht selbst, weil er lokal kein Docker hat. Er liest sie ohne Anmeldung aus der Registry (Manifest, Konfiguration, Labels, Benutzer, Ports, Umgebung). Gestartet und von außen geprüft werden sie in Level 8 auf dem Server.
- **Prüfer Level 6:** Er erlaubt jetzt neben `check` auch den Job `images`.
- **Container-Suite:** Sie läuft direkt auf dem Runner (mit `setup-node`), nicht im Werkstatt-Image, weil sie `docker compose restart` braucht.

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Basis-Images | Frontend **`nginx:1.31.9-alpine`**, Backend **`alpine:3.23`**, Builder `node:26.13.0-alpine` und `golang:1.27.4-alpine`. Alles von Docker Hub (keine Google-Registry) |
| Sichtbarkeit | App-Images **öffentlich**. Ob GitHub das bei Verknüpfung mit dem öffentlichen Repo (`org.opencontainers.image.source`) automatisch macht, wird beim Bau der Referenz **ausprobiert**. Falls nicht: Plan B mit Lese-Token auf dem Server (Level 8) |
| Tests in der Pipeline | eine **eigene Container-Suite** `checks/tests/container.spec.ts`. Die bestehenden Level-Tests bleiben lokal |

### Images
- **`frontend/Dockerfile`**, mehrstufig:
  1. `node:26.13.0-alpine` baut mit `npm ci` und `npm run build`.
  2. `nginx:1.31.9-alpine` mit `dist/`, `{"source":"api"}` als `config.json` und **`frontend/nginx-container.conf`**.
  - Die Konfiguration hat die Regeln aus Level 2/5. nginx lauscht auf `0.0.0.0:8080` und leitet `/api/` an `http://backend:8081` weiter.
- **`backend/Dockerfile`**, mehrstufig:
  1. `golang:1.27.4-alpine` mit `CGO_ENABLED=0 go build -buildvcs=false`.
  2. `alpine:3.23` mit dem Programm, ohne root (eigener Benutzer), Datenbank unter `/data/levelboard.db` (Volume).
- **Backend-Adresse aus `LEVELBOARD_ADDR`**, Standard `127.0.0.1:8081`, im Container `0.0.0.0:8081`. Das ist eine kleine Änderung am Backend.
- **`docker-compose.yml`:**
  - `backend` mit Volume `levelboard-data:/data` und Healthcheck auf `/api/health`.
  - `frontend` mit Port `8080:8080`, startet erst, wenn `backend` gesund ist.
  - Images werden per `image:` benannt, damit sie sich pushen lassen.
- Labels in beiden Images: `org.opencontainers.image.source=https://github.com/<repo>` und `…revision=<commit>`.

### Pipeline (Erweiterung von `ci.yml`)
- Neuer Job **`images`**: `needs: check`, `runs-on: ubuntu-latest` (ohne Container, weil Docker gebraucht wird), `permissions: packages: write, contents: read`.
- Schritte:
  1. Checkout.
  2. `docker compose build`.
  3. `docker compose up -d --wait`.
  4. Container-Suite ausführen: im Image `ghcr.io/specrun-lab/devcontainer:1` mit `--network host` und eingehängtem Arbeitsordner.
  5. Report als Artefakt **`levelboard-container-report`** hochladen (`if: always()`).
  6. Nur bei Erfolg: mit `GITHUB_TOKEN` bei der GHCR anmelden und pushen.
- Ziel-Images:
  - `ghcr.io/specrun-lab/levelboard-<RUN_ID>-frontend:<commit-sha>`
  - `ghcr.io/specrun-lab/levelboard-<RUN_ID>-backend:<commit-sha>`
  - zusätzlich jeweils `:main`
- Am Ende `docker compose down -v` (`if: always()`).

### Container-Suite (`checks/tests/container.spec.ts`, Entwurf, ~6 Checks)
- Seite über nginx im Container, Quelle „Backend“
- `/api/health` über 8080 weitergeleitet
- Meldung über 8080 erscheint ohne Neuladen
- Daten überstehen einen Neustart des Backend-Containers (`docker compose restart backend`)
- Cache- und gzip-Regeln wie in Level 2
- Backend-Container läuft nicht als root

### Lokale Checks für Level 7 (in `make check`, fragen GitHub ab)
- Job `images` des letzten Laufs ist grün
- Beide Images mit dem aktuellen Commit-Hash liegen in der GHCR
- Report der Container-Suite enthält nur bestandene Checks

### Prüfer für Level 7
1. Die Levels 1–6 müssen bestanden sein.
2. Dockerfiles und Compose erfüllen die Eckpunkte: Basis-Images, mehrstufig, kein root im Backend, Volume, Healthcheck.
3. Der Job `images` im letzten Lauf ist `success`. Das Artefakt `levelboard-container-report` belegt die bestandenen Container-Checks.
4. Beide Images liegen mit dem Tag des aktuellen Commits in der GHCR. Labels `source` und `revision` stimmen.
5. **Eigene Nachprüfung:** Ein Prüfer-Workflow in GitHub Actions (mit dem Lese-Token) zieht die Images, startet sie mit einer eigenen Compose-Datei und prüft Kernfunktionen. So wird das gemessen, was später ausgeliefert wird.
6. Nebenwerte: Image-Größen, Dauer des Jobs `images`.

### Nächster Schritt (erst auf dein Go)
1. Backend um `LEVELBOARD_ADDR` erweitern, Dockerfiles, Compose, Container-Suite und Pipeline in der Referenz bauen.
2. Im Referenz-Repo ausprobieren, inklusive der Sichtbarkeit der Pakete.
3. Spec v0.7.0.
4. Prüfer für Level 7.
5. Danach gemeinsamer Test: Lauf 005 prüfen und einen neuen Nachbau bis Level 7 starten.

---

## 21. Token-Verbrauch pro Level

**Status (2026-11-20):** gebaut. Erledigt sind:
- `runner/tokens.mjs`
- `protokoll/` im Laufordner, eingehängt nach `~/.claude/projects`
- Auswertung in `pruefen.sh`, Tabelle im Bericht
- `uebernehmen.sh` committet und pusht den Bericht (nur `runs/lauf-<nr>/`) auf GitHub

**Erkenntnis aus Lauf 007 („Bond“):**
- 14 Minuten bis Level 7, 39 Antworten, 65 587 Ausgabe-Tokens.
- 86 % der Ausgabe fielen in die Phase bis Level 1: Der Agent schreibt zuerst den gesamten Code und prüft danach Level für Level.
- Zweitgrößter Block ist GitHub (Level 6–7, 5 Minuten, vor allem Warten auf die Pipeline).
- Modell war **`claude-sonnet-5-5`**, der Standard der Kommandozeile im Container. Für vergleichbare Läufe wird das Modell seither fest vorgegeben (siehe unten).

**Modell des Agenten (entschieden):**
- Standard ist **Sonnet 5.5** (`claude-sonnet-5-5`): halb so teuer wie Opus 5.5 ($2/$10 statt $4/$20 pro Mio. Tokens Eingabe/Ausgabe) und hat Level 7 auf Anhieb geschafft. Lauf 007 hätte mit Sonnet ≈ $1.60 gekostet, mit Opus ≈ $3.20 (hochgerechnet).
- Opus 5.5 gelegentlich zum Vergleich, vor allem ab Level 8–10.
- Haiku 5.5 als Härtetest für die Spec: Je schwächer das Modell, desto mehr muss die Spec leisten.
- Umsetzung: `runner/prepare-run.sh --modell <sonnet|opus|haiku|modell-id>` trägt `ANTHROPIC_MODEL` in den Agent-Container ein und legt `<lauf>/modell.txt` für den Prüfer ab. Der Bericht zeigt das vorgegebene Modell und warnt, wenn das Protokoll ein anderes zeigt.

Ursprüngliche Planung:
- **Quelle:** das Session-Protokoll von Claude Code im Agent-Container (`~/.claude/projects/…/*.jsonl`). Es enthält pro Antwort die Tokens (Eingabe, Cache-Lesen, Cache-Schreiben, Ausgabe) mit Zeitstempel sowie alle Befehle des Agenten.
- **Zuordnung zu Levels:** an den Befehlen des Agenten (`make levelN`, `make check`, `git push`, `gh run watch`). Der Abschnitt bis zum ersten erfolgreichen Check eines Levels zählt zu diesem Level.
- **Ablage:** Jeder Laufordner bekommt `protokoll/`, eingehängt nach `~/.claude/projects` im Agent-Container. So bleibt es pro Lauf erhalten, und es gibt trotzdem kein gemeinsames Gedächtnis zwischen Läufen.
- **Bericht:** Tabelle je Level mit Tokens, Kosten (aus den Tokens berechnet), Dauer und Pipeline-Versuchen. `/cost` von Hand entfällt.
- **Lauf 007:** Das Protokoll wird nachträglich mit `podman cp` aus dem gestoppten Container geholt. Den Container bis dahin **nicht entfernen**.

---

## 22. Level 8 im Detail – „Deployment“

**Status (2026-11-20):** gebaut und live bestätigt. Erledigt sind:
- Server-Einrichtung `infra/server/` (cloud-init, Setup-Skript, Caddy)
- Referenz mit Commit in API und Kopfzeile, `deploy/compose.yml`, `report-live.mjs`, Job `deploy`
- Spec v0.8.0
- Prüfer `judge/level8.mjs`

Lokal getestet:
- Caddyfile mit Caddy 2.11.9 (Podman): Freigabe nur für `lauf-<nr>` und `referenz`, Weiterleitung an `<RUN_ID>-web:8080` (200), fehlender Lauf ergibt 502, HTTP leitet auf HTTPS um.
- Die cloud-init-Datei ist gültiges YAML und enthält die Dateien unverändert.
- Referenz: Level 1–5 weiterhin bestanden; Commit in `/api/health`, `run.commit` und Kopfzeile; `report-live.mjs` meldet Level 1–5.
- Prüfer: Die Dateiprüfung (L8-K1) besteht mit der Referenz. Die Gegenprobe (falscher Alias, `StrictHostKeyChecking no`, fehlender Commit im Image) wird erkannt.

Live-Test (2026-11-20):
- Server `specrun-1`: Hetzner CX23 (2 vCPU, 4 GB, x86) in Helsinki, Ubuntu 24.04, rund 7.70 USD pro Monat. CX23 war in Nürnberg nicht verfügbar. Die Einrichtung per cloud-init klappte auf Anhieb.
- Von außen: HTTP leitet auf HTTPS um; `referenz.…` bekommt ein Zertifikat, fremde Namen nicht; Port 5555 ist nicht erreichbar.
- Referenz-Repo: Alle drei Jobs grün (`check`, `images`, `deploy`). Die Referenz ist live unter `https://referenz.<domain>` mit dem richtigen Commit.
- Prüfer Level 8: alle 4 Kriterien bestanden, `make check` Level 1–8 bestanden. Die Referenz erreicht **Level 8 (Score 80)**.

Funde:
- Ein neues Hetzner-Konto muss vor dem ersten Projekt verifiziert werden (Kreditkarte oder Ausweis).
- Org-Secrets setzen braucht im `gh`-Login den Scope `admin:org` (`gh auth refresh -s admin:org`).

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Adresse | **sslip.io**, keine eigene Domain: `https://<RUN_ID>.<ip-mit-strichen>.sslip.io`. Eine eigene Domain lässt sich später einsetzen (`vorbereiten.sh <domain>` plus Wildcard-DNS) |
| Pro Lauf | **eigene Adresse** pro Lauf. Alte Läufe bleiben live, bis wir aufräumen; der Prüfer kann auch später noch messen |
| Routing | Caddy und alle Läufe im Docker-Netz `web`. Caddy leitet nach dem ersten Namensteil an `<RUN_ID>-web:8080` weiter. **On-Demand TLS** mit Freigabe-Endpunkt: Zertifikate nur für `lauf-<nr>.<domain>` und `referenz.<domain>`. Keine Ports pro Lauf |
| Vorgabe an den Agenten | **feste Eckpunkte**: `~/runs/<RUN_ID>/`, Projektname `RUN_ID`, Alias `<RUN_ID>-web`, keine Ports, Image-Tag = Commit, Namen der Secrets, `StrictHostKeyChecking yes` |
| Commit-Nachweis | `LEVELBOARD_COMMIT` (aus dem Build-Argument `REVISION`) → `/api/health.commit` und `run.commit`; die Kopfzeile zeigt die ersten 7 Zeichen (`run-commit`) |
| Live-Daten | SQLite in einem Volume pro Lauf. Der Job `deploy` meldet nach dem Deployment die Ergebnisse von Level 1–5 aus dem Job `check` an die Live-API (`report-live.mjs`) |
| Server | wird **in der Hetzner-Konsole** von Hand angelegt, mit unserer cloud-init-Datei. Kein Hetzner-Token auf dem Mac |
| Zugangsdaten | Org-Secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, Org-Variable `LIVE_DOMAIN`. Gesetzt von `verbinden.sh` mit dem eigenen `gh`-Login. Lokal bekommen Agent und Prüfer nur `LIVE_DOMAIN` |

### Server (`infra/server/`)
- `vorbereiten.sh` erzeugt einen eigenen ed25519-Schlüssel nur für `deploy` und die cloud-init-Datei. Beides liegt in `~/.specrun/server/`, außerhalb des Repos.
- Die cloud-init-Datei richtet ein:
  - Docker aus dem offiziellen Paketarchiv
  - Benutzer `deploy` (nur Docker)
  - SSH nur mit Schlüssel
  - ufw: 22, 80, 443
  - Netz `web`
  - Caddy 2.11.9 (`compose.yml`, `Caddyfile`)
- Die Domain ergibt sich aus der öffentlichen IP (Hetzner-Metadaten).
- `verbinden.sh <ip>` liest den Host-Schlüssel, wartet auf das Ende der Einrichtung, zeigt Docker- und Caddy-Status und setzt nach Rückfrage Secrets und Variable.

### Bewusst in Kauf genommen
- Die Docker-Gruppe ist praktisch root. Für einen Wegwerf-Server ist das vertretbar.
- Die Live-API ist ohne Anmeldung beschreibbar (wie lokal). Wer will, kann Ergebnisse fälschen; der Prüfer misst deshalb selbst von außen.
- Der Host-Schlüssel wird einmalig per `ssh-keyscan` vom Mac übernommen (Vertrauen beim ersten Kontakt). Ein Abgleich in der Hetzner-Konsole ist möglich.

---

## 23. Level 9 im Detail – „Live-Prüfung“

**Status (2026-11-20):** gebaut und live bestätigt. Erledigt sind:
- Referenz mit Lasttest (`checks/loadtest.mjs`), Live-Suite (`checks/tests/level9.spec.ts`, 5 Checks) und Meldung an die Live-API (`write-results.mjs` mit `REPORT_LIVE`)
- Spec v0.9.0
- Prüfer `judge/level9.mjs`

Inkrementell gebaut: Die Referenz bekam nur die neuen Dateien, die laufende App blieb gleich. Getestet wurde direkt gegen die Live-Seite.

### Entscheidungen
| Thema | Entscheidung |
|---|---|
| Live-Suite | **eigene Datei** mit live-tauglichen Checks: Seite und Kopfzeile, Cache und gzip, API-Fehlerfälle, Meldung ohne Neuladen, Lasttest. Lokale Checks (Backend stoppen, nginx-Dateien, Datenbank-Datei) bleiben lokal |
| Lasttest | **eigenes Node-Skript** ohne Abhängigkeit: 10 Verbindungen, 30 s, abwechselnd `/` und `/api/levels`, p50/p95 nach Nearest-Rank. Bestanden bei 0 Fehlern und p95 < 1 s |
| Kosten | keine zusätzlichen: Der Hetzner-Preis ist fest, der Lasttest verbraucht wenige MB |
| Meldung | ab Level 9 meldet `make check` **alle Levels 1–9** zusätzlich an die Live-API, Level 9 mit den Lastwerten als `metrics`. Die Live-Seite zeigt danach 9 / 10 |
| Prüfer | 1. Live-Stand des Agenten festhalten und bewerten (Selbstmessung); 2. eigene Live-Checks und eigener Lasttest (Fremdmessung), danach sofort den Live-Stand wiederherstellen; 3. `make level9` + `make check`; 4. falls nötig nochmals wiederherstellen. Die Abweichung der Lastwerte wird nur protokolliert |

### Ergebnis
- Referenz: Level 1–9 bestanden, alle 9 Levels live gemeldet.
- Lasttest vom Mac (Container) nach Helsinki: rund 5 200 Anfragen in 30 s, 0 Fehler, 173 Anfragen/s, p50 57 ms, p95 66 ms.
- Prüfer: alle 3 Kriterien bestanden. Abweichung Agent zu Prüfer: 0–3 %. Die Referenz erreicht **Level 9 (Score 90)**.
- Gegenprobe: Eine gefälschte Level-9-Meldung (falsche Checks, 3 Fehler) wird in K1 erkannt; der Live-Stand ist danach wieder korrekt.

### Funde
- **gzip live:** nginx komprimiert weitergeleitete Anfragen nicht (Caddy setzt `Via`, `gzip_proxied` ist aus). Jetzt komprimiert Caddy (`encode zstd gzip`, ab 256 Bytes wie in der Spec; Caddys Standard von 512 Bytes hätte die 443 Bytes große Startseite ausgelassen). Das Caddyfile musste per Hand auf den Server (Root-Zugriff gehört dir).
- **Prüfer-Reihenfolge:** Die Probe-Meldung des Prüfers leert live die höheren Levels. Danach scheiterte der Level-8-Check im folgenden `make check`. Lösung: Der Prüfer stellt den Live-Stand direkt nach der Probe wieder her.
- **Einmaliger Wackler:** In einem Prüferlauf scheiterte Level 4 lokal; in drei weiteren Läufen nicht mehr. Ursache unklar, beobachten.
- Mein eigener Fehler: In `write-results.mjs` kollidierte die neue Funktion mit der Variablen `report`, und die Pipeline scheiterte. Seither läuft vor jedem Push Level 1–5 im Container.
