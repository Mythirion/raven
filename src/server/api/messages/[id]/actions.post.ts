import { errorResponse, successResponse } from '../../../utils/api-response'
import { normalizeError } from '../../../utils/domain-error'
import { getRequestContext } from '../../../utils/request-context'
import { requireUserId } from '../../../utils/require-user'
import { ensureCsrf } from '../../../utils/security'
import {
  normalizeMessageActionCommand,
  runSingleMessageAction,
} from '../../../services/messages/messages.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const userId = requireUserId(event)
    ensureCsrf(event)

    const messageId = getRouterParam(event, 'id')
    const body = await readBody<Record<string, unknown>>(event)
    const command = normalizeMessageActionCommand(body || {})
    const result = await runSingleMessageAction(userId, String(messageId || ''), command, context.requestId)

    return successResponse({ result }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
