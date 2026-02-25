import type { AccountRecord } from '../../../repositories/accounts.repository'
import type { AdapterFolder, AdapterMessage, AdapterSyncResult, SyncProviderAdapter } from './types'

function defaultFoldersForAccount(): AdapterFolder[] {
  return [
    { remoteFolderId: 'inbox', name: 'Inbox', role: 'inbox' },
    { remoteFolderId: 'sent', name: 'Sent', role: 'sent' },
    { remoteFolderId: 'drafts', name: 'Drafts', role: 'drafts' },
    { remoteFolderId: 'archive', name: 'Archive', role: 'archive' },
    { remoteFolderId: 'trash', name: 'Trash', role: 'trash' },
  ]
}

function generateAdapterMessages(account: AccountRecord, folder: AdapterFolder, cursor: string | null): AdapterSyncResult {
  const cursorNumber = Number(cursor || '0')
  const nextStart = Number.isFinite(cursorNumber) ? cursorNumber + 1 : 1
  const count = cursor ? 1 : 2

  const messages: AdapterMessage[] = []
  for (let i = 0; i < count; i += 1) {
    const seq = nextStart + i
    messages.push({
      remoteMessageId: `${folder.remoteFolderId}-${seq}`,
      remoteThreadId: `${folder.remoteFolderId}-thread-${Math.ceil(seq / 2)}`,
      fromAddress: `sender+${seq}@example.test`,
      toAddress: account.emailAddress,
      subject: `[${account.providerLabel}] ${folder.name} message ${seq}`,
      snippet: `Stub sync message ${seq} for ${folder.name}`,
      receivedAt: new Date(Date.now() - ((count - i) * 1000)).toISOString(),
      flagsJson: JSON.stringify({ seen: false }),
      bodyText: `This is a Phase 2 sync stub message (${seq}) for ${folder.name}.\n\nSender: sender+${seq}@example.test\nFolder: ${folder.name}\nProvider: ${account.providerLabel}`,
      bodyHtmlSanitized: null,
    })
  }

  return {
    messages,
    nextCursor: String(nextStart + count - 1),
  }
}

export const stubSyncAdapter: SyncProviderAdapter = {
  async listFolders(_account: AccountRecord): Promise<AdapterFolder[]> {
    return defaultFoldersForAccount()
  },
  async syncFolder(account: AccountRecord, folder: AdapterFolder, cursor: string | null): Promise<AdapterSyncResult> {
    return generateAdapterMessages(account, folder, cursor)
  },
}
