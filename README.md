# Specrun

**Wie weit kommt ein Coding-Agent, wenn er nur eine Spezifikation bekommt?**

Specrun ist ein Experiment. Eine frische Claude-Code-Session erhält ausschließlich den Ordner [`spec/`](spec/00-start.md) und muss daraus **ohne Rückfragen** eine Anwendung bauen. Der Weg ist in 10 Levels aufgeteilt, von einer statischen Seite bis zu einem öffentlichen Deployment mit CI/CD.

Die gebaute App, das **Levelboard**, ist zugleich die Anzeigetafel für die Leistung des Agenten: Sie zeigt, welche Levels er geschafft hat. Ein **unabhängiger Prüfer**, den der Agent nicht sieht, misst anschließend nach. Nur sein Urteil zählt.

> **Stand:** Level 1 ist umgesetzt: Spec v0.1.0, Referenz, Prüfer und Nachbau-Skript. Ein echter Nachbau-Lauf steht noch aus.

## Die 10 Levels

| # | Level | Kurz |
|---|---|---|
| 1 | Statische Seite | Vite + React, lokal gestartet, eigene Playwright-Prüfsuite |
| 2 | Webserver | nginx liefert die Seite aus |
| 3 | REST-Backend | Go-Service mit `/api/levels` |
| 4 | Datenbank | SQLite im Arbeitsspeicher |
| 5 | Frontend + Backend | Seite liest Ergebnisse von der API |
| 6 | Docker-Images | Frontend- und Backend-Image, `docker compose` |
| 7 | Repo + Pipeline | GitHub-Repo, Actions baut und pusht Images |
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
runner/      Nachbau-Skript, Bericht, Bereinigung persönlicher Pfade
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
node level1.mjs ../reference
```

**Nachbau-Lauf**
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
