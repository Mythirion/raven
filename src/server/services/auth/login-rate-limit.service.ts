import { DomainError } from '../../utils/domain-error'

interface ScopeState {
  attempts: number[]
  blockedUntil: number
}

const scopeState: Record<string, ScopeState | undefined> = {}

function parseNumberEnv(name: string, fallback: number): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const parsed = Number(env?.[name] || '')
  if (!isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function getWindowMs(): number {
  return parseNumberEnv('AUTH_RATE_LIMIT_WINDOW_SECONDS', 300) * 1000
}

function getMaxAttempts(): number {
  return parseNumberEnv('AUTH_RATE_LIMIT_MAX_ATTEMPTS', 5)
}

function getBlockMs(): number {
  return parseNumberEnv('AUTH_RATE_LIMIT_BLOCK_SECONDS', 600) * 1000
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

function getScope(key: string): ScopeState {
  const existing = scopeState[key]
  if (existing) {
    return existing
  }

  const created: ScopeState = {
    attempts: [],
    blockedUntil: 0,
  }
  scopeState[key] = created
  return created
}

function pruneAttempts(state: ScopeState, now: number, windowMs: number): void {
  const threshold = now - windowMs
  state.attempts = state.attempts.filter((ts) => ts >= threshold)
}

function assertScopeAllowed(key: string, now: number): void {
  const state = getScope(key)
  const windowMs = getWindowMs()
  pruneAttempts(state, now, windowMs)

  if (state.blockedUntil > now) {
    throw new DomainError('AUTH_RATE_LIMITED', 'Too many login attempts. Try again later.', 429)
  }
}

function recordScopeFailure(key: string, now: number): void {
  const state = getScope(key)
  const windowMs = getWindowMs()
  const maxAttempts = getMaxAttempts()
  const blockMs = getBlockMs()

  pruneAttempts(state, now, windowMs)
  state.attempts.push(now)

  if (state.attempts.length >= maxAttempts) {
    state.blockedUntil = now + blockMs
    state.attempts = []
  }
}

function clearScope(key: string): void {
  delete scopeState[key]
}

function ipScopeKey(ip: string): string {
  return `ip:${ip || 'unknown'}`
}

function accountScopeKey(email: string): string {
  return `acct:${normalizeEmail(email) || 'unknown'}`
}

export function assertLoginAllowed(ipAddress: string, email: string): void {
  const now = Date.now()
  assertScopeAllowed(ipScopeKey(ipAddress), now)
  assertScopeAllowed(accountScopeKey(email), now)
}

export function registerLoginFailure(ipAddress: string, email: string): void {
  const now = Date.now()
  recordScopeFailure(ipScopeKey(ipAddress), now)
  recordScopeFailure(accountScopeKey(email), now)
}

export function registerLoginSuccess(ipAddress: string, email: string): void {
  clearScope(ipScopeKey(ipAddress))
  clearScope(accountScopeKey(email))
}
