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
