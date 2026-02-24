# Raven Phase 1 — Accounts + Security Core Implementation Package

## 1. Purpose

This document expands Phase 1 from `docs/IMPLEMENTATION_PLAN.md` into an implementation-ready package.

It is aligned with:

- `docs/STEERING.md`
- `docs/SPECIFICATION.md`

## 2. Phase 1 Goals

- Implement local authentication and session lifecycle.
- Deliver mailbox account CRUD and connectivity test endpoints.
- Enforce strict user/account ownership for account-scoped operations.
- Establish baseline security controls for mutating routes (CSRF + validation).

## 3. Core Deliverables

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/test`
- Credential encryption service using `APP_ENCRYPTION_KEY`
- Validation middleware + CSRF protection middleware for mutating endpoints
- Phase 1 API regression suite for auth/session/ownership/validation/CSRF paths

## 4. Detailed Scope

### 4.1 Authentication and Session Baseline

- Implement local login endpoint with user lookup and password verification.
- Implement logout endpoint that invalidates session and clears auth cookie.
- Enforce secure session cookie defaults:
  - `HttpOnly` MUST be enabled
  - `Secure` MUST be enabled in production
  - `SameSite=Lax` (or stricter) MUST be used
- Resolve authenticated identity through shared request-context helper for downstream ownership checks.

### 4.2 Account Lifecycle Endpoints

- Implement account list/create/update/delete routes under `/api/accounts`.
- Implement connectivity verification route: `POST /api/accounts/:id/test`.
- Route handlers MUST delegate all business logic to services.
- Services MUST delegate all persistence access to repositories.
- Repository methods MUST be user-scoped to prevent cross-user account access.

### 4.3 Credential Encryption and Secret Handling

- Encrypt mailbox credentials at rest before persistence.
- Use authenticated encryption with key material sourced only from `APP_ENCRYPTION_KEY`.
- Plaintext credentials MUST NOT be logged, returned in API responses, or written to disk.
- Error responses MUST redact provider/auth details that could leak sensitive information.

### 4.4 Input Validation and CSRF Protections

- Add request validation for all mutating auth/account routes.
- Reject malformed payloads with normalized API error envelopes.
- Enforce CSRF token issuance + verification for state-changing operations.
- Keep validation/auth/CSRF behavior standardized across endpoints.

### 4.5 Audit and Operational Traceability

- Record audit events for:
  - login success/failure
  - account create/update/delete
  - account connectivity test attempts
- Include user identity, event type, resource type/id, and timestamp.
- Ensure logs remain structured and free of secrets.

### 4.6 Testing and QA Coverage

- Add route-level regression tests for:
  - login/logout/session lifecycle
  - account CRUD happy paths
  - ownership denial paths (cross-user access attempts)
  - validation failures and CSRF failures
  - connectivity test success/failure behavior with redacted output checks
- Keep tests co-located with owned API surfaces where practical.

## 5. Agent Delegation Summary

### 5.1 Delegated task sent to @freddie

**Task brief sent**

Flesh out Phase 1 frontend/auth UX guidance:

1. Auth-state-aware shell behavior.
2. Account management UI scaffolding and form/error consistency.
3. Accessible interaction patterns suitable for later inbox/sync expansion.

**Actionable output returned**

- Define clear shell states: logged-out, authenticating/loading, logged-in.
- Standardize account forms with shared field components and inline validation feedback.
- Use consistent status feedback patterns for account test/connectivity outcomes.

### 5.2 Delegated task sent to @brian

**Task brief sent**

Flesh out Phase 1 backend/API architecture:

1. Auth + accounts endpoint layering.
2. Ownership-safe repository method contracts.
3. Domain error taxonomy for auth, authorization, validation, and provider test failures.

**Actionable output returned**

- Keep strict route → service → repository boundaries for all Phase 1 routes.
- Add user-scoped repository methods (`findByIdForUser`, `updateForUser`, `deleteForUser`).
- Define typed domain errors and map them through a shared API error normalizer.

### 5.3 Optional collaboration sent to @stephen

**Task brief sent**

Review minimum security controls required before opening account mutation endpoints.

**Actionable output returned**

- Enforce secure session cookie defaults and CSRF checks for mutating routes.
- Encrypt credentials at rest using runtime key material only.
- Add basic audit trail coverage for auth/account security-sensitive events.

### 5.4 Optional collaboration sent to @tommy

**Task brief sent**

Define Phase 1 regression test strategy and priority cases.

**Actionable output returned**

- Expand from smoke-only testing to route-level auth/account/security regression tests.
- Prioritize ownership-boundary negative tests and malformed/CSRF rejection tests.
- Add reusable fixtures/builders for users/accounts to keep tests maintainable.

## 6. Prioritized Implementation Sequence

1. Session + auth endpoint baseline (`/api/auth/login`, `/api/auth/logout`).
2. User-scoped account repository contracts and service methods.
3. Account CRUD + connectivity test endpoints with normalized errors.
4. Validation + CSRF middleware integration across mutating routes.
5. Credential encryption integration and audit event writes.
6. Full Phase 1 regression test pass and Docker profile verification (SQLite + Postgres).

## 7. Exit Criteria

Phase 1 is complete only when all of the following are true:

1. Multiple Raven users can log in/out and maintain isolated sessions.
2. Account CRUD and `POST /api/accounts/:id/test` enforce user ownership on all paths.
3. Mailbox credentials are encrypted at rest and never exposed in logs/responses.
4. CSRF and payload validation protect all mutating auth/account endpoints.
5. Regression tests cover happy/negative paths for auth, ownership, validation, and CSRF.
6. Docker-first runtime remains healthy in both default SQLite and optional Postgres profiles.

## 8. Phase 1 Risks to Track

- **Auth/session drift risk:** inconsistent cookie/session handling across routes.
- **Ownership bypass risk:** non-user-scoped data access in repositories/services.
- **Secret exposure risk:** accidental logging or unsafe error propagation.
- **Security coverage gaps:** incomplete CSRF/validation enforcement on new endpoints.

## 9. Completion Update (Current)

Phase 1 implementation is now functionally complete with the originally required backend/frontend/security scope, including QA follow-up hardening.

### 9.1 Delivered in this closure pass

- Audit event persistence implemented for auth/account mutation operations:
  - login success/failure,
  - logout success,
  - account create/update/delete/test success.
- Audit repository/service wiring added:
  - `src/server/repositories/audit.repository.ts`
  - `src/server/services/audit/audit.service.ts`
- Operational audit inspection endpoint added:
  - `GET /api/ops/audit-events`
- Phase 1 regression suite expanded to assert audit-event presence:
  - `src/server/api/phase1.regression-test.mjs`

### 9.2 Docker validation status

- `docker compose exec -T raven npm run test` ✅
- `docker compose exec -T raven npm run test:phase1` ✅

### 9.3 Residual note

- Optional Postgres-profile parity validation remains recommended as an execution follow-up (`make qa-pg`) where environment support is available.
