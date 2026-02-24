import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { getRequestContext } from '../../utils/request-context'
import { requireUserId } from '../../utils/require-user'
import { createUserAccount, type AccountInput } from '../../services/accounts/accounts.service'
import { ensureCsrf } from '../../utils/security'
import { recordAuditEvent } from '../../services/audit/audit.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const userId = requireUserId(event)
    ensureCsrf(event)
    const body = await readBody<AccountInput>(event)
    const account = await createUserAccount(userId, body)

    await recordAuditEvent({
      userId,
      eventType: 'accounts.create.success',
      resourceType: 'mailbox_account',
      resourceId: account.id,
      metadata: {
        requestId: context.requestId,
      },
    })

    return successResponse({ account }, { requestId: context.requestId })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
