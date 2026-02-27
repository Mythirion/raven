# Raven Steering Document

## Executive Summary

Raven is a **self-hostable, Docker-powered web email client** for managing multiple inboxes in one interface. It is designed for homelab, single-user, and small-team scenarios where control, privacy, and predictable operations matter.

The platform is constrained to:

- **Nuxt 4**
- **TypeScript**
- **Vite**
- **Tailwind CSS**
- **Docker deployment**, with **1 container preferred** and **2 containers acceptable** when using an external DB.

## Vision

Provide a fast, secure, self-hosted email workspace where users can connect multiple IMAP/SMTP inboxes and operate across them seamlessly.

## Product Objectives

1. **Self-hostability first**: simple Docker setup and upgrades.
2. **Reliable core workflows**: connect, sync, read, search, send.
3. **Low-ops architecture**: default single-container runtime.
4. **Security by default**: encrypted credentials, hardened runtime.

## Scope

### In scope (MVP to v1)

- Multi-account mailbox linking (IMAP + SMTP)
- Unified inbox and per-account views
- Message read, move, archive, delete, and compose/send
- Cross-account search
- Background sync with retries and status visibility

### Out of scope (initially)

- Native mobile apps
- Calendar/contact suite
- Enterprise legal/compliance workflows
- EWS-first Exchange-specific capabilities

## Success Metrics

- 3+ inboxes linked and usable concurrently per user
- Mailbox connect success >= 95% for common providers
- New-mail visibility median < 10s (IDLE-capable providers)
- Send first-attempt success >= 99% (excluding remote rejects)
- Warm startup health < 10s

## Constraints & Guardrails

### Technical constraints

- Nuxt 4 full-stack app (UI + server routes)
- TypeScript everywhere
- Tailwind-based UI styling system
- Dockerized runtime and reproducible local/prod behavior
- Typechecking validation must run in the Docker runtime (containerized execution), not as a host-only prerequisite

### Operational constraints

- Persistent state must use mounted volumes
- Backup/restore workflow must be documented
- Runtime should be resource-efficient for small servers
- Docker Compose must support Traefik reverse-proxy integration via labels and external `traefik` network
- Standard validation command for type safety should be documented as `docker compose exec -T raven npm run typecheck`
- After completing implementation work, the environment should be rebuilt and restarted (`docker compose down --remove-orphans && docker compose up -d --build`) before final verification
- Final verification should include a basic smoke + regression pass executed in-container prior to handoff

## Architecture Direction

### Profile A (default): single container

- One `raven` container running Nuxt/Nitro
- Includes UI, API, and in-process scheduler/worker loop
- SQLite file storage in mounted volume

Best for simplicity and low operational overhead.

### Profile B (optional): two containers

- `raven` + `postgres`
- Same app behavior, stronger DB characteristics at scale

## Key Risks and Mitigations

- **IMAP provider differences** -> adapter abstraction + compatibility tests
- **Sync drift** -> cursor-based sync + reconciliation jobs
- **Credential leakage** -> envelope encryption + key rotation procedure
- **Mailbox growth pressure** -> retention controls + pagination/lazy loading

## Initial ADR Set

1. Use Nuxt 4 full-stack architecture for cohesion and speed.
2. Keep default runtime single-container.
3. Make external DB optional via deployment profile.
4. Defer extra queue infrastructure in MVP.

## Release Philosophy

Ship a stable, secure, operationally simple MVP before expanding breadth. Every feature must preserve deployability and observability.

## Hosting Compatibility Requirement

Testing and production deployment docs must include a Traefik-compatible Compose pattern (router/service labels, TLS certresolver settings, and external `traefik` network attachment), aligned with internal infrastructure conventions.
