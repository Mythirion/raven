# Raven Phase 2 — Handover

## 1. Phase Status

Phase 2 is **complete** and ready for Phase 3 handoff.

- Scope reference: `docs/PHASE_2_SYNC_ENGINE.md`
- Plan status reference: `docs/IMPLEMENTATION_PLAN.md`

## 2. Delivered Outcomes

### Sync engine and persistence

- Initial + incremental sync behavior implemented with durable cursor tracking.
- Sync persistence model in place for `threads`, `messages`, and `message_bodies`.
- Sync status visibility implemented via `GET /api/ops/sync-status`.

### Reliability and failure handling

- Retry/backoff behavior and per-account failure isolation implemented.
- Sync error taxonomy aligned and surfaced:
  - `SYNC_AUTH_FAILED`
  - `SYNC_PROVIDER_UNAVAILABLE`
  - `SYNC_CURSOR_INVALID`
  - `SYNC_TRANSIENT_FAILURE`
- Account deletion under active sync contention handled with retryable semantics:
  - `503 ACCOUNT_DELETE_BUSY` when lock contention persists.

### Runtime hardening

- Container runtime hardened for writable Nuxt/npm/typecheck cache paths:
  - `/app/node_modules/.cache`
  - `/app/.nuxt`
  - `/app/.npm`

## 3. Validation Evidence

## 3.1 SQLite/default profile

- `docker compose exec -T raven npm run typecheck` ✅
- `docker compose exec -T raven node src/server/api/phase1.regression-test.mjs` ✅
- `docker compose exec -T raven node src/server/api/phase2.regression-test.mjs` ✅

## 3.2 IMAP adapter mode path

- Runtime mode confirmed with `SYNC_ADAPTER_MODE=imap` ✅
- Phase 1 and Phase 2 regressions green while IMAP mode enabled ✅

## 3.3 Postgres optional profile parity

- Profile validated using combined compose files:
  - `docker-compose.yml`
  - `docker-compose.postgres.yml`
- Initial run showed expected local-volume credential mismatch (`28P01`) due to stale Postgres volume state.
- Resolved by clean volume bootstrap (`down -v` then `up --build`).
- Post-recovery validation green:
  - typecheck ✅
  - Phase 1 regression ✅
  - Phase 2 regression ✅

## 4. Known Limitations (Accepted)

- `stub` adapter remains default for local/dev bootstrap.
- Cursor invalidation currently reports explicit failure (`SYNC_CURSOR_INVALID`) rather than auto-rebuilding cursor lineage.
- IDLE latency target evidence remains environment-dependent and should be captured in production-like validation runs.

## 5. Operational Notes for Maintainers

- If Postgres profile auth fails after password/env changes, reinitialize local volumes before parity rerun:
  - `docker compose -f docker-compose.yml -f docker-compose.postgres.yml down -v`
  - `docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d --build`

## 6. Phase 3 Entry Conditions

Phase 3 can proceed with these conditions satisfied:

1. Phase 2 regressions are green in default profile.
2. IMAP-mode validation has been executed in target environment(s).
3. Postgres parity evidence exists for the commit range.
4. Any provider-specific caveats discovered during IMAP validation are documented.
