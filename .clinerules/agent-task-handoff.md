## Brief overview
- Project-specific collaboration guideline for delegating work to specialist `@agent` personas.
- When the user asks to involve an `@agent`, treat it as a request to run a delegated subtask and return the agent’s output.

## Agent delegation workflow
- On requests like “ask `@agent` …”, create a distinct task for the named agent instead of answering directly as that agent.
- Include concise context in the delegated task:
  - user’s immediate request,
  - current project status/progress,
  - relevant constraints from repo guidance (for example, `AGENTS.md`, `docs/STEERING.md`, `docs/SPECIFICATION.md`) when applicable.
- Ask the agent to produce actionable output (findings, recommendations, or implementation notes) aligned to their role.

## Response format back to the user
- After delegation completes, report back clearly with:
  - what was sent to the agent (briefly),
  - what the agent returned,
  - any proposed next steps.
- Keep the handoff summary concise and practical; avoid unnecessary transcript-style detail.

## Trigger cases
- Trigger this workflow whenever the user explicitly references an agent using `@name` (for example: `@dave`, `@tommy`, `@stephen`, `@freddie`, `@brian`).
- If no agent is specified, ask which agent to use before delegating.