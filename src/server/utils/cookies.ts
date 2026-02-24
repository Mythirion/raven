interface HeaderReadableEvent {
  node?: {
    req?: {
      headers?: Record<string, string | string[] | undefined>
    }
    res?: {
      getHeader?: (name: string) => number | string | string[] | undefined
      setHeader?: (name: string, value: number | string | readonly string[]) => void
    }
  }
}

export function readCookie(event: HeaderReadableEvent, name: string): string | null {
  const raw = event.node?.req?.headers?.cookie
  const cookieHeader = Array.isArray(raw) ? raw.join(';') : (raw || '')

  if (!cookieHeader) {
    return null
  }

  const target = `${name}=`
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length))
    }
  }

  return null
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

export function appendSetCookie(event: HeaderReadableEvent, cookieValue: string): void {
  const getHeader = event.node?.res?.getHeader
  const setHeader = event.node?.res?.setHeader

  if (!setHeader) {
    return
  }

  const existing = getHeader?.call(event.node?.res, 'Set-Cookie')
  if (!existing) {
    setHeader.call(event.node?.res, 'Set-Cookie', [cookieValue])
    return
  }

  if (Array.isArray(existing)) {
    setHeader.call(event.node?.res, 'Set-Cookie', [...existing, cookieValue])
    return
  }

  setHeader.call(event.node?.res, 'Set-Cookie', [String(existing), cookieValue])
}
