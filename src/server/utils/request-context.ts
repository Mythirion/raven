import { SESSION_COOKIE_NAME, resolveSessionUserId } from '../services/auth/session.service'
import { readCookie } from './cookies'

export interface RequestContext {
  requestId: string
  userId: string | null
}

interface HeaderReadableEvent {
  node?: {
    req?: {
      headers?: Record<string, string | string[] | undefined>
      socket?: {
        remoteAddress?: string
      }
    }
  }
}

function trustProxyHeaders(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const raw = String(env?.TRUST_PROXY_HEADERS || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function resolveRequestId(event: HeaderReadableEvent): string {
  const headerValue = event.node?.req?.headers?.['x-request-id']
  const requestId = Array.isArray(headerValue) ? headerValue[0] : headerValue
  return requestId || crypto.randomUUID()
}

export function getClientIp(event: HeaderReadableEvent): string {
  if (trustProxyHeaders()) {
    const forwardedFor = event.node?.req?.headers?.['x-forwarded-for']
    const forwardedRaw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor
    const firstForwarded = String(forwardedRaw || '').split(',')[0]?.trim()
    if (firstForwarded) {
      return firstForwarded
    }
  }

  return String(event.node?.req?.socket?.remoteAddress || 'unknown')
}

export function getRequestContext(event: HeaderReadableEvent): RequestContext {
  const token = readCookie(event, SESSION_COOKIE_NAME)

  return {
    requestId: resolveRequestId(event),
    userId: resolveSessionUserId(token),
  }
}
