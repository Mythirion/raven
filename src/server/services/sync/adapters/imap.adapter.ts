import { ImapFlow } from 'imapflow'
import type { AccountRecord } from '../../../repositories/accounts.repository'
import { decryptSecret } from '../../../utils/security'
import { DomainError } from '../../../utils/domain-error'
import type { AdapterFolder, AdapterMessage, AdapterSyncResult, SyncProviderAdapter } from './types'

const MAX_INITIAL_MESSAGES = 20
const MAX_INCREMENTAL_MESSAGES = 50

function normalizeRole(specialUse: string | null | undefined, path: string): string {
  const value = String(specialUse || '').toLowerCase()
  if (value.includes('inbox') || path.toLowerCase() === 'inbox') {
    return 'inbox'
  }
  if (value.includes('sent')) {
    return 'sent'
  }
  if (value.includes('drafts') || value.includes('draft')) {
    return 'drafts'
  }
  if (value.includes('archive') || value.includes('all')) {
    return 'archive'
  }
  return 'custom'
}

async function withClient<T>(account: AccountRecord, run: (client: ImapFlow) => Promise<T>): Promise<T> {
  try {
    const password = await decryptSecret(account.encryptedSecret)
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      auth: {
        user: account.emailAddress,
        pass: password,
      },
    })

    await client.connect()
    try {
      return await run(client)
    }
    finally {
      try {
        await client.logout()
      }
      catch {
        // ignore close failures
      }
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''

    if (
      message.includes('auth')
      || message.includes('invalid login')
      || message.includes('invalid credentials')
      || message.includes('login failed')
    ) {
      throw new DomainError('SYNC_AUTH_FAILED', 'Provider authentication failed', 401)
    }

    if (
      message.includes('econnrefused')
      || message.includes('enotfound')
      || message.includes('etimedout')
      || message.includes('timed out')
      || message.includes('network')
    ) {
      throw new DomainError('SYNC_PROVIDER_UNAVAILABLE', 'Provider is unavailable', 503)
    }

    if (error instanceof DomainError) {
      throw error
    }

    throw new DomainError('SYNC_TRANSIENT_FAILURE', 'Sync run failed', 500)
  }
}

function mapMessage(msg: any): AdapterMessage {
  const from = msg.envelope?.from?.[0]
  const toList = Array.isArray(msg.envelope?.to) ? msg.envelope.to : []
  const toAddress = toList
    .map((entry: any) => entry?.address)
    .filter((value: unknown) => typeof value === 'string' && value.length > 0)
    .join(', ')

  const subject = msg.envelope?.subject || '(no subject)'
  const uid = String(msg.uid)
  const date = msg.internalDate instanceof Date
    ? msg.internalDate.toISOString()
    : new Date().toISOString()
  const flags = Array.isArray(msg.flags)
    ? msg.flags
    : (msg.flags && typeof msg.flags[Symbol.iterator] === 'function' ? Array.from(msg.flags) : [])

  return {
    remoteMessageId: uid,
    remoteThreadId: msg.envelope?.messageId ? String(msg.envelope.messageId) : `thread-${uid}`,
    fromAddress: from?.address || '(unknown)',
    toAddress: toAddress || '(unknown)',
    subject,
    snippet: subject,
    receivedAt: date,
    flagsJson: JSON.stringify(flags),
    bodyText: `Fetched via IMAP (uid=${uid}). Subject: ${subject}`,
    bodyHtmlSanitized: null,
  }
}

export const imapSyncAdapter: SyncProviderAdapter = {
  async listFolders(account: AccountRecord): Promise<AdapterFolder[]> {
    return withClient(account, async (client) => {
      const listed = await client.list()
      const mapped = listed.map((mailbox: any) => ({
        remoteFolderId: String(mailbox.path || mailbox.name || 'INBOX'),
        name: String(mailbox.name || mailbox.path || 'Inbox'),
        role: normalizeRole(
          Array.isArray(mailbox.specialUse) ? mailbox.specialUse[0] : mailbox.specialUse,
          String(mailbox.path || mailbox.name || 'INBOX'),
        ),
      }))

      return mapped.length > 0
        ? mapped
        : [{ remoteFolderId: 'INBOX', name: 'Inbox', role: 'inbox' }]
    })
  },

  async syncFolder(account: AccountRecord, folder: AdapterFolder, cursor: string | null): Promise<AdapterSyncResult> {
    return withClient(account, async (client) => {
      if (cursor && !/^\d+$/.test(cursor.trim())) {
        throw new DomainError('SYNC_CURSOR_INVALID', 'Sync cursor is invalid', 409)
      }

      const lock = await client.getMailboxLock(folder.remoteFolderId)
      try {
        const status = await client.status(folder.remoteFolderId, { uidNext: true })
        const uidNext = Number(status.uidNext || 1)
        const previousCursor = Number(cursor || '0')
        const hasCursor = Number.isFinite(previousCursor) && previousCursor > 0

        let fromUid = hasCursor ? previousCursor + 1 : Math.max(1, uidNext - MAX_INITIAL_MESSAGES)

        // If cursor came from an older adapter mode (or stale/corrupt state) and is ahead
        // of provider UID sequence, recover by pulling a bounded recent window.
        if (hasCursor && previousCursor >= uidNext) {
          fromUid = Math.max(1, uidNext - MAX_INCREMENTAL_MESSAGES)
        }

        if (fromUid >= uidNext) {
          return {
            messages: [],
            nextCursor: String(uidNext > 1 ? uidNext - 1 : 0),
          }
        }

        const rows: any[] = []
        for await (const msg of client.fetch(`${fromUid}:*`, {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
        }, {
          uid: true,
        })) {
          rows.push(msg)
        }

        const maxCount = hasCursor ? MAX_INCREMENTAL_MESSAGES : MAX_INITIAL_MESSAGES
        const sliced = rows.slice(-maxCount)
        const messages = sliced.map((msg) => mapMessage(msg))
        const nextCursor = messages.length > 0
          ? messages[messages.length - 1]?.remoteMessageId || String(Math.max(previousCursor, uidNext - 1))
          : String(Math.max(previousCursor, uidNext - 1))

        return {
          messages,
          nextCursor,
        }
      }
      finally {
        lock.release()
      }
    })
  },
}
