interface HeaderReadableEvent {
  node?: {
    req?: {
      headers?: Record<string, string | string[] | undefined>
      connection?: {
        encrypted?: boolean
      }
      socket?: {
        encrypted?: boolean
      }
    }
    res?: {
      getHeader?: (name: string) => number | string | string[] | undefined
      setHeader?: (name: string, value: number | string | readonly string[]) => void
    }
  }
}

function asHeaderReadableEvent(event: unknown): HeaderReadableEvent {
  return (event || {}) as HeaderReadableEvent
}

function parseBooleanEnv(raw: string | undefined): boolean | null {
  const normalized = String(raw || '').trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }

  return null
}

function trustProxyHeaders(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const parsed = parseBooleanEnv(env?.TRUST_PROXY_HEADERS)
  return parsed === true
}

export function isSecureRequest(event: unknown): boolean {
  const readable = asHeaderReadableEvent(event)

  if (trustProxyHeaders()) {
    const forwardedProto = readable.node?.req?.headers?.['x-forwarded-proto']
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
    if (proto) {
      return proto.split(',')[0]?.trim().toLowerCase() === 'https'
    }
  }

  if (readable.node?.req?.socket?.encrypted || readable.node?.req?.connection?.encrypted) {
    return true
  }

  return false
}

export function readCookie(event: unknown, name: string): string | null {
  const readable = asHeaderReadableEvent(event)
  const raw = readable.node?.req?.headers?.cookie
  const cookieHeader = Array.isArray(raw) ? raw.join(';') : (raw || '')

  if (!cookieHeader) {
    return null
  }

  const target = `${name}=`
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.indexOf(target) === 0) {
      return decodeURIComponent(trimmed.slice(target.length))
    }
  }

  return null
}

export function shouldUseSecureCookies(event: unknown): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const explicit = parseBooleanEnv(env?.COOKIE_SECURE)
  if (explicit !== null) {
    return explicit
  }

  if (isSecureRequest(event)) {
    return true
  }

  return String(env?.APP_BASE_URL || '').trim().toLowerCase().startsWith('https://')
}

export function makeCookie(name: string, value: string, options?: {
  maxAgeSeconds?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
  path?: string
}): string {
  const attrs: string[] = [`${name}=${encodeURIComponent(value)}`]
  attrs.push(`Path=${options?.path || '/'}`)
  attrs.push(`SameSite=${options?.sameSite || 'Lax'}`)

  if (options?.httpOnly !== false) {
    attrs.push('HttpOnly')
  }

  if (options?.secure) {
    attrs.push('Secure')
  }

  if (typeof options?.maxAgeSeconds === 'number') {
    attrs.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`)
  }

  return attrs.join('; ')
}

export function appendSetCookie(event: unknown, cookieValue: string): void {
  const readable = asHeaderReadableEvent(event)
  const getHeader = readable.node?.res?.getHeader
  const setHeader = readable.node?.res?.setHeader

  if (!setHeader) {
    return
  }

  const existing = getHeader?.call(readable.node?.res, 'Set-Cookie')
  if (!existing) {
    setHeader.call(readable.node?.res, 'Set-Cookie', [cookieValue])
    return
  }

  if (Array.isArray(existing)) {
    setHeader.call(readable.node?.res, 'Set-Cookie', [...existing, cookieValue])
    return
  }

  setHeader.call(readable.node?.res, 'Set-Cookie', [String(existing), cookieValue])
}
