import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { getRequestContext } from '../../utils/request-context'
import { requireUserId } from '../../utils/require-user'
import { listUserAccounts } from '../../services/accounts/accounts.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const userId = requireUserId(event)
    const accounts = await listUserAccounts(userId)

    return successResponse({ accounts }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
