init:
	pnpm run start:dev init

api:
	pnpm run start:dev api

core:
	pnpm run start:dev mqtt-core

rules:
	pnpm run start:dev rules-engine

appliance-monitor:
	pnpm run start:dev appliance-monitor

ai:
	pnpm run start:dev ai-service

integrations:
	pnpm run start:dev integrations

all:
	pnpm concurrently "pnpm run start:dev init" \
	"pnpm run start:dev api" \
	"pnpm run start:dev mqtt-core" \
	"pnpm run start:dev rules-engine" \
	"pnpm run start:dev appliance-monitor" \
	"pnpm run start:dev ai-service" \
	"pnpm run start:dev integrations"

.PHONY: all init api core rules appliance-monitor ai integrations

# =============================================================================
# Desarrollo local AISLADO (.env.dev + stack-docker/docker-compose.dev.yml)
# Nunca habla con producción: ver scripts/dev/env.sh (guardas) y docs/development.md
# =============================================================================
DEV_RUN := scripts/dev/run.sh
DEV_ENV := source scripts/dev/env.sh &&
SHELL := /bin/bash
.SHELLFLAGS := -e -o pipefail -c

dev-up: ## Infra local: TimescaleDB, Redis(6380), NATS, Mosquitto (127.0.0.1)
	scripts/dev/dc.sh up -d
	scripts/dev/dc.sh ps

dev-down: ## Para la infra local (conserva volúmenes)
	scripts/dev/dc.sh stop

dev-ps:
	scripts/dev/dc.sh ps

dev-logs: ## make dev-logs S=mosquitto
	scripts/dev/dc.sh logs -f --tail 100 $(S)

dev-db: ## Crea domotic_dev/mastra_dev (si faltan) y aplica migraciones
	$(DEV_ENV) node scripts/dev/db-setup.mjs && pnpm exec prisma migrate deploy

dev-session: ## Seed (org/usuario ADMIN/casa/dispositivos) + cookie de sesión. ARGS=--alexa
	@$(DEV_ENV) node scripts/dev/dev-session.mjs $(ARGS)

dev-alexa-e2e: ## E2E Alexa contra la API local (requiere make dev-api + make dev-core)
	@$(DEV_ENV) OUT=$$(node scripts/dev/dev-session.mjs --alexa 2>/dev/null | tail -1) && node scripts/dev/alexa-e2e.mjs "$$OUT"

dev-api:
	$(DEV_RUN) api
dev-init:
	$(DEV_RUN) init
dev-core:
	$(DEV_RUN) mqtt-core
dev-rules:
	$(DEV_RUN) rules-engine
dev-appliance:
	$(DEV_RUN) appliance-monitor
dev-ai:
	$(DEV_RUN) ai-service
dev-integrations:
	$(DEV_RUN) integrations

dev-all: ## API + mqtt-core + rules-engine + init contra el stack local
	pnpm concurrently -n api,core,rules,init \
	"$(DEV_RUN) api" "$(DEV_RUN) mqtt-core" "$(DEV_RUN) rules-engine" "$(DEV_RUN) init"

# Imágenes Docker del backend contra el stack local (docker-compose.dev.yml)
DOCKER_DEV := scripts/dev/docker.sh compose -f docker-compose.yml -f docker-compose.dev.yml

docker-env: ## Genera .env.docker.dev desde .env.dev (hosts = contenedores locales)
	node scripts/dev/docker-env.mjs

docker-build: ## Construye las 8 imágenes (prisma-migrate + 7 servicios), Node 24
	$(DOCKER_DEV) build

docker-up: docker-env ## Migra domotic_dev y arranca los 7 servicios en Docker
	$(DOCKER_DEV) up -d

docker-ps:
	$(DOCKER_DEV) ps -a

docker-logs: ## make docker-logs S=api
	$(DOCKER_DEV) logs -f --tail 100 $(S)

docker-down: ## Para y elimina los contenedores de prueba (sin volúmenes)
	$(DOCKER_DEV) down

.PHONY: docker-env docker-build docker-up docker-ps docker-logs docker-down

# Verificación rápida (bucle de desarrollo)
verify: ## typecheck backend + web, tests backend, vendor drift del edge
	pnpm exec tsc --noEmit -p tsconfig.json
	pnpm exec jest --silent
	pnpm -C web exec tsc --noEmit -p tsconfig.app.json
	cd stack-client/edge/rules-engine && bash scripts/check-vendor-drift.sh

# Verificación completa (= lo que ejecuta .github/workflows/ci.yml)
verify-full: verify ## + build de las 7 apps, build web, typecheck/tests de stack-client
	for app in api init mqtt-core rules-engine appliance-monitor ai-service integrations; do \
	  pnpm exec nest build $$app >/dev/null || exit 1; echo "build $$app OK"; done
	pnpm -C web exec tsc -b && pnpm -C web exec vite build >/dev/null && echo "web build OK"
	for p in stack-client/edge/rules-engine stack-client/lan-bridge; do \
	  (cd $$p && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec jest --ci --silent); done

.PHONY: verify verify-full
.PHONY: dev-up dev-down dev-ps dev-logs dev-db dev-session dev-alexa-e2e dev-api dev-init dev-core dev-rules dev-appliance dev-ai dev-integrations dev-all
