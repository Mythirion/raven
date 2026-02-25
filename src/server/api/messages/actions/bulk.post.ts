import { errorResponse, successResponse } from '../../../utils/api-response'
import { normalizeError } from '../../../utils/domain-error'
import { getRequestContext } from '../../../utils/request-context'
import { requireUserId } from '../../../utils/require-user'
import { ensureCsrf } from '../../../utils/security'
import {
  normalizeBulkMessageActionCommand,
  runBulkMessageAction,
} from '../../../services/messages/messages.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const userId = requireUserId(event)
    ensureCsrf(event)

    const body = await readBody<Record<string, unknown>>(event)
    const command = normalizeBulkMessageActionCommand(body || {})
    const result = await runBulkMessageAction(userId, command, context.requestId)

    return successResponse({ result }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
