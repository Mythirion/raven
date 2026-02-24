import { DomainError } from '../../utils/domain-error'
import {
  createAccountForUser,
  deleteAccountForUser,
  findAccountByIdForUser,
  listAccountsForUser,
  type AccountPatchInput,
  type AccountMutationInput,
  updateAccountForUser,
} from '../../repositories/accounts.repository'
import { encryptSecret } from '../../utils/security'

export interface PublicAccountRecord {
  id: string
  userId: string
  providerLabel: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountInput {
  providerLabel: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
  secret: string
}

function toPublicAccount(account: {
  id: string
  userId: string
  providerLabel: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
  createdAt: string
  updatedAt: string
}): PublicAccountRecord {
  return {
    id: account.id,
    userId: account.userId,
    providerLabel: account.providerLabel,
    emailAddress: account.emailAddress,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapTls: account.imapTls,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpTls: account.smtpTls,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  const normalized = String(value || '').trim()
  if (!normalized) {
    throw new DomainError('VALIDATION_ERROR', `${fieldName} is required`, 400)
  }

  return normalized
}

function normalizePort(value: unknown, fieldName: string): number {
  const port = Number(value)
  if ((port % 1) !== 0 || port < 1 || port > 65535) {
    throw new DomainError('VALIDATION_ERROR', `${fieldName} must be a valid port`, 400)
  }

  return port
}

function normalizeTls(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 'true' || value === '1' || value === 1) {
    return true
  }

  if (value === 'false' || value === '0' || value === 0) {
    return false
  }

  return true
}

export async function listUserAccounts(userId: string) {
  const accounts = await listAccountsForUser(userId)
  return accounts.map((account) => toPublicAccount(account))
}

export async function createUserAccount(userId: string, input: AccountInput) {
  const normalized: AccountMutationInput = {
    providerLabel: normalizeRequiredString(input.providerLabel, 'providerLabel'),
    emailAddress: normalizeRequiredString(input.emailAddress, 'emailAddress').toLowerCase(),
    imapHost: normalizeRequiredString(input.imapHost, 'imapHost'),
    imapPort: normalizePort(input.imapPort, 'imapPort'),
    imapTls: normalizeTls(input.imapTls),
    smtpHost: normalizeRequiredString(input.smtpHost, 'smtpHost'),
    smtpPort: normalizePort(input.smtpPort, 'smtpPort'),
    smtpTls: normalizeTls(input.smtpTls),
    encryptedSecret: await encryptSecret(normalizeRequiredString(input.secret, 'secret')),
  }

  const account = await createAccountForUser(userId, normalized)
  return toPublicAccount(account)
}

export async function patchUserAccount(userId: string, accountId: string, input: Partial<AccountInput>) {
  const patch: AccountPatchInput = {}

  if (input.providerLabel !== undefined) {
    patch.providerLabel = normalizeRequiredString(input.providerLabel, 'providerLabel')
  }
  if (input.emailAddress !== undefined) {
    patch.emailAddress = normalizeRequiredString(input.emailAddress, 'emailAddress').toLowerCase()
  }
  if (input.imapHost !== undefined) {
    patch.imapHost = normalizeRequiredString(input.imapHost, 'imapHost')
  }
  if (input.imapPort !== undefined) {
    patch.imapPort = normalizePort(input.imapPort, 'imapPort')
  }
  if (input.imapTls !== undefined) {
    patch.imapTls = normalizeTls(input.imapTls)
  }
  if (input.smtpHost !== undefined) {
    patch.smtpHost = normalizeRequiredString(input.smtpHost, 'smtpHost')
  }
  if (input.smtpPort !== undefined) {
    patch.smtpPort = normalizePort(input.smtpPort, 'smtpPort')
  }
  if (input.smtpTls !== undefined) {
    patch.smtpTls = normalizeTls(input.smtpTls)
  }
  if (input.secret !== undefined) {
    patch.encryptedSecret = await encryptSecret(normalizeRequiredString(input.secret, 'secret'))
  }

  const updated = await updateAccountForUser(accountId, userId, patch)
  if (!updated) {
    throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found', 404)
  }

  return toPublicAccount(updated)
}

export async function removeUserAccount(userId: string, accountId: string) {
  const deleted = await deleteAccountForUser(accountId, userId)
  if (!deleted) {
    throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found', 404)
  }
}

export async function testUserAccountConnection(userId: string, accountId: string) {
  const account = await findAccountByIdForUser(accountId, userId)
  if (!account) {
    throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found', 404)
  }

  return {
    accountId: account.id,
    ok: true,
    checks: {
      imap: { ok: true, host: account.imapHost, port: account.imapPort },
      smtp: { ok: true, host: account.smtpHost, port: account.smtpPort },
    },
    note: 'Connectivity test stub passed (provider adapter wiring lands in Phase 2).',
  }
}
