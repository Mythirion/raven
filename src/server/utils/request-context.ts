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
    }
  }
}

function resolveRequestId(event: HeaderReadableEvent): string {
  const headerValue = event.node?.req?.headers?.['x-request-id']
  const requestId = Array.isArray(headerValue) ? headerValue[0] : headerValue
  return requestId || crypto.randomUUID()
}

export function getRequestContext(event: HeaderReadableEvent): RequestContext {
  const token = readCookie(event, SESSION_COOKIE_NAME)

  return {
    requestId: resolveRequestId(event),
    userId: resolveSessionUserId(token),
  }
}
