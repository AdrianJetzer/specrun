# Specrun

**Wie weit kommt ein Coding-Agent, wenn er nur eine Spezifikation bekommt?**

Specrun ist ein Experiment. Eine frische Claude-Code-Session erhält ausschließlich den Ordner [`spec/`](spec/00-start.md) und muss daraus **ohne Rückfragen** eine Anwendung bauen. Der Weg ist in 10 Levels aufgeteilt, von einer statischen Seite bis zu einem öffentlichen Deployment mit CI/CD.

Die gebaute App, das **Levelboard**, ist zugleich die Anzeigetafel für die Leistung des Agenten: Sie zeigt, welche Levels er geschafft hat. Ein **unabhängiger Prüfer**, den der Agent nicht sieht, misst anschließend nach. Nur sein Urteil zählt.

> **Stand:** Levels 1–5 sind umgesetzt (Spec v0.5.0, Referenz, Prüfer, Dev Container). Echte Nachbauten haben Level 1 (Lauf 001) und Level 2 (Lauf 003) laut unabhängigem Prüfer bestanden; Lauf 005 (Levels 1–4) ist gebaut, aber noch nicht geprüft.

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
| 8 | Deployment | Auslieferung auf einen eigenen Server per SSH |
| 9 | Live-Prüfung | Agent prüft die Live-Seite inkl. Lasttest |
| 10 | Metriken veröffentlicht | Abschlussbericht auf der Live-Seite |

**Score:** 10 Punkte pro durchgehend bestandenem Level, also 0–100. Beim ersten nicht bestandenen Level ist Schluss. Kosten, Tokens, Dauer, Performance, Optik und die Abweichung zwischen Selbst- und Fremdmessung werden als Nebenwerte protokolliert.

Alle Entscheidungen und ihre Begründungen stehen in [`KONZEPT.md`](KONZEPT.md).

## Aufbau

```
spec/        Spezifikation – die einzige Eingabe für den Agenten
reference/   unsere Referenz-Implementierung des Levelboards
judge/       unabhängiger Prüfer (für den Agenten unsichtbar)
runner/      Lauf vorbereiten, prüfen, Bericht, Bereinigung persönlicher Pfade
infra/       Dev Container (Startausrüstung für den Agenten)
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
# 1. <lauf>/env in VS Code im Container öffnen, Claude den Auftrag geben (siehe Ausgabe des Skripts)
# 2. <lauf>/judge in VS Code im Container öffnen und dort ausführen:  /specrun/runner/pruefen.sh
runner/uebernehmen.sh <laufordner>    # Bericht nach runs/lauf-<nr>/ übernehmen
```
Der Prüfer läuft in einem eigenen Container aus demselben Image. Er sieht das Werk des Agenten nur lesend und baut es selbst neu.

**Anmeldung von Claude im Agent-Container (einmalig einrichten)**

Der Container speichert keinen Claude-Zustand über Läufe hinweg. Jeder Agent startet ohne Erinnerung an frühere Läufe. Angemeldet wird über ein langlebiges Token:
1. Auf dem Mac `claude setup-token` ausführen und das angezeigte Token kopieren.
2. In `~/.zshrc` die Zeile `export CLAUDE_CODE_OAUTH_TOKEN=…` ergänzen. Das Token gehört nie ins Repo.
3. VS Code komplett beenden und neu starten, damit es die Variable übernimmt.

Hinweis: Der Agent kann das Token in seiner Umgebung sehen. Es berechtigt nur zur Nutzung von Claude und lässt sich jederzeit widerrufen.
Der Dev Container ([`infra/devcontainer/`](infra/devcontainer/Dockerfile)) enthält genau die Startausrüstung aus der Spec. Er hat keine root-Rechte und kein Docker, und der Agent sieht nichts außer dem Laufordner.

**Nachbau-Lauf ohne Container (headless auf dem Mac)**
```bash
runner/run.sh --fake      # Probelauf ohne Agent (Referenz als Attrappe), kostet nichts
runner/run.sh             # echter Lauf: frische Claude-Session baut aus spec/
```
Ein echter Lauf hat diese Grenzen:
- **Budget:** 10 USD (`--budget`)
- **Zeitlimit:** 45 Minuten (`--timeout`)
- **Modell:** über `--model` wählbar

Der Agent arbeitet in einem Ordner außerhalb dieses Repos (`~/specrun-builds/<id>`). Er sieht weder Referenz noch Prüfer noch Konzept. Der Bericht landet in `runs/<id>/report.md`.

## Vorgehen

Specrun wächst **Level für Level**. Jede Iteration durchläuft denselben Zyklus:
1. Level definieren
2. Referenz bauen
3. Spec schreiben
4. Prüfer bauen (mit Gegenprobe gegen absichtlich kaputte Kopien)
5. Nachbau testen
6. Spec schärfen

Die Spec-Versionen sind in [`spec/CHANGELOG.md`](spec/CHANGELOG.md) dokumentiert.
