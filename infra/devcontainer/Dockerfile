# Specrun – Startausrüstung für den Agenten (beschrieben in spec/02-startausruestung.md).
# Linux, feste Versionen, kein Docker, keine root-Rechte für den Agenten.
FROM ubuntu:24.04

ARG NODE_VERSION=26.13.0
ARG GO_VERSION=1.27.4
ARG PLAYWRIGHT_VERSION=1.65.1
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Grundwerkzeuge
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg xz-utils git make procps less jq ripgrep libatomic1 \
 && rm -rf /var/lib/apt/lists/*

# nginx (Mainline von nginx.org, damit die Version zum Prüfer passt) und GitHub-CLI
RUN curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor -o /usr/share/keyrings/nginx.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/nginx.gpg] https://nginx.org/packages/mainline/ubuntu noble nginx" > /etc/apt/sources.list.d/nginx.list \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends nginx gh \
 && rm -rf /var/lib/apt/lists/*

# Node.js und Go (offizielle Binärpakete, Architektur automatisch)
RUN case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      amd64) NARCH=x64;   GARCH=amd64 ;; \
      arm64) NARCH=arm64; GARCH=arm64 ;; \
      *) echo "Architektur nicht unterstützt" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NARCH}.tar.xz" | tar -xJ -C /usr/local --strip-components=1 \
 && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GARCH}.tar.gz" | tar -xz -C /usr/local
ENV PATH="/usr/local/go/bin:${PATH}"

# Playwright: Systembibliotheken und Chromium vorinstalliert (Ordner gehört später „dev“)
RUN npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
 && rm -rf /root/.npm

# Benutzer ohne root-Rechte und ohne sudo
RUN userdel -r ubuntu 2>/dev/null || true \
 && useradd --create-home --uid 1000 --shell /bin/bash dev \
 && chown -R dev:dev /ms-playwright
USER dev
WORKDIR /home/dev
ENV PATH="/home/dev/go/bin:/home/dev/.local/bin:${PATH}"

# Go-Module für Level 4 vorhalten (modernc.org/sqlite samt Abhängigkeiten) und den Build-Cache füllen:
# Builds funktionieren damit ohne Go-Proxy, der sporadisch mit 403 antwortet.
ARG SQLITE_VERSION=v1.62.0
RUN mkdir -p /tmp/vorrat && cd /tmp/vorrat \
 && go mod init vorrat > /dev/null 2>&1 \
 && printf 'package main\n\nimport _ "modernc.org/sqlite"\n\nfunc main() {}\n' > main.go \
 && for i in 1 2 3 4 5; do go get "modernc.org/sqlite@${SQLITE_VERSION}" && go mod tidy && go build -o /dev/null . && break; echo "Versuch $i fehlgeschlagen, neuer Versuch"; sleep 5; done \
 && go build -o /dev/null . \
 && cd / && rm -rf /tmp/vorrat

# Claude Code (CLI) mit dem offiziellen Installer
RUN curl -fsSL https://claude.ai/install.sh | bash
# Kein Volume: Der Zustand von Claude lebt nur in diesem Container (leer bei jedem Lauf).
# Die Ersteinrichtung (Theme, Willkommen) ist vorab erledigt; angemeldet wird per CLAUDE_CODE_OAUTH_TOKEN.
ENV CLAUDE_CONFIG_DIR=/home/dev/.claude
RUN mkdir -p /home/dev/.claude \
 && echo '{"hasCompletedOnboarding": true, "theme": "dark"}' > /home/dev/.claude/.claude.json
