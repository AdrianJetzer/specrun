# Levelboard – feste Befehle für Agent und Prüfer.
# make level1          baut das Frontend und startet es mit vite preview auf http://127.0.0.1:8080
# make level2          baut das Frontend und startet es mit nginx auf http://127.0.0.1:8080
# make check           prüft alle Levels bis zum zuletzt gestarteten und schreibt results.json
# make check URL=…     dasselbe gegen eine andere Adresse
# make down            stoppt alles, was gestartet wurde

SHELL := /bin/bash
RUN   := .run
URL   ?= http://127.0.0.1:8080
# Zuletzt gestartetes Level (von make levelN geschrieben); ohne Datei: höchstes gebautes Level
LEVEL := $(shell cat $(RUN)/level 2>/dev/null || echo 2)
LEVELS := $(shell seq 1 $(LEVEL))

.PHONY: level1 level2 check down build wait

build:
	cd frontend && npm ci && npm run build

wait:
	@for i in $$(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:8080/ && echo "Levelboard läuft auf http://127.0.0.1:8080" && exit 0; sleep 1; done; \
	  echo "Fehler: Port 8080 antwortet nicht" >&2; cat $(RUN)/*.log >&2; exit 1

level1: down build
	@mkdir -p $(RUN)
	@cd frontend; nohup ./node_modules/.bin/vite preview < /dev/null > ../$(RUN)/frontend.log 2>&1 & echo $$! > ../$(RUN)/frontend.pid
	@echo 1 > $(RUN)/level
	@$(MAKE) --no-print-directory wait

level2: down build
	@mkdir -p $(RUN)/nginx-tmp
	nginx -p "$(CURDIR)/" -e $(RUN)/nginx-error.log -c frontend/nginx.conf
	@echo 2 > $(RUN)/level
	@$(MAKE) --no-print-directory wait

check:
	cd checks && ([ -d node_modules ] || npm ci) && npx playwright install chromium > /dev/null
	cd checks && BASE_URL=$(URL) npx playwright test $(foreach n,$(LEVELS),tests/level$(n).spec.ts); node write-results.mjs $(LEVELS)

down:
	@if [ -f $(RUN)/frontend.pid ]; then kill $$(cat $(RUN)/frontend.pid) 2>/dev/null || true; rm -f $(RUN)/frontend.pid; fi
	@if [ -f $(RUN)/nginx.pid ]; then kill $$(cat $(RUN)/nginx.pid) 2>/dev/null || true; rm -f $(RUN)/nginx.pid; fi
	@rm -f $(RUN)/level
