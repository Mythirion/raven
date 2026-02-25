# Raven Phase 3 — Reading & Message Actions Implementation Package

## Status

✅ **Completed and validated** (SQLite/default profile, Docker-first QA path).

### Completion highlights

- Read surfaces are live:
  - unified message browsing,
  - account/folder scoped browsing,
  - message detail view with plaintext and sanitized HTML modes.
- Action surfaces are live:
  - single-message actions,
  - bulk message actions.
- UX hardening delivered:
  - desktop resizable list/detail split,
  - mobile drilldown behavior retained,
  - human-friendly message date formatting,
  - compact first-line preview with safe truncation,
  - detail pane overflow/wrapping protections.
- IMAP correctness hardening delivered:
  - folder-scoped remote message identity,
  - explicit UID source download path,
  - decoded body cleanup for zero-width/entity artifacts.

### Validation evidence summary

- `make qa-phase3` repeatedly green after Phase 3 fixes/polish:
  - typecheck,
  - health smoke,
  - phase1/phase2 regressions,
  - phase3 frontend smoke,
  - deterministic phase3 regression.

## 1. Purpose

This document expands Phase 3 from `docs/IMPLEMENTATION_PLAN.md` into an implementation-ready, full-stack execution plan.

It is aligned with:

- `docs/STEERING.md`
- `docs/SPECIFICATION.md`
- `docs/PHASE_2_HANDOFF.md`

## 2. Phase 3 Goals

- Deliver stable read/manage workflows in UI.
- Ship unified inbox and account/folder browsing experience.
- Add message detail rendering for plaintext and sanitized HTML.
- Implement core and bulk message actions through ownership-safe APIs.

## 3. Scope and Deliverables

### 3.1 Frontend Deliverables

- New message workspace route(s):
  - unified inbox view,
  - account/folder scoped view,
  - message detail pane/page.
- Message list component with sender, subject, snippet, date, flags.
- Message detail component with explicit plaintext/HTML mode toggle.
- Bulk selection UI + action bar (read/unread, star/unstar, archive, delete, move).
- Empty/loading/error states for list/detail/action workflows.

### 3.2 Backend/API Deliverables

- `GET /api/messages` (unified + filtered listing).
- `GET /api/messages/:id` (single message detail payload).
- `POST /api/messages/:id/actions` (single-message mutation).
- `POST /api/messages/actions/bulk` (bulk mutation).
- Ownership-safe repository/service calls for all message read/write paths.

### 3.3 Data/Repository Deliverables

- Query methods for:
  - cross-account message listing for current user,
  - account/folder scoped message listing,
  - message detail lookup with ownership joins,
  - bulk action target resolution with ownership enforcement.
- Additive migration for message action support fields, if missing:
  - canonical flags columns/indices (read/starred/archived/deleted state),
  - folder move metadata fields where needed for provider sync reconciliation.

### 3.4 Security and Ops Deliverables

- CSRF enforcement on all mutating message action routes.
- Strict input validation for action payloads and message ids.
- Sanitized HTML rendering remains server-side trusted-output only.
- Audit event coverage for message action operations (single and bulk).

## 4. Agent Collaboration Output

## 4.1 @dave — Technical Writer

**What was sent**

- Request to define a step-by-step Phase 3 implementation narrative and acceptance-ready milestones with unambiguous wording.

**What was returned**

- Keep scope explicit: split Phase 3 into "read surfaces" then "action surfaces" to reduce risk.
- Require each milestone to include API contract completion, UI behavior completion, and QA evidence.
- Add a concise operator-facing definition of done focused on cross-account browse/manage reliability.

## 4.2 @freddie — Frontend Reviewer

**What was sent**

- Request for UI architecture and UX guidance for unified inbox, message detail, and bulk actions.

**What was returned**

- Implement a two-pane responsive workspace contract:
  - desktop: persistent list + detail,
  - mobile: list-to-detail drilldown with clear back navigation.
- Centralize message-list state (selection, filters, pagination cursor) in a dedicated composable.
- Use optimistic UI only for lightweight flag changes; fallback to full refresh for move/delete until API idempotency checks are proven.
- Add keyboard/accessible interaction support for row selection and bulk action controls.

## 4.3 @brian — Backend Reviewer

**What was sent**

- Request for route/service/repository design for message read and action APIs with ownership and consistency constraints.

**What was returned**

- Keep strict route → service → repository boundaries and domain-error normalization.
- Introduce action command contracts:
  - `MessageActionCommand` for single,
  - `BulkMessageActionCommand` for batch operations.
- Ensure every write path validates ownership with user-scoped message resolution before mutation.
- Require idempotent action semantics (repeating same action does not corrupt state).

## 4.4 @stephen — Security Analyst

**What was sent**

- Request for Phase 3-specific security controls and high-risk checks.

**What was returned**

- Treat HTML body output as sanitized-only and never render unsanitized provider payloads.
- Enforce CSRF + auth + validation on all message action endpoints (including bulk route).
- Log/audit action intent and result without storing sensitive body content.
- Add explicit negative tests for cross-user message id probing and unauthorized bulk action attempts.

## 4.5 @tommy — QA Engineer

**What was sent**

- Request for Phase 3 regression strategy covering list/detail/actions across desktop/mobile behavior.

**What was returned**

- Build API regression suite for list, detail, single action, bulk action, and ownership denial paths.
- Add frontend integration tests for:
  - list rendering + selection behavior,
  - detail rendering mode toggle (text/html),
  - bulk action success/failure UX.
- Validate desktop and mobile viewport behavior for message navigation and action workflows.

## 5. Step-by-Step Full-Stack Implementation Plan

### Step 0 — Phase 3 kickoff gates (entry validation)

1. Confirm Phase 2 handoff gates are still green (SQLite default required; Postgres parity recommended).
2. Confirm IMAP-mode smoke validation evidence exists for current commit range.
3. Freeze Phase 3 API contract draft before UI implementation starts.

### Step 1 — Define contracts and domain types

1. Add shared domain types for message summary/detail and action commands.
2. Add domain error taxonomy for message operations (not found, forbidden, invalid action, conflict/transient).
3. Update error normalization mappings for new message endpoints.

### Step 2 — Data-layer readiness

1. Add additive migration for action-oriented fields/indexes if required.
2. Implement repository read queries:
   - user-scoped unified list,
   - user/account/folder scoped list,
   - message detail with body fields.
3. Implement repository write queries:
   - single action mutation,
   - bulk action mutation with transaction boundaries.

### Step 3 — Service-layer implementation

1. Add `messages.service` read APIs for list/detail.
2. Add single and bulk action service methods with:
   - ownership checks,
   - idempotent update behavior,
   - audit event emission.
3. Ensure move/archive/delete semantics are normalized across SQLite and Postgres paths.

### Step 4 — API route implementation

1. Implement `GET /api/messages` with filter parsing/validation.
2. Implement `GET /api/messages/:id` detail handler.
3. Implement `POST /api/messages/:id/actions` and `POST /api/messages/actions/bulk`.
4. Apply auth requirements, CSRF checks on mutating routes, and standardized response envelope.

### Step 5 — Frontend data/composable layer

1. Add `useMessages` composable for list/detail/filter/selection/action orchestration.
2. Integrate with existing auth/session state and CSRF header helpers.
3. Provide deterministic state transitions for busy/error/success per action type.

### Step 6 — Frontend message workspace UI

1. Create message list panel with account/folder filters and pagination controls.
2. Create detail panel/page with plaintext/sanitized HTML mode toggle.
3. Add bulk selection + action toolbar and single-message action controls.
4. Implement responsive behavior contract (desktop split-pane, mobile drilldown).

### Step 7 — Security and audit closure

1. Verify no unsanitized HTML payload is rendered in UI.
2. Confirm all mutating routes enforce CSRF + validation + ownership checks.
3. Add audit event coverage for key message actions:
   - `message.action.single`
   - `message.action.bulk`

### Step 8 — QA and regression coverage

1. Add API regression tests for:
   - list/detail happy paths,
   - single/bulk action paths,
   - ownership-denial and validation failures.
2. Add frontend tests for list/detail/actions including mobile/desktop viewport behavior.
3. Run Docker-first validation matrix:
   - default SQLite profile mandatory,
   - optional Postgres parity recommended.

### Step 9 — Documentation and handoff

1. Update `docs/IMPLEMENTATION_PLAN.md` status notes for Phase 3 progress.
2. Produce `docs/PHASE_3_HANDOFF.md` with known limitations and evidence.
3. Record any deferred items for Phase 4 dependency planning.

## 6. Exit Criteria

Phase 3 is complete only when all of the following are true:

1. User can browse unified inbox and account/folder views with stable pagination/filter behavior.
2. User can open message detail and safely view plaintext + sanitized HTML modes.
3. Core single and bulk actions work reliably with ownership-safe enforcement.
4. Action failures are surfaced clearly in UI and reflected in normalized API errors.
5. Regression coverage exists for happy, failure, and authorization boundary paths.
6. Docker-first validation remains green in default profile (and parity profile if executed).

## 7. Simplified Phase 3 Goals (for quick tracking)

1. Build a reliable inbox browsing experience (unified + account/folder views).
2. Add safe and complete message detail viewing (text + sanitized HTML).
3. Implement message management actions (single + bulk) end-to-end.
4. Ensure security/ownership protections and regression coverage are in place.

## 8. Step 0 Kickoff Completion Record (Execution Baseline)

Step 0 has been completed and validated prior to Step 1 implementation work.

### 8.1 Phase 2 gate evidence

- `docker compose ps` confirms Raven and Postgres services healthy.
- `docker compose exec -T raven npm run typecheck` ✅
- `docker compose exec -T raven node src/server/api/phase1.regression-test.mjs` ✅
- `docker compose exec -T raven node src/server/api/phase2.regression-test.mjs` ✅

### 8.2 IMAP-mode smoke evidence

- Default runtime mode remains `SYNC_ADAPTER_MODE=stub` for local bootstrap.
- IMAP smoke verified for current commit range via:
  - `docker compose exec -T -e SYNC_ADAPTER_MODE=imap raven node src/server/api/phase2.regression-test.mjs` ✅

### 8.3 Phase 3 API contract draft (frozen for initial implementation)

The following contract is now frozen for Step 1–4 implementation. Changes require explicit doc update and note in handoff.

#### GET `/api/messages`

Purpose:

- Return a user-scoped message list for unified inbox or filtered account/folder view.

Query params:

- `accountId?: string`
- `folderId?: string`
- `limit?: number` (default 25, max 100)
- `cursor?: string` (opaque pagination cursor)
- `q?: string` (reserved for lightweight subject/sender filtering in Phase 3)

Success envelope:

```json
{
  "ok": true,
  "data": {
    "messages": [
      {
        "id": "uuid",
        "accountId": "uuid",
        "folderId": "uuid",
        "subject": "string",
        "fromAddress": "string|null",
        "toAddress": "string|null",
        "snippet": "string|null",
        "receivedAt": "iso-datetime|null",
        "isRead": true,
        "isStarred": false,
        "isArchived": false,
        "isDeleted": false
      }
    ],
    "nextCursor": "string|null"
  },
  "meta": {
    "requestId": "string"
  }
}
```

#### GET `/api/messages/:id`

Purpose:

- Return detail payload for one user-owned message.

Success envelope:

```json
{
  "ok": true,
  "data": {
    "message": {
      "id": "uuid",
      "accountId": "uuid",
      "folderId": "uuid",
      "subject": "string",
      "fromAddress": "string|null",
      "toAddress": "string|null",
      "snippet": "string|null",
      "receivedAt": "iso-datetime|null",
      "isRead": true,
      "isStarred": false,
      "isArchived": false,
      "isDeleted": false,
      "bodyText": "string|null",
      "bodyHtmlSanitized": "string|null"
    }
  },
  "meta": {
    "requestId": "string"
  }
}
```

#### POST `/api/messages/:id/actions`

Purpose:

- Apply one action to one user-owned message.

Request body:

```json
{
  "action": "mark_read | mark_unread | star | unstar | archive | delete | move",
  "targetFolderId": "uuid (required when action=move)"
}
```

Success envelope:

```json
{
  "ok": true,
  "data": {
    "result": {
      "messageId": "uuid",
      "action": "string",
      "updated": true
    }
  },
  "meta": {
    "requestId": "string"
  }
}
```

#### POST `/api/messages/actions/bulk`

Purpose:

- Apply one action to multiple user-owned messages in one request.

Request body:

```json
{
  "messageIds": ["uuid"],
  "action": "mark_read | mark_unread | star | unstar | archive | delete | move",
  "targetFolderId": "uuid (required when action=move)"
}
```

Success envelope:

```json
{
  "ok": true,
  "data": {
    "result": {
      "action": "string",
      "requested": 10,
      "updated": 10
    }
  },
  "meta": {
    "requestId": "string"
  }
}
```

### 8.4 Initial error taxonomy for message operations

- `MESSAGE_NOT_FOUND` (404)
- `MESSAGE_FORBIDDEN` (403)
- `MESSAGE_ACTION_INVALID` (400)
- `MESSAGE_ACTION_CONFLICT` (409)
- `MESSAGE_BULK_EMPTY` (400)
- `MESSAGE_TARGET_FOLDER_REQUIRED` (400)