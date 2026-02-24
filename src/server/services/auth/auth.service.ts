import { DomainError } from '../../utils/domain-error'
import { createUser, findUserByEmail } from '../../repositories/users.repository'

const PASSWORD_HASH_PREFIX = 'pbkdf2'
const PBKDF2_ITERATIONS = 210000
const PBKDF2_KEYLEN = 32

function bytesToHex(bytes: Uint8Array): string {
  let output = ''
  for (let i = 0; i < bytes.length; i += 1) {
    output += bytes[i].toString(16).padStart(2, '0')
  }

  return output
}

function base64ToBytes(value: string): Uint8Array {
  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= (a.charCodeAt(i) ^ b.charCodeAt(i))
  }

  return mismatch === 0
}

function randomSaltBase64(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
}

async function sha256Hex(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return bytesToHex(new Uint8Array(digest))
}

async function pbkdf2Hex(password: string, saltBase64: string): Promise<string> {
  const salt = base64ToBytes(saltBase64)
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations: PBKDF2_ITERATIONS,
  }, keyMaterial, PBKDF2_KEYLEN * 8)

  return bytesToHex(new Uint8Array(bits))
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomSaltBase64()
  const hash = await pbkdf2Hex(password, salt)
  return `${PASSWORD_HASH_PREFIX}$${PBKDF2_ITERATIONS}$${salt}$${hash}`
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.indexOf(`${PASSWORD_HASH_PREFIX}$`) === 0) {
    const parts = storedHash.split('$')
    if (parts.length !== 4) {
      return false
    }

    const salt = parts[2] || ''
    const expected = parts[3] || ''
    if (!salt || !expected) {
      return false
    }

    const candidate = await pbkdf2Hex(password, salt)
    return constantTimeEqual(candidate, expected)
  }

  const legacy = await sha256Hex(password)
  return constantTimeEqual(legacy, storedHash)
}

export interface LoginResult {
  user: {
    id: string
    email: string
    displayName: string | null
  }
  isBootstrapUser: boolean
}

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedPassword = password.trim()

  if (!normalizedEmail || !normalizedPassword) {
    throw new DomainError('VALIDATION_ERROR', 'Email and password are required', 400)
  }

  const existing = await findUserByEmail(normalizedEmail)

  if (!existing) {
    const passwordHash = await hashPassword(normalizedPassword)
    const created = await createUser({
      email: normalizedEmail,
      passwordHash,
      displayName: normalizedEmail.split('@')[0] || null,
    })

    return {
      user: {
        id: created.id,
        email: created.email,
        displayName: created.displayName,
      },
      isBootstrapUser: true,
    }
  }

  const valid = await verifyPassword(normalizedPassword, existing.passwordHash)
  if (!valid) {
    throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401)
  }

  return {
    user: {
      id: existing.id,
      email: existing.email,
      displayName: existing.displayName,
    },
    isBootstrapUser: false,
  }
}
