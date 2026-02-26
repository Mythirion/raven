import { createHmac, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const revokedAfterByUserId: Record<string, number | undefined> = {}

export const SESSION_COOKIE_NAME = 'raven_session'

interface SessionPayload {
  userId: string
  expiresAt: number
  issuedAt: number
  nonce: string
}

function getSessionSecret(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const raw = String(env?.SESSION_SECRET || '').trim()
  if (!raw) {
    throw new Error('SESSION_SECRET is required')
  }

  return raw
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function signPayload(payloadB64: string): string {
  return createHmac('sha256', getSessionSecret()).update(payloadB64).digest('base64url')
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS
}

export function createSession(userId: string): string {
  const now = Date.now()
  const payload: SessionPayload = {
    userId,
    expiresAt: now + (SESSION_TTL_SECONDS * 1000),
    issuedAt: now,
    nonce: crypto.randomUUID(),
  }

  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signature = signPayload(payloadB64)
  return `${payloadB64}.${signature}`
}

export function resolveSessionUserId(token: string | null | undefined): string | null {
  if (!token) {
    return null
  }

  const [payloadB64, signature] = String(token).split('.')
  if (!payloadB64 || !signature) {
    return null
  }

  const expected = signPayload(payloadB64)
  if (!constantTimeEqual(signature, expected)) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as Partial<SessionPayload>
    const userId = String(payload.userId || '').trim()
    const expiresAt = Number(payload.expiresAt || 0)
    const issuedAt = Number(payload.issuedAt || 0)
    if (!userId || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      return null
    }

    const revokedAfter = revokedAfterByUserId[userId] || 0
    if (!Number.isFinite(issuedAt) || issuedAt <= revokedAfter) {
      return null
    }

    return userId
  }
  catch {
    return null
  }
}

export function destroySession(token: string | null | undefined): void {
  if (!token) {
    return
  }

  const [payloadB64, signature] = String(token).split('.')
  if (!payloadB64 || !signature) {
    return
  }

  const expected = signPayload(payloadB64)
  if (!constantTimeEqual(signature, expected)) {
    return
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as Partial<SessionPayload>
    const userId = String(payload.userId || '').trim()
    const issuedAt = Number(payload.issuedAt || 0)
    if (!userId || !Number.isFinite(issuedAt)) {
      return
    }

    const existing = revokedAfterByUserId[userId] || 0
    revokedAfterByUserId[userId] = Math.max(existing, issuedAt, Date.now())
  }
  catch {
    // Ignore malformed payloads during best-effort revocation.
  }
}
