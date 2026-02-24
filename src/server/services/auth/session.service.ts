interface SessionRecord {
  userId: string
  expiresAt: number
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const sessionStore = new Map<string, SessionRecord>()

export const SESSION_COOKIE_NAME = 'raven_session'

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS
}

export function createSession(userId: string): string {
  const randomChunk = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  const token = `${crypto.randomUUID()}.${randomChunk}`
  sessionStore.set(token, {
    userId,
    expiresAt: Date.now() + (SESSION_TTL_SECONDS * 1000),
  })
  return token
}

export function resolveSessionUserId(token: string | null | undefined): string | null {
  if (!token) {
    return null
  }

  const session = sessionStore.get(token)
  if (!session) {
    return null
  }

  if (Date.now() >= session.expiresAt) {
    sessionStore.delete(token)
    return null
  }

  return session.userId
}

export function destroySession(token: string | null | undefined): void {
  if (!token) {
    return
  }

  sessionStore.delete(token)
}
