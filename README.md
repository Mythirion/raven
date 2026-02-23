# Raven

Raven is a self-hostable, Docker-first web email client foundation built with Nuxt 4, TypeScript, and Tailwind.

This repository currently contains **Phase 0 foundations**:

- app/runtime scaffold,
- health endpoint and service/repository boundaries,
- baseline migration tooling,
- Docker Compose profiles for SQLite (default) and Postgres (optional).

## Prerequisites

- Docker + Docker Compose
- (Optional for local non-container commands) Node.js 20+

## Quick Start (SQLite profile, default)

```bash
docker compose up --build -d
curl -sS http://localhost:3000/api/ops/health
```

Expected: health response with `checks.database.engine` set to `sqlite`.

## Quick Start (Postgres profile)

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build -d
curl -sS http://localhost:3000/api/ops/health
```

Expected: health response with `checks.database.engine` set to `postgres`.

## Migrations

Migrations are automatically executed at container startup via `docker/entrypoint.sh`.

To run manually:

```bash
# SQLite mode
docker compose exec -T raven node src/scripts/migrate.mjs

# Postgres mode
docker compose -f docker-compose.yml -f docker-compose.postgres.yml exec -T raven node src/scripts/migrate.mjs
```

## Validation Commands

```bash
npm run lint
npm run test
```

- `lint` runs `nuxt typecheck`
- `test` runs a Phase 0 smoke check co-located with the API surface under test (`src/server/api/ops/health.smoke-test.mjs`)

## Useful Docker Commands

```bash
# View container status
docker compose ps

# View logs
docker compose logs -f raven

# Stop default profile
docker compose down

# Stop Postgres profile
docker compose -f docker-compose.yml -f docker-compose.postgres.yml down
```

## Task Automation (Make)

Following QA workflow recommendations, a `Makefile` is provided to standardize common Docker-first operations.

> **Important:** `make` is used for **developer/automation convenience only** on the host machine.
> Production/runtime behavior remains **Docker-only** (containers, entrypoint, migrations, and service startup do not depend on `make`).

```bash
# Default SQLite profile
make up
make ps
make health
make migrate
make smoke
make logs
make down

# Postgres profile
make up-pg
make ps-pg
make health
make migrate-pg
make smoke-pg
make logs-pg
make down-pg
```

This keeps build/run/test/migrate commands consistent for local development and CI scripting.

## Phase 0 References

- `docs/STEERING.md`
- `docs/SPECIFICATION.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE_0_FOUNDATIONS.md`
