import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { getRequestContext } from '../../utils/request-context'
import { requireUserId } from '../../utils/require-user'
import { getUserMessageDetail } from '../../services/messages/messages.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const userId = requireUserId(event)
    const messageId = getRouterParam(event, 'id')
    const message = await getUserMessageDetail(userId, String(messageId || ''))

    return successResponse({ message }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
