# Raven Phase 3 — Handoff

## 1. Phase Status

Phase 3 is **complete** and ready for Phase 4 handoff.

- Scope reference: `docs/PHASE_3_READING_MESSAGE_ACTIONS.md`
- Plan status reference: `docs/IMPLEMENTATION_PLAN.md`

## 2. Delivered Outcomes

### Message reading surfaces

- Unified and scoped message browsing is implemented.
- Message detail endpoint and UI integration are implemented.
- Detail view supports:
  - plaintext mode,
  - sanitized HTML mode.

### Message action surfaces

- Single-message action endpoint implemented and wired in UI.
- Bulk action endpoint implemented and wired in UI.
- Supported action set in Phase 3:
  - `mark_read`, `mark_unread`, `star`, `unstar`, `archive`, `delete`.

### Phase 3 hardening and UX polish

- Desktop resizable split between list/detail panes implemented.
- Mobile list/detail drilldown behavior retained.
- Message list date formatting improved to human-friendly relative display.
- Message preview behavior refined to first meaningful line with safe truncation.
- Detail pane overflow and line wrapping protections improved.

### IMAP/body correctness improvements integrated during Phase 3

- Folder-scoped remote message identity applied to avoid cross-folder UID collisions.
- IMAP raw source download path uses explicit UID mode.
- Decoded text cleanup improved for zero-width and problematic entity artifacts.

## 3. Validation Evidence

Docker-first QA path is green for this handoff state:

- `make qa-phase3` ✅
  - typecheck
  - health smoke
  - phase1 regression
  - phase2 regression
  - phase3 frontend smoke
  - deterministic phase3 regression

## 4. Known Limitations (Accepted)

- Divider resizing is pointer-drag based; keyboard resizing can be added as a future accessibility enhancement.
- Date formatting is local-timezone based and uses a practical week-boundary heuristic.
- Phase 3 includes action coverage for the core set above; move-action UI remains a future enhancement if prioritized.

## 5. Operational Notes for Maintainers

- Phase 3 behavior is validated in Docker-first workflow; prefer running `make qa-phase3` for local verification.
- Keep sanitized HTML-only rendering invariant for message detail surfaces.
- Maintain ownership checks and CSRF enforcement for all mutating message routes.

## 6. Phase 4 Entry Conditions

Phase 4 can proceed with these conditions satisfied:

1. Phase 3 QA remains green in default profile.
2. No open blockers on message list/detail/action stability.
3. Compose/draft/outbox contracts are reviewed against current auth/session and ownership patterns.
4. Any additional Phase 3 UX enhancements are explicitly deferred and tracked.
