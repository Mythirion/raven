import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { getRequestContext } from '../../utils/request-context'
import { listRecentAuditEvents } from '../../repositories/audit.repository'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const events = await listRecentAuditEvents(100)
    return successResponse({ events }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
