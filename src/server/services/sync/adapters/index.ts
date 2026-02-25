import type { SyncProviderAdapter } from './types'
import { stubSyncAdapter } from './stub.adapter'
import { imapSyncAdapter } from './imap.adapter'

export type SyncAdapterMode = 'stub' | 'imap'

export function getSyncAdapterMode(): SyncAdapterMode {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const raw = String(env?.SYNC_ADAPTER_MODE || 'stub').trim().toLowerCase()
  return raw === 'imap' ? 'imap' : 'stub'
}

export function getConfiguredSyncAdapter(): SyncProviderAdapter {
  return getSyncAdapterMode() === 'imap'
    ? imapSyncAdapter
    : stubSyncAdapter
}
