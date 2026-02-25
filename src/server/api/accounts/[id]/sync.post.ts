import { errorResponse, successResponse } from '../../../utils/api-response'
import { normalizeError } from '../../../utils/domain-error'
import { getRequestContext } from '../../../utils/request-context'
import { requireUserId } from '../../../utils/require-user'
import { ensureCsrf } from '../../../utils/security'
import { runSyncForUserAccount } from '../../../services/sync/sync.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const userId = requireUserId(event)
    ensureCsrf(event)

    const accountId = getRouterParam(event, 'id')
    if (!accountId) {
      throw new Error('Account id is required')
    }

    const summary = await runSyncForUserAccount(userId, accountId)
    return successResponse({ summary }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
