# Docs Agent Guidance

This file defines how personas should operate when editing files in `docs/`.

## Scope

Applies to documentation in this directory, including:

- `STEERING.md`
- `SPECIFICATION.md`
- future runbooks, plans, and ADRs

## Documentation Standards

- Keep wording implementation-ready and unambiguous.
- Use RFC-style language where helpful (must/should/may).
- Keep constraints aligned with project stack: Nuxt 4, TypeScript, Vite, Tailwind, Docker.
- Ensure naming consistency: the application is **Raven**.
- Never include plaintext secrets, sample real credentials, or hardcoded sensitive tokens.

## Persona Focus in docs/

### @dave (primary owner)
- Owns structure, clarity, and consistency of product and technical docs.

### @tommy
- Adds test strategy sections, acceptance criteria, and validation checklists.

### @stephen
- Adds/maintains security sections and threat/risk notes.

### @freddie
- Reviews frontend UX/performance/accessibility guidance in specs.

### @brian
- Reviews backend/API/service contracts and operational reliability guidance.
