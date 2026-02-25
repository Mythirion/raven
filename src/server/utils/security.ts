import { DomainError } from './domain-error'
import { readCookie } from './cookies'

export const CSRF_COOKIE_NAME = 'raven_csrf'

function getKeyMaterial(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const key = (env?.APP_ENCRYPTION_KEY || '').trim()
  if (!key) {
    throw new DomainError('ENCRYPTION_KEY_MISSING', 'APP_ENCRYPTION_KEY is required for credential encryption', 500)
  }

  return key
}

async function deriveEncryptionKey(usages: Array<'encrypt' | 'decrypt'>): Promise<CryptoKey> {
  const material = new TextEncoder().encode(getKeyMaterial())
  const digest = await crypto.subtle.digest('SHA-256', material as BufferSource)
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usages)
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await deriveEncryptionKey(['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource,
  )

  let ivBinary = ''
  for (let i = 0; i < iv.length; i += 1) {
    ivBinary += String.fromCharCode(iv[i] ?? 0)
  }

  const payloadBytes = new Uint8Array(encrypted)
  let payloadBinary = ''
  for (let i = 0; i < payloadBytes.length; i += 1) {
    payloadBinary += String.fromCharCode(payloadBytes[i] ?? 0)
  }

  return `${btoa(ivBinary)}:${btoa(payloadBinary)}`
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  const parts = String(ciphertext || '').split(':')
  if (parts.length !== 2) {
    throw new DomainError('DECRYPTION_FAILED', 'Encrypted secret has invalid format', 500)
  }

  const ivDecoded = atob(parts[0] || '')
  const payloadDecoded = atob(parts[1] || '')
  const iv = new Uint8Array(ivDecoded.length)
  const payload = new Uint8Array(payloadDecoded.length)
  for (let i = 0; i < ivDecoded.length; i += 1) {
    iv[i] = ivDecoded.charCodeAt(i)
  }
  for (let i = 0; i < payloadDecoded.length; i += 1) {
    payload[i] = payloadDecoded.charCodeAt(i)
  }

  const key = await deriveEncryptionKey(['decrypt'])

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      payload as BufferSource,
    )
    return new TextDecoder().decode(new Uint8Array(decrypted))
  }
  catch {
    throw new DomainError('DECRYPTION_FAILED', 'Could not decrypt encrypted secret', 500)
  }
}

interface CsrfReadableEvent {
  node?: {
    req?: {
      headers?: Record<string, string | string[] | undefined>
    }
  }
}

export function createCsrfToken(): string {
  return crypto.randomUUID()
}

export function ensureCsrf(event: CsrfReadableEvent): void {
  const cookieToken = readCookie(event, CSRF_COOKIE_NAME)
  const headerValue = event.node?.req?.headers?.['x-csrf-token']
  const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new DomainError('CSRF_INVALID', 'Invalid CSRF token', 403)
  }
}
