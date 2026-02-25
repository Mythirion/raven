import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { getRequestContext } from '../../utils/request-context'
import { findUserById } from '../../repositories/users.repository'
import { readCookie } from '../../utils/cookies'
import { CSRF_COOKIE_NAME } from '../../utils/security'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    if (!context.userId) {
      return successResponse({ user: null, csrfToken: null }, { requestId: context.requestId })
    }

    const user = await findUserById(context.userId)
    if (!user) {
      return successResponse({ user: null, csrfToken: null }, { requestId: context.requestId })
    }

    const csrfToken = readCookie(event, CSRF_COOKIE_NAME)

    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      csrfToken,
    }, {
      requestId: context.requestId,
    })
  }
  catch (error) {
    const normalized = normalizeError(error)
    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
