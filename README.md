# Specrun

**Wie weit kommt ein Coding-Agent, wenn er nur eine Spezifikation bekommt?**

Specrun ist ein Experiment. Eine frische Claude-Code-Session erhält ausschließlich den Ordner [`spec/`](spec/00-start.md) und muss daraus **ohne Rückfragen** eine Anwendung bauen. Der Weg ist in 10 Levels aufgeteilt, von einer statischen Seite bis zu einem öffentlichen Deployment mit CI/CD.

Die gebaute App, das **Levelboard**, ist zugleich die Anzeigetafel für die Leistung des Agenten: Sie zeigt, welche Levels er geschafft hat. Ein **unabhängiger Prüfer**, den der Agent nicht sieht, misst anschließend nach. Nur sein Urteil zählt.

> **Stand (Spec v2.1.0):** Alle 10 Levels sind umgesetzt: Spec, Referenz, unabhängiger Prüfer, Dev Container und ein Hetzner-Server für die Live-Läufe. **Seit 2.0.0 ist die Spec unabhängig vom Agent-Harness**: Neben Claude Code läuft auch OpenCode, weitere Harnesses brauchen nur einen Adapter und ein Image. **Seit 2.1.0 stehen Tokens und Kosten wieder auf der Live-Seite**: Der Runner trägt sie nach der Prüfung nach. Die Referenz läuft als echtes Repo [`specrun-lab/levelboard-referenz`](https://github.com/specrun-lab/levelboard-referenz) und erreicht laut Prüfer Score 100. **Drei Modelle haben die Spec im Nachbau vollständig geschafft**, jeweils 100 / 100 laut unabhängigem Prüfer, ohne Abweichung zwischen Selbst- und Fremdmessung.

## Ergebnisse

| Lauf | Modell | Spec | Score | Session | Kosten (API-Preis) | Ausgabe-Tokens | Bericht |
|---|---|---|---|---|---|---|---|
| 008 | Haiku 5.5 | 1.2.0 | **100** | 43 min | 2,27 USD | 243k | [runs/lauf-008](runs/lauf-008/report.md) |
| 010 | Sonnet 5.5 | 1.4.0 | **100** | 16 min | 1,99 USD | 83k | [runs/lauf-010](runs/lauf-010/report.md) |
| 011 | Opus 5.5 | 1.4.0 | **100** | 44 min | 5,15 USD | 103k | [runs/lauf-011](runs/lauf-011/report.md) |

- **Sonnet** war am schnellsten und am günstigsten. Es baute in großen Blöcken und prüfte seltener.
- **Opus** ging Level für Level vor und erreichte die höchste Testabdeckung, war aber langsam und am teuersten.
- **Haiku** ist pro Token am billigsten. Es brauchte aber die meisten Tokens, und der lange Kontext fällt in Haikus teurere Preisstufe.
- Die Kosten sind aus dem Session-Protokoll zum API-Preis gerechnet (Preise in `runner/preise.json`). Bei Haiku 008 sind sie mit der Preisstufe für langen Kontext nachgerechnet; der Lauf selbst meldete nach Spec 1.2.0 noch 0,47 USD.

Frühere Läufe ([lauf-003](runs/lauf-003/report.md) usw.) stammen aus der Aufbauphase mit weniger Levels.

## Die 10 Levels

| # | Level | Kurz |
|---|---|---|
| 1 | Statische Seite | Vite + React, lokal gestartet, eigene Playwright-Prüfsuite |
| 2 | Webserver | lokal installiertes nginx liefert die Seite aus |
| 3 | REST-Backend | Go-Service mit `/api/levels` |
| 4 | Datenbank | SQLite-Datei mit Historie, übersteht Neustarts des Backends |
| 5 | Frontend + Backend | Live-Dashboard: Seite liest alle 5 s aus dem Backend, nginx leitet /api/ weiter |
| 6 | Repo + CI | GitHub-Repo, Pipeline baut und testet Levels 1–5 |
| 7 | Images in der Pipeline | Images nur in der Pipeline gebaut, im Runner getestet, in die GHCR gepusht |
| 8 | Deployment | Pipeline deployt per SSH auf einen Hetzner-Server, live unter `https://<lauf>.<domain>` |
| 9 | Live-Prüfung | Agent prüft die Live-Seite inkl. Lasttest und meldet Level 1–9 an die Live-API |
| 10 | Metriken veröffentlicht | Abschlussbericht vollständig und live: Ergebnis, Tokens und Kosten, Bauzeit, Lasttest, Image-Größen, Pipeline-Dauer |

**Score:** 10 Punkte pro durchgehend bestandenem Level, also 0–100. Beim ersten nicht bestandenen Level ist Schluss. Kosten, Tokens, Dauer, Performance, Optik und die Abweichung zwischen Selbst- und Fremdmessung werden als Nebenwerte protokolliert.

**Kennzahlen pro Level:** Schon ab Level 1 zeigt jede Karte des Levelboards die **Bauzeit** des Levels. Der Agent misst sie selbst über seine `make check` und hält sie in `bauzeit.json` fest; einmal eingetragen, ändert sie sich nicht mehr. Der Abschlussbericht erscheint ab dem ersten geprüften Level und füllt sich mit jedem weiteren.

**Tokens und Kosten** misst ab Spec 2.0.0 nur noch der Prüfer, nach dem Lauf: Ein Adapter pro Harness (`runner/adapter/`) liest dessen Protokoll, `runner/verbrauch.mjs` teilt die Tokens mit den Zeitpunkten aus `bauzeit.json` pro Level auf und rechnet die Kosten mit `runner/preise.json`. Sie stehen im Prüfbericht unter `runs/lauf-<nr>/`. Ab Spec 2.1.0 trägt `runner/uebernehmen.sh` sie zusätzlich per `PUT /api/usage` auf der Live-Seite des Laufs nach (braucht `SPECRUN_LIVE_DOMAIN`). Dort zeigt der Abschlussbericht dann die Kachel „Tokens“ mit den Gesamtkosten sowie Kosten und Tokens (Ausgabe) pro Level. Bis dahin steht „wird nach der Prüfung ergänzt“. Wer einen Lauf **ohne Prüfer** macht, trägt mit `runner/uebernehmen.sh --nur-verbrauch <laufordner>` nur den Verbrauch nach: gerechnet direkt aus dem Protokoll und `bauzeit.json`, abgelegt als `<laufordner>/verbrauch.json`, ohne Bericht, Commit oder Archivieren des Repos. Eine spätere Prüfung bleibt möglich; die übrigen Werte auf der Seite sind dann aber ungeprüfte Selbstmessung.

Alle Entscheidungen und ihre Begründungen stehen in [`KONZEPT.md`](KONZEPT.md).

## Aufbau

```
spec/        Spezifikation – die einzige Eingabe für den Agenten
reference/   unsere Referenz-Implementierung des Levelboards
judge/       unabhängiger Prüfer (für den Agenten unsichtbar)
runner/      Lauf vorbereiten, prüfen, Bericht, Bereinigung persönlicher Pfade
infra/       Dev Container (Startausrüstung für den Agenten), Server-Einrichtung (infra/server)
runs/        Berichte der Nachbau-Läufe
KONZEPT.md   Konzept und Entscheidungen
```

## Selbst ausprobieren

Voraussetzungen siehe [`spec/02-startausruestung.md`](spec/02-startausruestung.md): Node.js 26, npm 11, GNU Make, curl. Für Nachbau-Läufe zusätzlich die [Claude Code](https://claude.com/claude-code)-CLI.

**Referenz starten und selbst prüfen lassen**
```bash
cd reference
make level1    # baut die Seite und startet sie auf http://127.0.0.1:8080
make check     # Prüfsuite läuft, die Seite zeigt danach „Level 1 bestanden“
make down      # stoppt alles
```

**Unabhängigen Prüfer gegen die Referenz laufen lassen**
```bash
cd judge && npm ci
node all.mjs ../reference      # prüft Level für Level, bricht beim ersten Fehler ab
```
Direkt auf dem Mac braucht der Prüfer für Level 2 `nginx` (`brew install nginx`). Im Prüfer-Container ist alles vorhanden.

**Nachbau-Lauf im Dev Container (empfohlen)**
```bash
runner/prepare-run.sh                 # legt specruns_testlaeufe/<nr>/ an: env/, work/spec/, judge/
runner/prepare-run.sh --modell opus  # dasselbe mit anderem Modell (Standard: sonnet; auch haiku oder eine Modell-ID)
runner/prepare-run.sh --harness opencode                       # mit OpenCode statt Claude Code (Standard-Modell opencode/big-pickle)
runner/prepare-run.sh --harness opencode --modell deepseek/deepseek-flash      # OpenCode mit DeepSeek Flash
runner/prepare-run.sh --harness opencode --modell anthropic/claude-sonnet-5-5   # OpenCode mit anderem Modell
# 1. <lauf>/env in VS Code im Container öffnen, Claude den Auftrag geben (siehe Ausgabe des Skripts)
# 2. <lauf>/judge in VS Code im Container öffnen und dort ausführen:  /specrun/runner/pruefen.sh
runner/uebernehmen.sh <laufordner>    # Bericht nach runs/lauf-<nr>/ übernehmen, ab Spec 2.1.0 Verbrauch auf der Live-Seite nachtragen
runner/uebernehmen.sh --nur-verbrauch <laufordner>   # ohne Prüfer: nur Tokens und Kosten rechnen und auf der Live-Seite nachtragen
```
Harness und Modell sind pro Lauf fest vorgegeben und stehen in `<lauf>/harness.txt` und `<lauf>/modell.txt`. Der Bericht zeigt beide und das laut Protokoll tatsächlich verwendete Modell.

| Harness | Image | Anmeldung (in `~/.zshrc`) | Start im Container | Protokoll |
|---|---|---|---|---|
| Claude Code | `infra/devcontainer/` | `CLAUDE_CODE_OAUTH_TOKEN` | `claude` | `~/.claude/projects` → `<lauf>/protokoll` |
| OpenCode 2.3.2 | `infra/devcontainer-opencode/` | je nach Anbieter: `SPECRUN_OPENCODE_API_KEY` (wird zu `OPENCODE_API_KEY`), `SPECRUN_DEEPSEEK_API_KEY` (wird zu `DEEPSEEK_API_KEY`) | `opencode --standalone` (Modell aus `OPENCODE_CONFIG_CONTENT`) | SQLite über `OPENCODE_DB` → `<lauf>/protokoll/opencode.db` |

Beide Images haben dieselbe Startausrüstung; OpenCode läuft ohne Rückfragen (Berechtigungen im Image auf „allow“).

**Welcher Harness wofür:** Claude-Modelle laufen am günstigsten in Claude Code (Abo-Token). Für andere Anbieter (DeepSeek, OpenCode-Modelle wie Big Pickle) ist OpenCode da; es braucht nur den API-Schlüssel des Anbieters. Claude in OpenCode ginge auch, aber nur mit API-Schlüssel und Kosten pro Token. Preise für die Kostenrechnung stehen in `runner/preise.json`; DeepSeek ist dort mit dem Hauptzeit-Preis eingetragen (ausserhalb der Hauptzeit kostet es die Hälfte).

Der Prüfer läuft in einem eigenen Container aus demselben Image. Er sieht das Werk des Agenten nur lesend und baut es selbst neu. Zu beachten:
- Pro Prüfer-Container läuft **immer nur eine Prüfung**. Zwei gleichzeitige Prüfungen stören sich (gleicher Build-Ordner, gleiche Ports). `pruefen.sh` startet nicht, solange `ergebnis/` existiert; für eine neue Prüfung den Ordner erst umbenennen.
- Ein Lauf wird nach **seiner eigenen Spec-Version** bewertet (Kopie in `<lauf>/work/spec/`). Neuere Anforderungen wie die Bauzeit (ab 1.3.0) gelten für ältere Läufe nicht.
- Agent- und Prüfer-Container nutzen feste DNS-Server (`1.1.1.1`, `9.9.9.9`), weil der Standard der Podman-Maschine nach Neustarts langsam antwortete.

**Server für Level 8 (einmalig einrichten)**

Ein kleiner Hetzner-Server nimmt die Läufe auf. Jeder Lauf ist unter `https://<RUN_ID>.<LIVE_DOMAIN>` erreichbar, ohne eigene Domain z. B. `https://lauf-008.89-67-45-123.sslip.io`. Caddy auf dem Server holt die Zertifikate.
```bash
infra/server/vorbereiten.sh           # Deploy-Schlüssel und cloud-init-Datei in ~/.specrun/server/
# Hetzner-Konsole: Server mit Ubuntu 24.04 (x86) anlegen, cloud-init.yaml bei „Cloud config“ einfügen
infra/server/verbinden.sh <server-ip> # wartet auf die Einrichtung, setzt Org-Secrets und LIVE_DOMAIN
```
Danach in `~/.zshrc` die ausgegebene Zeile `export SPECRUN_LIVE_DOMAIN=…` ergänzen und VS Code neu starten. Agent- und Prüfer-Container bekommen den Wert als `LIVE_DOMAIN`. Der private Schlüssel bleibt in `~/.specrun/server/` und in den Org-Secrets, nie im Repo.

**Anmeldung von Claude im Agent-Container (einmalig einrichten)**

Der Container speichert keinen Claude-Zustand über Läufe hinweg. Jeder Agent startet ohne Erinnerung an frühere Läufe. Angemeldet wird über ein langlebiges Token:
1. Auf dem Mac `claude setup-token` ausführen und das angezeigte Token kopieren.
2. In `~/.zshrc` die Zeile `export CLAUDE_CODE_OAUTH_TOKEN=…` ergänzen. Das Token gehört nie ins Repo.
3. VS Code komplett beenden und neu starten, damit es die Variable übernimmt.

Hinweis: Der Agent kann das Token in seiner Umgebung sehen. Es berechtigt nur zur Nutzung von Claude und lässt sich jederzeit widerrufen.

**Der Dev Container** ([`infra/devcontainer/`](infra/devcontainer/Dockerfile)) enthält genau die Startausrüstung aus der Spec. Er hat keine root-Rechte und kein Docker, und der Agent sieht nichts außer dem Laufordner.

**Älterer Weg: Lauf ohne Container (headless auf dem Mac)**

`runner/run.sh` stammt aus der Aufbauphase. Es startet eine Claude-Session direkt auf dem Mac, ohne Dev Container und ohne Server. Für Läufe über alle 10 Levels ist es nicht mehr vorgesehen; dafür gilt der Weg über den Dev Container oben. `runner/run.sh --fake` macht weiterhin einen kostenlosen Probelauf mit der Referenz als Attrappe.

## Vorgehen

Specrun wächst **Level für Level**. Jede Iteration durchläuft denselben Zyklus:
1. Level definieren
2. Referenz bauen
3. Spec schreiben
4. Prüfer bauen (mit Gegenprobe gegen absichtlich kaputte Kopien)
5. Nachbau testen
6. Spec schärfen

Die Spec-Versionen sind in [`spec/CHANGELOG.md`](spec/CHANGELOG.md) dokumentiert.
