import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { logger } from '../../utils/logger'
import { getRequestContext } from '../../utils/request-context'
import { getHealthStatus } from '../../services/health/health.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const health = await getHealthStatus()
    logger.info('Health check executed', {
      requestId: context.requestId,
      status: health.status,
      dbEngine: health.checks.database.engine,
    })

    const payload = context.userId
      ? health
      : {
          service: health.service,
          status: health.status,
          timestamp: health.timestamp,
          checks: {
            api: { ok: health.checks.api.ok },
            database: { ok: health.checks.database.ok },
          },
        }

    return successResponse(payload, {
      requestId: context.requestId,
    })
  }
  catch (error) {
    const normalized = normalizeError(error)
    logger.error('Health check failed', {
      requestId: context.requestId,
      code: normalized.code,
      message: normalized.message,
    })

    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message, normalized.details)
  }
})
