# Raven Phase 1 — Development Handoff to @freddie and @brian

## 1. Context Sent

Phase 0 is complete and Phase 1 planning is approved.

Primary references provided:

- `docs/PHASE_1_ACCOUNTS_SECURITY_CORE.md`
- `docs/IMPLEMENTATION_PLAN.md` (Phase 1 section)
- `docs/STEERING.md`
- `docs/SPECIFICATION.md`

Global constraints emphasized:

- Docker-first workflow remains the primary execution path.
- Strict route → service → repository boundaries.
- Multi-user ownership enforcement for all account-scoped operations.
- No hardcoded secrets; runtime env injection only.

## 2. Delegated Development Kickoff — @freddie (Frontend)

### Scope to start now

1. Implement auth/session-aware shell states:
   - logged-out,
   - authenticating/loading,
   - logged-in.
2. Build account management UI scaffold for:
   - list accounts,
   - create account,
   - edit account,
   - trigger account connectivity test,
   - remove account.
3. Standardize frontend validation and inline error feedback patterns for account forms.
4. Reuse and extend UI primitives in `src/components/ui/*` instead of duplicating controls.

### Required acceptance conditions

- Form interactions are accessible and keyboard-usable.
- Error/success feedback for account test actions is consistent and non-leaky.
- Auth-state transitions do not break the default shell layout.
- UI integrates with planned API contracts without bypassing shared client patterns.

### Suggested first PR slice

- Shell auth-state handling + account list/create form skeleton + validation UX baseline.

## 3. Delegated Development Kickoff — @brian (Backend)

### Scope to start now

1. Implement auth endpoints:
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
2. Implement account endpoints:
   - `GET /api/accounts`
   - `POST /api/accounts`
   - `PATCH /api/accounts/:id`
   - `DELETE /api/accounts/:id`
   - `POST /api/accounts/:id/test`
3. Implement user-scoped repository contracts/methods for ownership-safe access.
4. Integrate credential encryption using `APP_ENCRYPTION_KEY`.
5. Integrate validation and CSRF checks for all mutating auth/account routes.

### Required acceptance conditions

- No route directly accesses DB internals.
- Ownership checks are enforced in service/repository flows on every account-scoped path.
- Credential secrets are encrypted at rest and not exposed in logs or API responses.
- Error handling uses normalized envelopes and typed domain errors.

### Suggested first PR slice

- Auth login/logout + session wiring + user-scoped account repository scaffolding.

## 4. Shared Coordination Notes

- API contract questions should be resolved before frontend wiring for account create/edit/test forms.
- Keep changes additive and Phase-1-focused only (no sync engine behavior yet).
- Maintain parity expectations for SQLite default and Postgres optional profile.

## 5. Definition of Kickoff Complete

Kickoff is considered complete when both agents confirm:

1. They have started implementation from the assigned first PR slice.
2. They are aligned on endpoint contracts and ownership/security requirements.
3. They are targeting Phase 1 exit criteria in `docs/PHASE_1_ACCOUNTS_SECURITY_CORE.md`.

## 6. QA Gap Follow-up — Issued Implementation Tasks

Following QA review feedback, additional implementation tasks are now issued to the relevant agents.

### 6.1 Issued to @tommy (QA Engineer)

**Task issued**

Implement Phase 1 route-level API regression coverage replacing smoke-only confidence for auth/account security paths.

**Required implementation scope**

1. Add regression tests for auth lifecycle:
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
   - `GET /api/auth/me`
2. Add regression tests for account ownership and denial paths:
   - `GET /api/accounts`
   - `POST /api/accounts`
   - `PATCH /api/accounts/:id`
   - `DELETE /api/accounts/:id`
   - `POST /api/accounts/:id/test`
3. Add negative-path tests for:
   - missing/invalid CSRF token on mutating routes,
   - payload validation failures,
   - cross-user access denial.
4. Ensure tests are Docker-runnable in the project’s standard workflow.

**Acceptance target**

- Phase 1 test matrix clearly reports pass/fail across happy and negative security paths.

### 6.2 Issued to @brian (Backend Reviewer/Implementer)

**Task issued**

Support QA implementation by stabilizing backend testability contracts and fixing any endpoint-level issues discovered by new regressions.

**Required implementation scope**

1. Address backend defects surfaced by @tommy’s regression suite.
2. Keep route → service → repository boundaries intact while fixing issues.
3. Preserve ownership enforcement and CSRF/validation behavior under refactor.
4. Add/adjust backend test fixtures/builders needed for multi-user ownership scenarios.

**Acceptance target**

- All new backend API security/ownership regressions pass without weakening guardrails.

### 6.3 Issued to @freddie (Frontend Reviewer/Implementer)

**Task issued**

Align frontend account/auth scaffold behavior with backend test-driven contract changes and ensure UX remains consistent.

**Required implementation scope**

1. Update frontend request/response handling if API contract details are tightened.
2. Keep auth-state transitions and account action feedback consistent for failure cases.
3. Validate UI behavior for common auth/account error scenarios (unauthorized, validation, CSRF-denied).

**Acceptance target**

- Frontend remains coherent and usable while reflecting backend/security validation outcomes.

## 7. Immediate Coordination Sequence

1. @tommy lands initial failing/passing regression suite baseline.
2. @brian resolves backend failures surfaced by the suite.
3. @freddie aligns UI behavior for any contract/error-shape adjustments.
4. @tommy re-runs final regression pass and reports residual risk.

## 8. Final Phase 1 Completion Handover (Implemented)

Phase 1 is now complete and validated.

### 8.1 Delivered implementation outcomes

- Auth/session core delivered:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- Accounts security core delivered:
  - `GET /api/accounts`
  - `POST /api/accounts`
  - `PATCH /api/accounts/:id`
  - `DELETE /api/accounts/:id`
  - `POST /api/accounts/:id/test`
- Ownership-safe backend flow enforced via route → service → repository boundaries.
- CSRF + validation guardrails applied on mutating routes.
- Audit trail implementation added for auth/account mutation flows and exposed via:
  - `GET /api/ops/audit-events`

### 8.2 Regression and operational validation outcomes

- Phase 1 regression suite (`src/server/api/phase1.regression-test.mjs`) passes, including:
  - auth lifecycle checks,
  - ownership denial paths,
  - CSRF/validation negative paths,
  - audit-event presence assertions.
- Smoke health test passes (`src/server/api/ops/health.smoke-test.mjs`).
- Typecheck passes in containerized workflow.

### 8.3 Runtime workflow update (performance follow-up)

- Docker/Make execution path has been switched from npm commands to Bun commands for faster iteration:
  - Docker build uses `bun install` and `bun run build`.
  - Makefile QA targets now use `bun run ...`.
- Validation with Bun path is passing via `make qa` and `make qa-pg`.

### 8.4 Residual notes for Phase 2 kickoff

- Keep Phase 1 security invariants unchanged while introducing sync-engine behavior.
- Preserve ownership checks and normalized error contracts as Phase 2 APIs are added.
- Continue Docker-first verification on every Phase 2 milestone using:
  - `make qa`
  - `make qa-pg`
