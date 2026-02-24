import { DomainError } from '../../utils/domain-error'
import { createUser, findUserByEmail } from '../../repositories/users.repository'

function hashPassword(password: string): Promise<string> {
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(password))
    .then((buffer) => Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, '0')).join(''))
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
  const candidateHash = await hashPassword(normalizedPassword)

  if (!existing) {
    const created = await createUser({
      email: normalizedEmail,
      passwordHash: candidateHash,
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

  if (existing.passwordHash !== candidateHash) {
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
