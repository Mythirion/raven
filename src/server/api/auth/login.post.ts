import { errorResponse, successResponse } from '../../utils/api-response'
import { normalizeError } from '../../utils/domain-error'
import { logger } from '../../utils/logger'
import { loginWithPassword } from '../../services/auth/auth.service'
import { createSession, getSessionTtlSeconds, SESSION_COOKIE_NAME } from '../../services/auth/session.service'
import { appendSetCookie, makeCookie } from '../../utils/cookies'
import { createCsrfToken, CSRF_COOKIE_NAME } from '../../utils/security'
import { getRequestContext } from '../../utils/request-context'
import { recordAuditEvent } from '../../services/audit/audit.service'

interface LoginBody {
  email?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const context = getRequestContext(event)

  try {
    const body = await readBody<LoginBody>(event)
    const login = await loginWithPassword(body?.email || '', body?.password || '')
    const sessionToken = createSession(login.user.id)
    const csrfToken = createCsrfToken()
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    const secureCookies = env?.NODE_ENV === 'production'

    appendSetCookie(event, makeCookie(SESSION_COOKIE_NAME, sessionToken, {
      maxAgeSeconds: getSessionTtlSeconds(),
      sameSite: 'Lax',
      secure: secureCookies,
      httpOnly: true,
      path: '/',
    }))

    appendSetCookie(event, makeCookie(CSRF_COOKIE_NAME, csrfToken, {
      maxAgeSeconds: getSessionTtlSeconds(),
      sameSite: 'Lax',
      secure: secureCookies,
      httpOnly: false,
      path: '/',
    }))

    logger.info('Login succeeded', {
      requestId: context.requestId,
      userId: login.user.id,
      bootstrap: login.isBootstrapUser,
    })

    await recordAuditEvent({
      userId: login.user.id,
      eventType: 'auth.login.success',
      resourceType: 'user',
      resourceId: login.user.id,
      metadata: {
        requestId: context.requestId,
        bootstrap: login.isBootstrapUser,
      },
    })

    return successResponse({
      user: login.user,
      csrfToken,
      isBootstrapUser: login.isBootstrapUser,
    }, {
      requestId: context.requestId,
    })
  }
  catch (error) {
    const normalized = normalizeError(error)
    logger.warn('Login failed', {
      requestId: context.requestId,
      code: normalized.code,
    })

    await recordAuditEvent({
      userId: null,
      eventType: 'auth.login.failure',
      resourceType: 'user',
      metadata: {
        requestId: context.requestId,
        code: normalized.code,
      },
    })

    setResponseStatus(event, normalized.statusCode)
    return errorResponse(normalized.code, normalized.message)
  }
})
