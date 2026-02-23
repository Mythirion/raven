# Raven Product & Technical Specification

## 1. Overview

Raven is a self-hostable web email client that aggregates multiple inboxes into a unified interface.

### Mandatory Stack

- Nuxt 4
- TypeScript
- Vite
- Tailwind CSS
- Docker runtime

### Deployment Modes

- **Preferred:** single container (`raven`) with SQLite
- **Acceptable:** two containers (`raven` + `postgres`)

---

## 2. Functional Specification

## 2.1 Authentication & Session

- Local login with support for multiple Raven users
- Session-based auth with secure cookies
- Optional TOTP MFA (post-MVP)
- Future OIDC support for external identity providers (e.g., Authelia, Authentik)

### 2.1.1 User and Account Ownership Model

- Raven must support multiple application users.
- Each user may connect one or many mailbox accounts.
- Mailbox accounts are scoped to their owning Raven user unless explicit sharing features are introduced in a future release.
- Authorization checks must enforce user/account ownership on all account, folder, and message operations.

## 2.2 Mailbox Account Management

- Add mailbox account via IMAP + SMTP credentials or OAuth-compatible flow where available
- Edit mailbox settings (host, port, TLS mode, display name, default sender)
- Remove/deactivate account without deleting global user profile
- Connection test endpoint for both IMAP and SMTP

## 2.3 Mail Synchronization

- Initial sync for selected folders (Inbox, Sent, Drafts, Archive by default)
- Incremental sync with cursor-based UID strategy
- IDLE support where available; fallback polling otherwise
- Retry with exponential backoff on transient failures
- Isolated failures: one account failing must not stall others

## 2.4 Mail Reading UX

- Unified inbox (all accounts)
- Per-account/per-folder browsing
- Message list with sender, subject, snippet, date, flags
- Message detail with plaintext and sanitized HTML render modes
- Attachment metadata display and safe download

## 2.5 Mail Actions

- Read/unread toggle
- Star/unstar
- Archive
- Delete
- Move between folders
- Bulk actions across selected messages

## 2.6 Compose & Send

- Compose new / reply / reply-all / forward
- Select sender identity/account
- Add attachments (size limits configurable)
- Draft autosave
- Outbox queue with retry and explicit failed/sent states

## 2.7 Search

- Cross-account search by default
- Filters: account, folder, date range, unread/read, has attachments
- Indexed fields: subject, from, to, snippet/body tokens

## 2.8 Operational UI

- Display account sync health (last success, last error, lag)
- Queue/job visibility (pending, retrying, failed)
- Service health panel (DB status, scheduler status)

---

## 3. Non-Functional Requirements

## 3.1 Performance

- Warm app startup health < 10s target
- Message list render uses pagination or virtualization
- Time-to-interactive target on LAN: < 2s for warm sessions

## 3.2 Reliability

- Idempotent sync writes
- Durable cursor/checkpoint persistence
- Crash-safe outbox processing
- Dead-letter/failed-job visibility for operator action

## 3.3 Security

- TLS required in production ingress
- CSRF protections for state-changing routes
- Strict input validation on API routes
- Message HTML sanitization server-side before render
- Credential encryption at rest with `APP_ENCRYPTION_KEY`
- **No secrets may be hardcoded in source code or committed to version control**
- Secrets must be injected at runtime via environment variables or approved external secret stores

## 3.4 Privacy

- No telemetry by default
- Optional anonymized metrics endpoint

## 3.5 Portability

- Linux x86_64 and arm64 container compatibility
- Persistent data only in explicit mounted volumes

## 3.6 Progressive Web App (Post-MVP)

- Raven should support a PWA mode post-MVP to reduce the need for separate native mobile apps.
- On mobile device detection, Raven should present a mobile-friendly UI layout and interaction model.
- PWA support should include installability metadata (manifest/icons) and service worker strategy appropriate for secure email workloads.

---

## 4. System Architecture Specification

## 4.1 Application Components

1. **Nuxt UI layer** (`src/pages`, `src/components`)
2. **Nuxt server API** (`/src/server/api/*`)
3. **Service layer** (`/src/server/services/*`)
4. **Provider adapters** (`imap`, `smtp`)
5. **Scheduler/worker loop** in Nitro runtime

## 4.2 Data Model (minimum)

- `users`
- `mailbox_accounts`
- `folders`
- `messages`
- `message_bodies`
- `attachments`
- `threads`
- `sync_cursors`
- `send_queue`
- `audit_events`

## 4.3 Storage Profiles

### SQLite Profile (default)

- DB file at `/data/app.db`
- Attachments at `/data/attachments`

### Postgres Profile (optional)

- External DB via `DATABASE_URL`
- Same schema and migration path

---

## 5. API Surface (initial)

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/test`
- `GET /api/messages`
- `GET /api/messages/:id`
- `POST /api/messages/:id/actions`
- `POST /api/compose/send`
- `POST /api/compose/draft`
- `GET /api/search`
- `GET /api/ops/health`
- `GET /api/ops/sync-status`

---

## 6. Docker Specification

## 6.1 Container Design

- Multi-stage build
- Non-root runtime user
- Include only production artifacts in final image
- Health endpoints exposed for orchestrators

## 6.2 Environment Variables

Required:

- `APP_BASE_URL`
- `APP_ENCRYPTION_KEY`
- `SESSION_SECRET`
- `DATABASE_URL` (or SQLite path config)

Optional:

- `LOG_LEVEL`
- `SYNC_INTERVAL_SECONDS`
- `MAX_ATTACHMENT_MB`

## 6.3 Volumes

- `/data` (SQLite profile)
- `/data/attachments`
- DB volume managed by Postgres service (Postgres profile)

## 6.4 Compose + Traefik Contract

- Raven Compose definitions must be compatible with a shared Traefik reverse-proxy network.
- The Raven service name should be `raven`.
- Raven must attach to external network `traefik` when deployed behind Traefik.
- Router/service labels must define:
  - host rule,
  - secure entrypoint,
  - TLS certresolver,
  - backend service port/scheme.

### 6.4.1 Reference Label Pattern

```yaml
services:
  raven:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.raven.rule=Host(`mail.internal.adais.co.uk`)"
      - "traefik.http.routers.raven.entrypoints=websecure"
      - "traefik.http.routers.raven.tls.certresolver=cloudflare"
      - "traefik.http.routers.raven.service=raven-web"
      - "traefik.http.services.raven-web.loadbalancer.server.port=3000"
      - "traefik.http.services.raven-web.loadbalancer.server.scheme=http"
    networks:
      - traefik

networks:
  traefik:
    external: true
```

---

## 7. Acceptance Criteria (MVP)

1. User can add 3+ mailbox accounts and see a unified inbox.
2. New incoming messages appear via incremental sync within target latency.
3. User can compose and send email from selected identity.
4. Restarting containers preserves user/account/message state.
5. Failed sync/send states are visible in ops UI.
6. Backup and restore process is documented and reproducible.

## 8. Forward-Looking Identity Requirements (Post-MVP)

- Add OIDC login capability compatible with common self-hosted IdPs, including Authelia and Authentik.
- Support mixed auth modes where local auth can be disabled once OIDC is fully configured.
- Map OIDC identities to Raven user records with deterministic linking and safe account provisioning controls.

## 9. Forward-Looking UX Requirements (Post-MVP)

- Add PWA support for desktop and mobile installation paths.
- Add mobile-device adaptive rendering with responsive navigation, message list/detail ergonomics, and touch-optimized controls.
- Ensure PWA/mobile behavior is explicitly covered in frontend test plans (including viewport/device-profile coverage).

## 10. Open Decisions and Assumptions

- **Auth mode default:** local auth remains the default until OIDC is explicitly configured and validated.
- **Mailbox sharing:** mailbox accounts are user-private; cross-user mailbox sharing is deferred.
- **PWA cache policy:** service-worker caching strategy for sensitive message data must be finalized before PWA release.
- **Compose hostnames:** production hostnames are deployment-specific and supplied by environment/deployment templates.
