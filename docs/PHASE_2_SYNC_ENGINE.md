# Raven Phase 2 — Sync Engine Implementation Package

## 1. Purpose

This document expands Phase 2 from `docs/IMPLEMENTATION_PLAN.md` into an implementation-ready package.

It is aligned with:

- `docs/STEERING.md`
- `docs/SPECIFICATION.md`

## 2. Phase 2 Goals

- Implement reliable initial and incremental mailbox synchronization.
- Persist durable sync cursors/checkpoints per account/folder.
- Isolate account failures so one broken account does not stall others.
- Expose operational sync visibility via an API status endpoint.

## 3. Core Deliverables

- Provider-facing sync adapter baseline for IMAP folder/message pull operations
- Sync orchestration service with account-scoped execution and bounded concurrency
- Cursor persistence and update policy using `sync_cursors`
- Retry/backoff policy for transient failures
- `GET /api/ops/sync-status`
- Phase 2 API/service regression and failure-injection coverage

## 4. Detailed Scope

### 4.1 Data Model and Migration Expansion

Additive migration(s) must introduce Phase 2 minimum entities from spec:

- `messages`
- `message_bodies`
- `threads`
- (optional in Phase 2 if needed for sync metadata) `attachments` metadata shell

Constraints:

- Keep migrations additive and SQLite/Postgres compatible.
- Preserve existing `sync_cursors` table and evolve it only additively.
- Add indexes that support incremental sync and account/folder message listing.

### 4.2 Sync Domain Contracts

Define typed sync contracts in service layer:

- `SyncJobInput` (userId/accountId/folder targets + mode)
- `SyncResult` (counts, cursor updates, duration, warnings)
- `SyncFailure` (classification + retryability + redacted details)

Error taxonomy should include at minimum:

- `SYNC_PROVIDER_UNAVAILABLE`
- `SYNC_AUTH_FAILED`
- `SYNC_CURSOR_INVALID`
- `SYNC_TRANSIENT_FAILURE`

All errors must map through standardized API/domain normalization patterns.

### 4.3 Provider Adapter Baseline (IMAP-first)

Implement a provider adapter abstraction for Phase 2 sync flow:

- list folders for account bootstrap
- fetch message summaries by cursor/UID window
- fetch message body payload references as needed for list/detail readiness

Design requirements:

- Adapter boundaries must prevent route/service layers from becoming provider-specific.
- Logging must redact credentials and message sensitive content.
- Support extension path for provider-specific behaviors later.

### 4.4 Initial Sync Workflow

Initial sync for newly linked account must:

1. Resolve default folder set (Inbox, Sent, Drafts, Archive if available).
2. Upsert folder records.
3. Pull latest message window per folder using provider adapter.
4. Upsert messages idempotently.
5. Persist cursor/checkpoint per folder in `sync_cursors`.

Idempotency requirement:

- Re-running initial sync must not duplicate folder/message records.

### 4.5 Incremental Sync Workflow

Incremental sync loop must:

1. Load cursor for each tracked folder.
2. Pull only new/changed messages since last checkpoint.
3. Upsert changed entities idempotently.
4. Advance cursor atomically with successful write set.

Operational target:

- Align with steering metric for IDLE-capable providers: median new-mail visibility under 10s.

### 4.6 Scheduling, Concurrency, and Failure Isolation

- Add scheduler-driven sync runner in Nitro runtime.
- Enforce bounded account concurrency to avoid resource exhaustion.
- Isolate failures per account and continue processing remaining accounts.
- Introduce retry policy with exponential backoff and max-attempt guardrail.

Minimum runtime controls:

- `SYNC_INTERVAL_SECONDS`
- optional `SYNC_MAX_CONCURRENCY`
- optional `SYNC_MAX_RETRIES`
- optional `SYNC_ADAPTER_MODE` (`stub` default, `imap` for provider-backed sync)

### 4.7 Operational Status Endpoint

Add `GET /api/ops/sync-status` with normalized response envelope and auth protection.

Minimum response model per account:

- account id / provider label / email
- last successful sync timestamp
- last attempted sync timestamp
- current state (`idle|syncing|retrying|failed`)
- retry count and next retry timestamp when applicable
- last error code/message (redacted)

### 4.8 Security and Ownership Requirements

- Sync operations must remain user/account ownership safe for all reads/writes.
- No plaintext mailbox secret logging or exposure.
- All mutating/manual sync triggers (if introduced) must enforce CSRF + auth.
- Audit events should include sync lifecycle events at key transitions:
  - `sync.run.started`
  - `sync.run.succeeded`
  - `sync.run.failed`

### 4.10 Account Deletion Semantics (Phase 2 finalized)

- Account deletion must perform dependency-aware cleanup before removing the mailbox account row.
- Cleanup order must include at minimum:
  1. `message_bodies` for account-owned messages
  2. `messages`
  3. `threads`
  4. `sync_cursors`
  5. `folders`
  6. `mailbox_accounts`
- Delete must verify ownership (`accountId` + `userId`) before mutating data.
- Delete must execute in a transaction in both SQLite and Postgres paths.
- SQLite delete behavior under active sync contention must use busy-timeout + bounded retries.
- If lock contention persists, API should return a retryable domain error:
  - code: `ACCOUNT_DELETE_BUSY`
  - status: `503`
  - message: "Account is busy with sync activity. Please retry in a few seconds."

### 4.9 QA and Test Strategy (Phase 2)

Add coverage for:

- initial sync happy path (folder + message + cursor writes)
- incremental sync idempotency
- retry/backoff behavior on transient provider failures
- failure isolation across multiple accounts
- ownership safety on sync status and sync-triggered data access
- `/api/ops/sync-status` contract and redaction behavior
- delete behavior for synced accounts including contention-aware retry semantics
  (`200` success on immediate delete OR `503 ACCOUNT_DELETE_BUSY` with successful retry path)

Execution expectation:

- Docker-first validation path remains default (SQLite profile mandatory, Postgres parity recommended).

## 5. Milestones and Suggested Sequence

1. **Schema + contracts**
   - Add migration(s) for Phase 2 message entities and indexes.
   - Define sync domain types/errors and repository interfaces.
2. **Provider + orchestration baseline**
   - Implement IMAP adapter interface and sync service skeleton.
   - Ship initial sync flow with idempotent persistence.
   - Temporary stub adapter use is allowed only through early plumbing validation;
     real provider-backed adapter must replace stub behavior before Phase 2 exit criteria sign-off.
3. **Incremental + scheduler**
   - Implement cursor-based incremental sync and scheduler loop wiring.
   - Add concurrency control and account-level isolation.
4. **Resilience + visibility**
   - Implement retry/backoff and `GET /api/ops/sync-status`.
   - Add audit events and structured operational logs.
5. **QA closure**
   - Add regression/failure-injection tests.
   - Validate Docker profile(s) and update docs/handoff.

## 6. Exit Criteria

Phase 2 is complete only when all of the following are true:

1. Initial sync persists folders/messages/cursors for newly connected accounts.
2. Incremental sync advances cursors and upserts new mail idempotently.
3. Transient sync failures trigger bounded retries with backoff.
4. One account failing sync does not stall other accounts.
5. `GET /api/ops/sync-status` accurately reports sync state and redacted errors.
6. Docker-first run path remains healthy with Phase 2 workloads.

## 7. Risks to Track During Implementation

- **Provider variance risk:** IMAP servers differ in UID/flags behavior; mitigate with adapter contract + fixture matrix.
- **Cursor corruption risk:** invalid cursor writes can stall sync; mitigate with atomic cursor updates + reconciliation path.
- **Performance risk on large folders:** mitigate via bounded windows, pagination, and selective body fetch strategy.
- **Operational blind spot risk:** mitigate with sync status endpoint and structured sync lifecycle logs early.

## 8. Handoff Targets for Phase 3

Phase 2 handoff should provide:

- Stable message/folder persistence contracts for read UX APIs.
- Verified sync status API for ops surface integration.
- Known limitations list (provider caveats, deferred optimizations).
- Updated regression suite baseline that Phase 3 can extend safely.

## 9. Phase 2 Completion and Handoff Notes

### 9.1 Completion Status

Phase 2 implementation is functionally complete for MVP progression, with the following finalized:

- Sync schema expansion (`threads`, `messages`, `message_bodies`) and cursor persistence in place.
- Scheduler-driven sync orchestration with bounded concurrency and per-account failure isolation.
- Adapter mode switch (`stub` and `imap`) with runtime status tracking in `GET /api/ops/sync-status`.
- Delete-under-sync contention handling and retryable API semantics (`ACCOUNT_DELETE_BUSY`).
- Phase 2 regression suite coverage for sync flow, ownership boundaries, and delete/sync contention behavior.

### 9.2 Error Taxonomy Alignment (Implemented)

Runtime and API paths now distinguish key sync failure classes:

- `SYNC_AUTH_FAILED`
- `SYNC_PROVIDER_UNAVAILABLE`
- `SYNC_CURSOR_INVALID`
- `SYNC_TRANSIENT_FAILURE`

Retry scheduling applies to retryable classes (`SYNC_TRANSIENT_FAILURE`, `SYNC_PROVIDER_UNAVAILABLE`) and avoids blind retries for non-retryable conditions.

### 9.3 Known Limitations (Accepted for Phase 3 Start)

- `stub` adapter remains default for local/dev bootstrap; production-like validation should use `SYNC_ADAPTER_MODE=imap`.
- Cursor invalidation currently surfaces explicit failure (`SYNC_CURSOR_INVALID`) rather than performing auto-rebuild of cursor lineage.
- Latency target verification for IDLE-capable providers is environment-dependent and should be captured in deployment-specific QA evidence.

### 9.4 Phase 3 Readiness Checklist

Before Phase 3 feature build begins, maintainers should ensure:

1. IMAP-mode validation has been executed in target environment(s).
2. SQLite default profile regression is green (`test`, `test:phase1`, `test:phase2`).
3. Optional Postgres profile parity run is captured for this commit range.
4. Any provider-specific caveats discovered during IMAP validation are added to this document.

### 9.5 Validation Evidence Snapshot (Current)

Validated in containerized workflow for this commit range:

- SQLite/default profile:
  - `docker compose exec -T raven npm run typecheck` ✅
  - `docker compose exec -T raven node src/server/api/phase1.regression-test.mjs` ✅
  - `docker compose exec -T raven node src/server/api/phase2.regression-test.mjs` ✅
- IMAP adapter mode runtime path:
  - container environment confirmed with `SYNC_ADAPTER_MODE=imap` ✅
  - Phase 1 and Phase 2 regressions green in IMAP mode ✅
- Postgres optional profile parity:
  - initial run exposed expected local-volume credential mismatch (`28P01`) due to stale Postgres volume state.
  - rerun with clean profile volumes (`down -v` then `up --build`) stabilized runtime.
  - typecheck + Phase 1 + Phase 2 regressions green in Postgres profile ✅

### 9.6 Phase 2 Handover Artifact

Phase 2 handover package is recorded in:

- `docs/PHASE_2_HANDOFF.md`