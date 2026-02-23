# Raven Phase 0 — Foundations Implementation Package

## 1. Purpose

This document breaks out the Phase 0 scope from `docs/IMPLEMENTATION_PLAN.md` into an implementation-ready package for immediate execution.

It is aligned with:

- `docs/STEERING.md`
- `docs/SPECIFICATION.md`

## 2. Phase 0 Goals

- Establish repository baseline and architecture skeleton.
- Ensure local Docker development loop works.

## 3. Core Deliverables

- App scaffold, API folders, service-layer stubs
- DB schema baseline + migration tooling
- Health endpoint and basic container healthcheck

## 4. Detailed Scope

### 4.1 Architecture and Repository Baseline

- Initialize Nuxt 4 full-stack skeleton with strict TypeScript settings.
- Establish canonical project layout for:
  - `src/server/api` (HTTP endpoints)
  - `src/server/services` (domain/business logic)
  - `src/server/repositories` (storage-facing interfaces)
  - `src/server/utils` (shared runtime helpers)
  - `src/components`, `src/pages`, and `src/layouts` (UI shell)
- Add baseline scripts: lint, typecheck, test, and migration execution.

### 4.2 Data and Persistence Baseline

- Add initial schema and migration framework compatible with:
  - SQLite default profile (`/data/app.db`)
  - Optional Postgres profile (`DATABASE_URL`)
- Create foundational tables for Phase 1/2:
  - `users`, `mailbox_accounts`, `folders`, `sync_cursors`, `audit_events`

### 4.3 Runtime and Operational Baseline

- Implement `GET /api/ops/health` with:
  - API process health
  - DB connectivity probe
  - scheduler initialization placeholder state
- Add Docker `HEALTHCHECK` aligned to startup targets.
- Add structured API response and error normalization baseline.

### 4.4 Containerization and Dev Workflow

- Multi-stage Dockerfile with non-root runtime.
- Default `docker-compose.yml` for SQLite profile.
- Optional Postgres compose override/profile.

## 5. Agent Delegation Kickoff (Implementation Start)

### 5.1 Delegated task sent to @freddie

**Task brief sent**

Implement Phase 0 frontend foundation work aligned to Nuxt 4 + Tailwind:

1. Minimal app shell (workspace layout) with desktop and mobile navigation behavior.
2. Shared UI primitives under `src/components/ui/*`.
3. Placeholder landing view proving shell and primitive usage.

Constraints:

- Keep changes Phase-0-focused only (no inbox/business logic yet).
- Ensure naming consistency with Raven docs.
- Keep responsive behavior explicit and predictable.

**Actionable implementation output returned**

- Create `src/layouts/default.vue` for shell structure and navigation toggle behavior.
- Create reusable primitives:
  - `src/components/ui/BaseButton.vue`
  - `src/components/ui/BasePanel.vue`
  - `src/components/ui/StatusBadge.vue`
- Add `src/pages/index.vue` as Phase 0 readiness dashboard placeholder.

### 5.2 Delegated task sent to @brian

**Task brief sent**

Implement Phase 0 backend baseline aligned to service boundaries and portability:

1. `GET /api/ops/health` endpoint with typed service/repository flow.
2. Shared API response envelope and error normalization.
3. Request context helper scaffold for future ownership checks.
4. Migration baseline compatible with SQLite + Postgres profile path.

Constraints:

- Route handlers must not directly use DB internals.
- Keep implementation lightweight but production-shaped.
- No hardcoded secrets; env-driven configuration only.

**Actionable implementation output returned**

- Add `src/server/api/ops/health.get.ts` route.
- Add `src/server/services/health/health.service.ts` for orchestration.
- Add `src/server/repositories/system.repository.ts` for DB probe abstraction.
- Add shared API helpers in `src/server/utils/*`.
- Add migration files and runner script in `src/db/migrations` + `src/scripts/migrate.mjs`.

## 6. Exit Criteria

Phase 0 is complete when:

1. `docker compose up` reaches healthy status within target envelope.
2. `GET /api/ops/health` returns API + DB readiness status.
3. Baseline migration is runnable for SQLite default and Postgres profile path.
4. API/service/repository boundaries are represented in code stubs.
5. Frontend shell is responsive for desktop/mobile baseline.
6. Developer scripts are present for lint, typecheck, test, and migrate.

## 7. Immediate Next Actions

1. Run dependency install and migration smoke checks.
2. Bring up Docker SQLite profile and verify healthcheck.
3. Bring up Docker + Postgres profile and verify healthcheck.
4. Open Phase 1 branch tasks once Phase 0 checks pass.
