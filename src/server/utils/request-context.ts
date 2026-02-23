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
  // Phase 0 scaffold: user identity placeholder.
  // Phase 1 auth work will replace this with validated session identity.
  return {
    requestId: resolveRequestId(event),
    userId: null,
  }
}
