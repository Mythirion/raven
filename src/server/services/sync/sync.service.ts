import {
  findAccountByIdForUser,
  listAccountsForUser,
  type AccountRecord,
} from '../../repositories/accounts.repository'
import { listUsers } from '../../repositories/users.repository'
import {
  countMessagesForAccount,
  findCursor,
  listRecentMessagesForAccountForUser,
  listCursorsForAccount,
  purgeStubMessagesForAccount,
  type SyncedMessageRecord,
  type FolderRecord,
  upsertCursor,
  upsertFolder,
  upsertMessageWithBody,
} from '../../repositories/sync.repository'
import { recordAuditEvent } from '../audit/audit.service'
import { DomainError } from '../../utils/domain-error'
import { getConfiguredSyncAdapter, getSyncAdapterMode } from './adapters'

type SyncState = 'idle' | 'syncing' | 'retrying' | 'failed'

export interface AccountSyncStatus {
  accountId: string
  providerLabel: string
  emailAddress: string
  state: SyncState
  lastAttemptedAt: string | null
  lastSuccessfulAt: string | null
  retryCount: number
  nextRetryAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  cursorCount: number
  messageCount: number
}

export interface SyncRunSummary {
  accountId: string
  syncedMessages: number
  syncedFolders: number
}

interface RuntimeSyncState {
  state: SyncState
  lastAttemptedAt: string | null
  lastSuccessfulAt: string | null
  retryCount: number
  nextRetryAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
}

const runtimeStateByAccountId = new Map<string, RuntimeSyncState>()
let schedulerInitialized = false
let schedulerTimer: ReturnType<typeof setInterval> | null = null
let schedulerRunning = false

function getSyncIntervalSeconds(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const parsed = Number(env?.SYNC_INTERVAL_SECONDS || '30')
  return Number.isFinite(parsed) ? Math.max(5, Math.floor(parsed)) : 30
}

function getSyncMaxConcurrency(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const parsed = Number(env?.SYNC_MAX_CONCURRENCY || '2')
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 2
}

function getSyncMaxRetries(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const parsed = Number(env?.SYNC_MAX_RETRIES || '3')
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 3
}

function getRuntimeState(accountId: string): RuntimeSyncState {
  const existing = runtimeStateByAccountId.get(accountId)
  if (existing) {
    return existing
  }

  const created: RuntimeSyncState = {
    state: 'idle',
    lastAttemptedAt: null,
    lastSuccessfulAt: null,
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  }
  runtimeStateByAccountId.set(accountId, created)
  return created
}

async function ensureFolders(account: AccountRecord): Promise<FolderRecord[]> {
  const folders: FolderRecord[] = []
  const adapter = getConfiguredSyncAdapter()
  const adapterFolders = await adapter.listFolders(account)
  for (const folder of adapterFolders) {
    folders.push(await upsertFolder(account.id, folder.remoteFolderId, folder.name, folder.role))
  }
  return folders
}

export async function runSyncForAccount(userId: string, account: AccountRecord): Promise<SyncRunSummary> {
  const runtime = getRuntimeState(account.id)
  const attemptedAt = new Date().toISOString()
  runtime.state = 'syncing'
  runtime.lastAttemptedAt = attemptedAt
  runtime.lastErrorCode = null
  runtime.lastErrorMessage = null
  runtime.nextRetryAt = null

  await recordAuditEvent({
    userId,
    eventType: 'sync.run.started',
    resourceType: 'mailbox_account',
    resourceId: account.id,
    metadata: { attemptedAt },
  })

  try {
    if (getSyncAdapterMode() === 'imap') {
      await purgeStubMessagesForAccount(account.id)
    }

    const folders = await ensureFolders(account)
    const adapter = getConfiguredSyncAdapter()
    let syncedMessages = 0

    for (const folder of folders) {
      const cursor = await findCursor(account.id, folder.id)
      const pulled = await adapter.syncFolder(account, {
        remoteFolderId: folder.remoteFolderId,
        name: folder.name,
        role: folder.role || 'custom',
      }, cursor?.cursorValue || null)

      for (const message of pulled.messages) {
        await upsertMessageWithBody({
          accountId: account.id,
          folderId: folder.id,
          remoteMessageId: message.remoteMessageId,
          remoteThreadId: message.remoteThreadId,
          fromAddress: message.fromAddress,
          toAddress: message.toAddress,
          subject: message.subject,
          snippet: message.snippet,
          receivedAt: message.receivedAt,
          flagsJson: message.flagsJson,
          bodyText: message.bodyText,
          bodyHtmlSanitized: message.bodyHtmlSanitized,
        })
        syncedMessages += 1
      }

      await upsertCursor(account.id, folder.id, pulled.nextCursor, new Date().toISOString())
    }

    runtime.state = 'idle'
    runtime.lastSuccessfulAt = new Date().toISOString()
    runtime.retryCount = 0
    runtime.nextRetryAt = null

    await recordAuditEvent({
      userId,
      eventType: 'sync.run.succeeded',
      resourceType: 'mailbox_account',
      resourceId: account.id,
      metadata: {
        syncedFolders: folders.length,
        syncedMessages,
      },
    })

    return {
      accountId: account.id,
      syncedFolders: folders.length,
      syncedMessages,
    }
  }
  catch (error) {
    runtime.retryCount += 1
    runtime.state = runtime.retryCount <= getSyncMaxRetries() ? 'retrying' : 'failed'
    runtime.lastErrorCode = 'SYNC_TRANSIENT_FAILURE'
    runtime.lastErrorMessage = error instanceof Error ? error.message : 'Unknown sync failure'
    runtime.nextRetryAt = new Date(Date.now() + (Math.min(60, (2 ** runtime.retryCount)) * 1000)).toISOString()

    await recordAuditEvent({
      userId,
      eventType: 'sync.run.failed',
      resourceType: 'mailbox_account',
      resourceId: account.id,
      metadata: {
        code: runtime.lastErrorCode,
        message: runtime.lastErrorMessage,
        retryCount: runtime.retryCount,
      },
    })

    throw new DomainError('SYNC_TRANSIENT_FAILURE', 'Sync run failed', 500)
  }
}

async function runPendingSyncCycle(): Promise<void> {
  if (schedulerRunning) {
    return
  }

  schedulerRunning = true
  try {
    const users = await listUsers()
    const jobs: Array<{ userId: string, account: AccountRecord }> = []

    for (const user of users) {
      const accounts = await listAccountsForUser(user.id)
      for (const account of accounts) {
        const runtime = getRuntimeState(account.id)
        const dueRetry = runtime.state === 'retrying'
          && runtime.nextRetryAt
          && Date.parse(runtime.nextRetryAt) <= Date.now()

        if (runtime.state === 'idle' || dueRetry) {
          jobs.push({ userId: user.id, account })
        }
      }
    }

    const concurrency = getSyncMaxConcurrency()
    let cursor = 0
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < jobs.length) {
        const idx = cursor
        cursor += 1
        const job = jobs[idx]
        if (!job) {
          continue
        }

        try {
          await runSyncForAccount(job.userId, job.account)
        }
        catch {
          // runtime state and audit event already captured by runSyncForAccount
        }
      }
    })

    await Promise.all(workers)
  }
  finally {
    schedulerRunning = false
  }
}

export function ensureSyncSchedulerInitialized(): void {
  if (schedulerInitialized) {
    return
  }

  schedulerInitialized = true
  const intervalMs = getSyncIntervalSeconds() * 1000
  schedulerTimer = setInterval(() => {
    void runPendingSyncCycle()
  }, intervalMs)
  void runPendingSyncCycle()
}

export function getSyncSchedulerState(): { initialized: boolean, mode: 'active' | 'disabled' } {
  return {
    initialized: schedulerInitialized,
    mode: schedulerTimer ? 'active' : 'disabled',
  }
}

export async function runSyncForUser(userId: string): Promise<SyncRunSummary[]> {
  const accounts = await listAccountsForUser(userId)
  const results: SyncRunSummary[] = []

  for (const account of accounts) {
    results.push(await runSyncForAccount(userId, account))
  }

  return results
}

export async function runSyncForUserAccount(userId: string, accountId: string): Promise<SyncRunSummary> {
  const account = await findAccountByIdForUser(accountId, userId)
  if (!account) {
    throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found', 404)
  }

  return runSyncForAccount(userId, account)
}

export async function getSyncStatusForUser(userId: string): Promise<AccountSyncStatus[]> {
  const accounts = await listAccountsForUser(userId)
  const statuses: AccountSyncStatus[] = []

  for (const account of accounts) {
    const runtime = getRuntimeState(account.id)
    const cursors = await listCursorsForAccount(account.id)
    const messageCount = await countMessagesForAccount(account.id)

    statuses.push({
      accountId: account.id,
      providerLabel: account.providerLabel,
      emailAddress: account.emailAddress,
      state: runtime.state,
      lastAttemptedAt: runtime.lastAttemptedAt,
      lastSuccessfulAt: runtime.lastSuccessfulAt,
      retryCount: runtime.retryCount,
      nextRetryAt: runtime.nextRetryAt,
      lastErrorCode: runtime.lastErrorCode,
      lastErrorMessage: runtime.lastErrorMessage,
      cursorCount: cursors.length,
      messageCount,
    })
  }

  return statuses
}

export async function listRecentMessagesForUserAccount(userId: string, accountId: string, limit = 20): Promise<SyncedMessageRecord[]> {
  const account = await findAccountByIdForUser(accountId, userId)
  if (!account) {
    throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found', 404)
  }

  return listRecentMessagesForAccountForUser(accountId, userId, limit)
}