import { errorResponse, successResponse } from '../../../utils/api-response'
import { normalizeError } from '../../../utils/domain-error'
import { getRequestContext } from '../../../utils/request-context'
import { requireUserId } from '../../../utils/require-user'
import { testUserAccountConnection } from '../../../services/accounts/accounts.service'
import { ensureCsrf } from '../../../utils/security'
import { recordAuditEvent } from '../../../services/audit/audit.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const userId = requireUserId(event)
    ensureCsrf(event)
    const accountId = getRouterParam(event, 'id')
    if (!accountId) {
      throw new Error('Account id is required')
    }

    const result = await testUserAccountConnection(userId, accountId)

    await recordAuditEvent({
      userId,
      eventType: 'accounts.test.success',
      resourceType: 'mailbox_account',
      resourceId: accountId,
      metadata: {
        requestId: context.requestId,
      },
    })

    return successResponse(result, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
