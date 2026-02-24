import { logger } from '../../utils/logger'
import { createAuditEvent, type AuditEventInput } from '../../repositories/audit.repository'

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await createAuditEvent(input)
  }
  catch (error) {
    logger.warn('Failed to persist audit event', {
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      error: error instanceof Error ? error.message : 'unknown error',
    })
  }
}
