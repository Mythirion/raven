import type { AccountRecord } from '../../../repositories/accounts.repository'

export interface AdapterFolder {
  remoteFolderId: string
  name: string
  role: string
}

export interface AdapterMessage {
  remoteMessageId: string
  remoteThreadId: string
  fromAddress: string
  toAddress: string
  subject: string
  snippet: string
  receivedAt: string
  flagsJson: string
  bodyText: string
  bodyHtmlSanitized: string | null
}

export interface AdapterSyncResult {
  messages: AdapterMessage[]
  nextCursor: string
}

export interface SyncProviderAdapter {
  listFolders(account: AccountRecord): Promise<AdapterFolder[]>
  syncFolder(account: AccountRecord, folder: AdapterFolder, cursor: string | null): Promise<AdapterSyncResult>
}
