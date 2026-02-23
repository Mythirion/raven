# Raven Implementation Plan

## 1. Purpose

This plan defines a practical, phased approach to deliver Raven from foundation to MVP release, aligned with `docs/STEERING.md` and `docs/SPECIFICATION.md`.

## 2. Scope Alignment

This implementation plan covers MVP-to-v1 in-scope capabilities:

- Multi-account mailbox linking (IMAP + SMTP)
- Unified inbox and account/folder views
- Read/search/send workflows
- Background sync with retries and status visibility
- Docker-first deployment (single-container default, optional Postgres profile)

Out-of-scope items remain deferred (native mobile app binaries, calendar/contacts suite, enterprise compliance workflows, Exchange-first/EWS).
Post-MVP direction includes PWA support and mobile-adaptive UI.

## 3. Delivery Principles

1. **Self-hostability first**: every phase must remain Docker-runnable and reproducible.
2. **Security-by-default**: no secrets in repo, credential encryption at rest, hardened runtime.
3. **Operational clarity**: health, sync, and queue state must be observable.
4. **Incremental risk reduction**: implement highest-risk plumbing (mail sync + queue reliability) early.

## 4. Workstreams

### WS1 — Platform & Runtime

- Nuxt 4 + TypeScript + Tailwind scaffold
- Nitro server API structure (`/src/server/api`, `/src/server/services`)
- Storage profile abstraction (SQLite default, Postgres optional)
- Scheduler/worker runtime hooks

### WS2 — Identity, Sessions, and Security

- Local login + secure cookie session management
- Route protection and CSRF mitigation for mutating endpoints
- Encryption service for mailbox credentials using `APP_ENCRYPTION_KEY`
- Input validation and safe HTML sanitization pipeline

### WS3 — Mailbox Connectivity & Sync

- IMAP/SMTP provider adapter interfaces
- Account create/edit/delete/test endpoints
- Initial folder bootstrap sync + incremental cursor sync
- IDLE support with polling fallback
- Retry/backoff and per-account failure isolation

### WS4 — Message UX & Actions

- Unified inbox and account/folder navigation
- Message list/detail with attachment metadata and secure download
- Read/unread, star, archive, move, delete, bulk operations
- Responsive/mobile-adaptive layout behavior for message list/detail navigation

### WS5 — Compose, Draft, and Outbox

- Compose/reply/reply-all/forward flows
- Draft autosave endpoint and state management
- Outbox queue with retry and clear failed/sent status

### WS6 — Search & Operations

- Cross-account search endpoint + filter model
- Search indexing strategy for subject/sender/recipient/snippet tokens
- Ops UI panels: sync health, queue health, service health

### WS7 — Packaging, Deploy, and Documentation

- Multi-stage Dockerfile with non-root runtime
- Compose profiles (SQLite default, Postgres optional)
- Traefik-compatible labels/network examples
- Backup/restore runbook and release readiness checklist
- Post-MVP PWA packaging plan (manifest, icons, service worker strategy)

### WS8 — Test Strategy and Quality Engineering

- Frontend test coverage for desktop and mobile viewport profiles
- PWA behavior tests (installability signals, offline shell expectations where applicable)
- Device-detection/mobile-friendly UI verification scenarios
- Backend/API regression tests for multi-user auth and account ownership checks

## 5. Phase Plan

## Phase 0 — Foundations (Week 1)

**Status:** ✅ Completed (Commit `c8c8627`)

**Completion Notes**

- `src/`-first project layout established and reflected in docs/spec.
- Docker-first runtime validated for SQLite (default) and Postgres (optional profile).
- Health endpoint (`GET /api/ops/health`) returns DB engine/status correctly across profiles.
- Migration-on-start behavior implemented in container entrypoint.
- Developer automation added via host-side `Makefile` (non-production dependency).
- Deterministic dependency lockfile generated and committed (`package-lock.json`).

**Goals**

- Establish repository baseline and architecture skeleton.
- Ensure local Docker development loop works.

**Deliverables**

- App scaffold, API folders, service-layer stubs
- DB schema baseline + migration tooling
- Health endpoint and basic container healthcheck

### Phase 0 Detailed Implementation Scope

#### 0.1 Architecture and Repository Baseline

- Initialize Nuxt 4 full-stack skeleton with strict TypeScript settings.
- Establish canonical project layout for:
  - `src/server/api` (HTTP endpoints)
  - `src/server/services` (domain/business logic)
  - `src/server/utils` (shared runtime helpers)
  - `src/components`, `src/pages`, and `src/layouts` (UI shell)
- Add baseline lint/format/typecheck scripts and wire them into CI-ready npm scripts.

#### 0.2 Data and Persistence Baseline

- Add initial schema and migration framework compatible with:
  - SQLite default profile (`/data/app.db`)
  - Optional Postgres profile (`DATABASE_URL`)
- Create minimum foundational tables needed to unblock Phase 1/2:
  - `users`, `mailbox_accounts`, `folders`, `sync_cursors`, `audit_events`
- Define migration naming/versioning convention and rollback expectations.

#### 0.3 Runtime and Operational Baseline

- Implement `GET /api/ops/health` with checks for:
  - API process health
  - DB connectivity
  - scheduler loop initialization state (placeholder in Phase 0)
- Add Docker `HEALTHCHECK` aligned with startup target (<10s warm health target from steering/spec).
- Add structured logging baseline and log-level env configuration (`LOG_LEVEL`).

#### 0.4 Containerization and Developer Workflow

- Add Dockerfile (multi-stage, non-root runtime) for app build/run.
- Add `docker-compose.yml` for local default SQLite profile.
- Add `docker-compose.postgres.yml` (or profile equivalent) for optional Postgres mode.
- Validate `docker compose up` starts Raven and reports healthy status in expected envelope.

### Phase 0 Agent Collaboration Output

#### @freddie (Frontend Reviewer) — Foundation Recommendations

**Findings**

- Early UI shell decisions will strongly affect later inbox/detail responsiveness and maintainability.
- Without an app-shell baseline, Phase 3 UI work may introduce avoidable refactors.

**Recommended changes**

- Create a minimal app shell now (auth-ready layout + main workspace layout) with Tailwind tokens/utilities standardized.
- Add a shared component primitives folder (`src/components/ui/*`) for buttons, inputs, status badges, and panel containers.
- Define viewport breakpoints and navigation behavior contract early (desktop sidebar + mobile drawer pattern), even if message UI is placeholder-only in Phase 0.

**Optional nice-to-have improvements**

- Add a story/demo route for core primitives to speed UI iteration in later phases.

#### @brian (Backend Reviewer) — Foundation Recommendations

**Findings**

- Clear API/service boundaries and typed error contracts are critical to avoid coupling as account/sync endpoints expand.
- Phase 0 is the lowest-cost point to lock in ownership-safe service interfaces for upcoming multi-user constraints.

**Recommended changes**

- Define service interface conventions now (input DTO, output DTO, domain errors, no direct DB usage from route handlers).
- Add API response envelope + error normalization strategy for all `/api/*` routes.
- Add request context helper that resolves authenticated user identity placeholder, preparing ownership checks in Phase 1.
- Add repository layer abstraction to keep SQLite/Postgres portability explicit.

**Optional nice-to-have improvements**

- Add lightweight architecture tests/lint rules that prevent route handlers from importing DB internals directly.

### Phase 0 Expanded Exit Criteria

Phase 0 is complete only when all of the following are true:

1. `docker compose up` reaches healthy status within target startup envelope.
2. Health endpoint returns API + DB readiness status.
3. Baseline migration can be applied cleanly in both SQLite (default) and Postgres (optional profile).
4. API route skeleton and service/repository boundaries are documented and represented in code stubs.
5. Minimal frontend app shell is present and responsive at agreed desktop/mobile breakpoints.
6. Developer scripts for lint, typecheck, test (placeholder or initial) are available and runnable.

### Phase 0 Risks to Track Immediately

- **Schema churn risk:** mitigate by keeping migrations additive and review-gated.
- **Runtime drift between SQLite and Postgres:** mitigate with early dual-profile smoke validation.
- **UI shell rework risk:** mitigate with early layout/navigation contract.
- **API contract inconsistency:** mitigate with a single response/error standard from day one.

**Exit Criteria**

- `docker compose up` yields healthy app within startup target envelope.

## Phase 1 — Accounts + Security Core (Weeks 2–3)

**Goals**

- Implement account lifecycle and secure credential handling.

**Deliverables**

- Auth login/logout routes
- Accounts CRUD + `POST /api/accounts/:id/test`
- Encrypted credential persistence
- CSRF + validation middleware foundations

**Exit Criteria**

- User can add/edit/test/remove mailbox accounts safely.

## Phase 2 — Sync Engine (Weeks 3–5)

**Goals**

- Build reliable mailbox synchronization and cursor tracking.

**Deliverables**

- Initial + incremental sync engine
- Cursor/checkpoint persistence (`sync_cursors`)
- Retry/backoff policy and isolated account failures
- Sync status endpoint (`/api/ops/sync-status`)

**Exit Criteria**

- New mail appears within target latency for IDLE-capable providers.

## Phase 3 — Reading & Message Actions (Weeks 5–6)

**Goals**

- Deliver stable read/manage workflows in UI.

**Deliverables**

- Unified inbox and folder/account browsing
- Message detail (plain + sanitized HTML)
- Core/bulk message actions wired to API

**Exit Criteria**

- User can reliably browse and manage messages across multiple accounts.

## Phase 4 — Compose, Drafts, Outbox (Weeks 6–7)

**Goals**

- Ship dependable send workflows with resilience.

**Deliverables**

- Compose/reply/forward flows
- Draft autosave API (`/api/compose/draft`)
- Outbox processing (`/api/compose/send`) and failure visibility

**Exit Criteria**

- Send success target is met excluding remote rejects; failed sends are visible/actionable.

## Phase 5 — Search, Ops UI, Hardening (Weeks 7–8)

**Goals**

- Add cross-account search and operational observability.

**Deliverables**

- `GET /api/search` with defined filters
- Ops health endpoint/UI (`/api/ops/health`, queue + sync panels)
- Performance pass (pagination/virtualization)
- Mobile responsive behavior validation for inbox/detail/compose core flows

**Exit Criteria**

- Operator can diagnose service/sync/send states without logs-only debugging.

## Phase 6 — Release Readiness (Week 9)

**Goals**

- Finalize packaging, deployment guides, and MVP acceptance validation.

**Deliverables**

- Production-ready Docker image and Compose examples
- Traefik integration example
- Backup/restore documented and tested
- MVP acceptance checklist signed off
- Post-MVP backlog itemization includes PWA/mobile-adaptive work package and test plan entry

**Exit Criteria**

- All MVP acceptance criteria in specification are demonstrably satisfied.

## 6. Suggested Task Breakdown by Layer

### Frontend

- Mailbox/account settings screens
- Unified inbox and message detail views
- Compose UI + draft UX
- Search and ops dashboards

### Backend/API

- Auth/session endpoints
- Accounts/messages/compose/search/ops routes
- Validation, sanitization, and error contract standardization

### Services/Workers

- IMAP sync orchestrator
- SMTP send worker and retry policy
- Scheduler loop and lock/safety behavior

### Data

- Core schema for messages/threads/attachments/cursors/queue
- Migration strategy that supports SQLite + Postgres profiles

### DevOps/Docs

- Dockerfile/Compose profiles
- Traefik-compatible deployment template
- Backup/restore + operations runbook

## 7. Quality Gates (Per Phase)

Each phase should only close when all items pass:

1. Implementation complete for scoped deliverables
2. Tests added/updated for new behavior
3. Security controls verified (validation, authz/authn, secret handling)
4. Docker run-path validated in local compose
5. Documentation updated
6. Desktop and mobile viewport behavior validated for any user-facing UI changes

## 8. Risks and Mitigation Plan

- **Provider inconsistency (IMAP behavior differences):** maintain adapter abstraction + provider matrix tests.
- **Sync correctness drift:** enforce idempotent writes and scheduled reconciliation runs.
- **Queue fragility on crash/restart:** persist outbox state transitions atomically.
- **Performance degradation on large mailboxes:** pagination/indexing, lazy body fetch, attachment streaming.
- **Operational blind spots:** prioritize ops endpoints/UI before release hardening.

## 9. Definition of Done (MVP)

Raven MVP is complete when:

- User can connect at least 3 mailboxes and use unified inbox effectively.
- Incremental sync and compose/send operate reliably under restart and transient failures.
- Failed sync/send states are visible in operations UI.
- Persistent data survives container restarts.
- Deployment and backup/restore documentation are reproducible.

## 10. Post-MVP PWA & Mobile-Adaptation Plan

1. Add PWA capabilities (manifest, icons, install prompts) for supported browsers.
2. Implement mobile-device adaptive UI behavior for primary flows (inbox, message detail, compose, account switching).
3. Add explicit QA matrix for device classes and viewport breakpoints.
4. Ensure test plan includes regression coverage for PWA/mobile behavior prior to release.

## 11. Requirements Traceability (MVP)

| Spec Ref | Requirement Summary | Planned Phase/Workstream | Validation Method |
|---|---|---|---|
| S2.1 / S2.1.1 | Multi-user auth and account ownership enforcement | WS2, Phase 1 | Auth/API integration tests + authorization regression tests |
| S2.2 | Mailbox account CRUD + connectivity tests | WS3, Phase 1 | Endpoint tests + provider connectivity smoke tests |
| S2.3 | Initial/incremental sync with retries and isolation | WS3, Phase 2 | Sync integration tests + failure-injection scenarios |
| S2.4 / S2.5 | Unified inbox UX and core/bulk message actions | WS4, Phase 3 | Frontend E2E tests + API contract tests |
| S2.6 | Compose/draft/outbox reliability | WS5, Phase 4 | Compose/send integration tests + retry state tests |
| S2.7 | Cross-account search with filters | WS6, Phase 5 | Search relevance and filter integration tests |
| S2.8 | Ops visibility for sync/queue/service health | WS6, Phase 5 | API and UI checks for ops panels/endpoints |
| S3.3 | Security controls + no hardcoded/committed secrets | WS2, all phases | Security checklist + CI secret scanning + code review gate |
| S6.4 | Traefik-compatible compose contract | WS7, Phase 6 | Compose template validation + deployment smoke test behind Traefik |
| S7 | MVP acceptance bundle | Phase 6 | Acceptance checklist sign-off + documented evidence |

**Note:** Spec references map to sections in `docs/SPECIFICATION.md`.
