import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { getRequestContext } from '../../utils/request-context'
import { requireUserId } from '../../utils/require-user'
import { ensureSyncSchedulerInitialized, getSyncStatusForUser } from '../../services/sync/sync.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    ensureSyncSchedulerInitialized()
    const userId = requireUserId(event)
    const sync = await getSyncStatusForUser(userId)

    return successResponse({ sync }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
