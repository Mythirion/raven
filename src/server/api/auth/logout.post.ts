import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { logger } from '../../utils/logger'
import { getRequestContext } from '../../utils/request-context'
import { appendSetCookie, makeCookie, readCookie, shouldUseSecureCookies } from '../../utils/cookies'
import { destroySession, SESSION_COOKIE_NAME } from '../../services/auth/session.service'
import { CSRF_COOKIE_NAME } from '../../utils/security'
import { recordAuditEvent } from '../../services/audit/audit.service'

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)
  const secureCookies = shouldUseSecureCookies(event)

  try {
    const token = readCookie(event, SESSION_COOKIE_NAME)
    destroySession(token)

    appendSetCookie(event, makeCookie(SESSION_COOKIE_NAME, '', {
      maxAgeSeconds: 0,
      sameSite: 'Lax',
      secure: secureCookies,
      httpOnly: true,
      path: '/',
    }))

    appendSetCookie(event, makeCookie(CSRF_COOKIE_NAME, '', {
      maxAgeSeconds: 0,
      sameSite: 'Lax',
      secure: secureCookies,
      httpOnly: false,
      path: '/',
    }))

    logger.info('Logout succeeded', {
      requestId: context.requestId,
      userId: context.userId,
    })

    await recordAuditEvent({
      userId: context.userId,
      eventType: 'auth.logout.success',
      resourceType: 'user',
      resourceId: context.userId,
      metadata: {
        requestId: context.requestId,
      },
    })

    return successResponse({
      loggedOut: true,
    }, {
      requestId: context.requestId,
    })
  }
  catch (error) {
    const normalized = normalizeError(error)
    logger.warn('Logout failed', {
      requestId: context.requestId,
      code: normalized.code,
    })

    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
