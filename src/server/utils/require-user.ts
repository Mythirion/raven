import { DomainError } from './domain-error'
import { getRequestContext } from './request-context'

export function requireUserId(event: Parameters<typeof getRequestContext>[0]): string {
  const context = getRequestContext(event)
  if (!context.userId) {
    throw new DomainError('AUTH_UNAUTHORIZED', 'Authentication required', 401)
  }

  return context.userId
}
