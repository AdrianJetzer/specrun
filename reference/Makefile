# Levelboard – feste Befehle für Agent und Prüfer.
# make level1          baut das Frontend und startet es mit vite preview auf http://127.0.0.1:8080
# make level2          baut das Frontend und startet es mit nginx auf http://127.0.0.1:8080
# make level3          wie level2, dazu das Go-Backend auf http://127.0.0.1:8081
# make check           prüft alle Levels bis zum zuletzt gestarteten und schreibt results.json
# make check URL=…     dasselbe gegen eine andere Adresse der Seite (API_URL für das Backend)
# make down            stoppt alles, was gestartet wurde

SHELL   := /bin/bash
RUN     := .run
URL     ?= http://127.0.0.1:8080
API_URL ?= http://127.0.0.1:8081
# Zuletzt gestartetes Level (von make levelN geschrieben); ohne Datei: höchstes gebautes Level
LEVEL  := $(shell cat $(RUN)/level 2>/dev/null || echo 3)
LEVELS := $(shell seq 1 $(LEVEL))

.PHONY: level1 level2 level3 check down build backend-build start-nginx wait

build:
	cd frontend && npm ci && npm run build

backend-build:
	cd backend && go build -o bin/levelboard-backend .

# wartet bis zu 60 s auf eine Adresse (PORT_URL)
wait:
	@for i in $$(seq 1 60); do curl -sf -o /dev/null $(PORT_URL) && exit 0; sleep 1; done; \
	  echo "Fehler: $(PORT_URL) antwortet nicht" >&2; cat $(RUN)/*.log >&2; exit 1

start-nginx:
	@mkdir -p $(RUN)/nginx-tmp
	nginx -p "$(CURDIR)/" -e $(RUN)/nginx-error.log -c frontend/nginx.conf

level1: down build
	@mkdir -p $(RUN)
	@cd frontend; nohup ./node_modules/.bin/vite preview < /dev/null > ../$(RUN)/frontend.log 2>&1 & echo $$! > ../$(RUN)/frontend.pid
	@echo 1 > $(RUN)/level
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8080/
	@echo "Levelboard läuft auf http://127.0.0.1:8080"

level2: down build start-nginx
	@echo 2 > $(RUN)/level
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8080/
	@echo "Levelboard läuft auf http://127.0.0.1:8080"

level3: down build backend-build start-nginx
	@nohup ./backend/bin/levelboard-backend < /dev/null > $(RUN)/backend.log 2>&1 & echo $$! > $(RUN)/backend.pid
	@echo 3 > $(RUN)/level
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8080/
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8081/api/health
	@echo "Levelboard läuft auf http://127.0.0.1:8080"
	@echo "Backend läuft auf http://127.0.0.1:8081"

check:
	cd checks && ([ -d node_modules ] || npm ci) && npx playwright install chromium > /dev/null
	cd checks && BASE_URL=$(URL) API_URL=$(API_URL) npx playwright test $(foreach n,$(LEVELS),tests/level$(n).spec.ts); node write-results.mjs $(LEVELS)

down:
	@if [ -f $(RUN)/frontend.pid ]; then kill $$(cat $(RUN)/frontend.pid) 2>/dev/null || true; rm -f $(RUN)/frontend.pid; fi
	@if [ -f $(RUN)/nginx.pid ]; then kill $$(cat $(RUN)/nginx.pid) 2>/dev/null || true; rm -f $(RUN)/nginx.pid; fi
	@if [ -f $(RUN)/backend.pid ]; then kill $$(cat $(RUN)/backend.pid) 2>/dev/null || true; rm -f $(RUN)/backend.pid; fi
	@rm -f $(RUN)/level
