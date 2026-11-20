# Levelboard – feste Befehle für Agent und Prüfer.
# make level1          baut das Frontend und startet es auf http://127.0.0.1:8080
# make check           Prüfsuite gegen die laufende Seite, schreibt results.json
# make check URL=…     Prüfsuite gegen eine andere Adresse
# make down            stoppt alles, was gestartet wurde

SHELL := /bin/bash
RUN   := .run
URL   ?= http://127.0.0.1:8080

.PHONY: level1 check down

level1: down
	cd frontend && npm ci && npm run build
	@mkdir -p $(RUN)
	@cd frontend; nohup ./node_modules/.bin/vite preview < /dev/null > ../$(RUN)/frontend.log 2>&1 & echo $$! > ../$(RUN)/frontend.pid
	@for i in $$(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:8080/ && echo "Levelboard läuft auf http://127.0.0.1:8080" && exit 0; sleep 1; done; \
	  echo "Fehler: Port 8080 antwortet nicht" >&2; cat $(RUN)/frontend.log >&2; exit 1

check:
	cd checks && ([ -d node_modules ] || npm ci) && npx playwright install chromium > /dev/null
	cd checks && BASE_URL=$(URL) npx playwright test; node write-results.mjs 1

down:
	@if [ -f $(RUN)/frontend.pid ]; then kill $$(cat $(RUN)/frontend.pid) 2>/dev/null || true; rm -f $(RUN)/frontend.pid; fi
