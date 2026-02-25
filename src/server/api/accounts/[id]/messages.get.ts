import { errorResponse, successResponse } from '../../../utils/api-response'
import { normalizeError } from '../../../utils/domain-error'
import { getRequestContext } from '../../../utils/request-context'
import { requireUserId } from '../../../utils/require-user'
import { listRecentMessagesForUserAccount } from '../../../services/sync/sync.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const userId = requireUserId(event)
    const accountId = getRouterParam(event, 'id')
    if (!accountId) {
      throw new Error('Account id is required')
    }

    const limitQuery = getQuery(event).limit
    const limit = Number(Array.isArray(limitQuery) ? limitQuery[0] : limitQuery)
    const messages = await listRecentMessagesForUserAccount(userId, accountId, Number.isFinite(limit) ? limit : 20)

    return successResponse({ messages }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
