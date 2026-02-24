SHELL := /bin/bash

COMPOSE := docker compose
COMPOSE_PG := docker compose -f docker-compose.yml -f docker-compose.postgres.yml

.PHONY: up up-pg down down-pg rebuild rebuild-pg logs logs-pg ps ps-pg health migrate migrate-pg smoke smoke-pg typecheck typecheck-pg phase1 phase1-pg qa qa-pg

up:
	$(COMPOSE) up --build -d

up-pg:
	$(COMPOSE_PG) up --build -d

down:
	$(COMPOSE) down

down-pg:
	$(COMPOSE_PG) down

rebuild:
	$(COMPOSE) up --build -d raven

rebuild-pg:
	$(COMPOSE_PG) up --build -d raven

logs:
	$(COMPOSE) logs -f raven

logs-pg:
	$(COMPOSE_PG) logs -f raven

ps:
	$(COMPOSE) ps

ps-pg:
	$(COMPOSE_PG) ps

health:
	curl -sS http://localhost:3000/api/ops/health

migrate:
	$(COMPOSE) exec -T raven node src/scripts/migrate.mjs

migrate-pg:
	$(COMPOSE_PG) exec -T raven node src/scripts/migrate.mjs

smoke:
	$(COMPOSE) exec -T raven node src/server/api/ops/health.smoke-test.mjs

smoke-pg:
	$(COMPOSE_PG) exec -T raven node src/server/api/ops/health.smoke-test.mjs

typecheck:
	$(COMPOSE) exec -T raven bun run typecheck

typecheck-pg:
	$(COMPOSE_PG) exec -T raven bun run typecheck

phase1:
	$(COMPOSE) exec -T raven bun run test:phase1

phase1-pg:
	$(COMPOSE_PG) exec -T raven bun run test:phase1

qa:
	$(COMPOSE) exec -T raven bun run typecheck && $(COMPOSE) exec -T raven bun run test && $(COMPOSE) exec -T raven bun run test:phase1

qa-pg:
	$(COMPOSE_PG) exec -T raven bun run typecheck && $(COMPOSE_PG) exec -T raven bun run test && $(COMPOSE_PG) exec -T raven bun run test:phase1
