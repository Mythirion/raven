import { ImapFlow } from 'imapflow'
import type { AccountRecord } from '../../../repositories/accounts.repository'
import { decryptSecret } from '../../../utils/security'
import { DomainError } from '../../../utils/domain-error'
import type { AdapterFolder, AdapterMessage, AdapterSyncResult, SyncProviderAdapter } from './types'

const MAX_INITIAL_MESSAGES = 20
const MAX_INCREMENTAL_MESSAGES = 50

interface ParsedSection {
  headers: Record<string, string>
  body: string
}

interface ExtractedBody {
  bodyText: string
  snippet: string
  bodyHtmlSanitized: string | null
}

function splitHeaderBody(raw: string): ParsedSection {
  const crlfIndex = raw.indexOf('\r\n\r\n')
  const lfIndex = raw.indexOf('\n\n')
  const boundaryIndex = crlfIndex >= 0 ? crlfIndex : lfIndex

  if (boundaryIndex < 0) {
    return {
      headers: {},
      body: raw,
    }
  }

  const rawHeaders = raw.slice(0, boundaryIndex)
  const bodyOffset = crlfIndex >= 0 ? 4 : 2
  const body = raw.slice(boundaryIndex + bodyOffset)

  const lines = rawHeaders.replace(/\r\n/g, '\n').split('\n')
  const headers: Record<string, string> = {}
  let currentHeader = ''

  for (const line of lines) {
    if (!line.trim()) {
      continue
    }

    if ((line.startsWith(' ') || line.startsWith('\t')) && currentHeader) {
      headers[currentHeader] = `${headers[currentHeader]} ${line.trim()}`
      continue
    }

    const idx = line.indexOf(':')
    if (idx <= 0) {
      continue
    }

    currentHeader = line.slice(0, idx).trim().toLowerCase()
    headers[currentHeader] = line.slice(idx + 1).trim()
  }

  return { headers, body }
}

function getContentTypeParts(contentType: string): { mimeType: string, boundary: string | null, charset: string | null } {
  const normalized = String(contentType || '').trim()
  if (!normalized) {
    return {
      mimeType: 'text/plain',
      boundary: null,
      charset: null,
    }
  }

  const pieces = normalized.split(';').map((piece) => piece.trim())
  const mimeType = (pieces[0] || 'text/plain').toLowerCase()
  let boundary: string | null = null
  let charset: string | null = null

  for (const piece of pieces.slice(1)) {
    const [rawKey, ...rawValue] = piece.split('=')
    const key = String(rawKey || '').trim().toLowerCase()
    const value = rawValue.join('=').trim().replace(/^"|"$/g, '')

    if (!value) {
      continue
    }

    if (key === 'boundary') {
      boundary = value
    }
    if (key === 'charset') {
      charset = value.toLowerCase()
    }
  }

  return { mimeType, boundary, charset }
}

function decodeWithCharset(buffer: Buffer, charset: string | null): string {
  const normalized = String(charset || '').toLowerCase()
  if (!normalized || normalized === 'utf-8' || normalized === 'utf8' || normalized === 'us-ascii') {
    return buffer.toString('utf8')
  }

  if (normalized === 'iso-8859-1' || normalized === 'latin1') {
    return buffer.toString('latin1')
  }

  // Fallback to UTF-8 for unsupported charsets.
  return buffer.toString('utf8')
}

function decodeQuotedPrintableToBuffer(input: string): Buffer {
  const normalized = input.replace(/=\r?\n/g, '')
  const bytes: number[] = []

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]
    if (ch === '=' && i + 2 < normalized.length) {
      const hex = normalized.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16))
        i += 2
        continue
      }
    }
    bytes.push(normalized.charCodeAt(i) & 0xff)
  }

  return Buffer.from(bytes)
}

function decodeTransferEncoding(body: string, transferEncoding: string | null, charset: string | null): string {
  const normalized = String(transferEncoding || '').toLowerCase().trim()

  if (normalized === 'base64') {
    const compact = body.replace(/\s+/g, '')
    const decoded = Buffer.from(compact, 'base64')
    return decodeWithCharset(decoded, charset)
  }

  if (normalized === 'quoted-printable') {
    const decoded = decodeQuotedPrintableToBuffer(body)
    return decodeWithCharset(decoded, charset)
  }

  return decodeWithCharset(Buffer.from(body, 'binary'), charset)
}

function splitMultipart(body: string, boundary: string): string[] {
  const marker = `--${boundary}`
  const segments = body.split(marker)
  const parts: string[] = []

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed || trimmed === '--') {
      continue
    }

    const cleaned = trimmed.endsWith('--') ? trimmed.slice(0, -2).trim() : trimmed
    if (cleaned) {
      parts.push(cleaned)
    }
  }

  return parts
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&zwnj;/gi, '')
    .replace(/&zwj;/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeHtml(html: string): string {
  const escaped = String(html || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  return escaped
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br/>')
    .trim()
}

function isAttachment(headers: Record<string, string>): boolean {
  const disposition = String(headers['content-disposition'] || '').toLowerCase()
  return disposition.indexOf('attachment') >= 0
}

function extractBestBody(raw: string): ExtractedBody {
  const section = splitHeaderBody(raw)
  const topType = getContentTypeParts(section.headers['content-type'] || 'text/plain')
  const topEncoding = section.headers['content-transfer-encoding'] || null

  if (topType.mimeType.startsWith('multipart/') && topType.boundary) {
    const parts = splitMultipart(section.body, topType.boundary)
    let plainText = ''
    let htmlText = ''
    let htmlSanitized: string | null = null

    for (const partRaw of parts) {
      const part = splitHeaderBody(partRaw)
      if (isAttachment(part.headers)) {
        continue
      }
      const partType = getContentTypeParts(part.headers['content-type'] || 'text/plain')
      const partEncoding = part.headers['content-transfer-encoding'] || null

      if (partType.mimeType.startsWith('multipart/') && partType.boundary) {
        const nestedParts = splitMultipart(part.body, partType.boundary)
        for (const nestedRaw of nestedParts) {
          const nested = splitHeaderBody(nestedRaw)
          if (isAttachment(nested.headers)) {
            continue
          }
          const nestedType = getContentTypeParts(nested.headers['content-type'] || 'text/plain')
          const nestedEncoding = nested.headers['content-transfer-encoding'] || null
          const decodedNested = decodeTransferEncoding(nested.body, nestedEncoding, nestedType.charset)

          if (nestedType.mimeType === 'text/plain' && !plainText) {
            plainText = decodedNested.trim()
          }
          if (nestedType.mimeType === 'text/html' && !htmlText) {
            htmlText = htmlToText(decodedNested)
            htmlSanitized = sanitizeHtml(decodedNested)
          }
        }
        continue
      }

      const decoded = decodeTransferEncoding(part.body, partEncoding, partType.charset)
      if (partType.mimeType === 'text/plain' && !plainText) {
        plainText = decoded.trim()
      }
      if (partType.mimeType === 'text/html' && !htmlText) {
        htmlText = htmlToText(decoded)
        htmlSanitized = sanitizeHtml(decoded)
      }
    }

    const bodyText = (plainText || htmlText || '').trim()
    const snippet = bodyText.split(/\r?\n/).find((line) => line.trim())?.trim() || ''
    return {
      bodyText,
      snippet,
      bodyHtmlSanitized: htmlSanitized,
    }
  }

  const decoded = decodeTransferEncoding(section.body, topEncoding, topType.charset).trim()
  const bodyText = topType.mimeType === 'text/html' ? htmlToText(decoded) : decoded
  const snippet = bodyText.split(/\r?\n/).find((line) => line.trim())?.trim() || ''
  return {
    bodyText,
    snippet,
    bodyHtmlSanitized: topType.mimeType === 'text/html' ? sanitizeHtml(decoded) : null,
  }
}

async function readStreamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = []

  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk)
      continue
    }

    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk, 'binary'))
      continue
    }

    if (chunk && typeof chunk === 'object') {
      chunks.push(Buffer.from(chunk as Uint8Array))
    }
  }

  return Buffer.concat(chunks)
}

async function downloadRawMessageSource(client: ImapFlow, uid: number): Promise<string | null> {
  try {
    const downloaded = await client.download(String(uid), undefined, { uid: true } as any)
    const buffer = await readStreamToBuffer(downloaded.content)
    return buffer.toString('binary')
  }
  catch {
    return null
  }
}

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
    const err = error as {
      message?: string
      code?: string
      responseText?: string
      response?: string
      responseCode?: string | number
      command?: string
    }

    const message = typeof err?.message === 'string' ? err.message.toLowerCase() : ''
    const responseText = typeof err?.responseText === 'string' ? err.responseText.toLowerCase() : ''
    const response = typeof err?.response === 'string' ? err.response.toLowerCase() : ''
    const code = typeof err?.code === 'string' ? err.code.toLowerCase() : ''
    const command = typeof err?.command === 'string' ? err.command.toLowerCase() : ''
    const combined = [message, responseText, response, code, command].join(' ')

    if (
      combined.includes('auth')
      || combined.includes('invalid login')
      || combined.includes('invalid credentials')
      || combined.includes('login failed')
      || combined.includes('authenticationfailed')
      || combined.includes('application-specific password')
      || combined.includes('web login required')
      || combined.includes('too many login attempts')
    ) {
      throw new DomainError('SYNC_AUTH_FAILED', 'Provider authentication failed', 401)
    }

    if (
      combined.includes('econnrefused')
      || combined.includes('enotfound')
      || combined.includes('etimedout')
      || combined.includes('timed out')
      || combined.includes('network')
      || combined.includes('socket')
      || combined.includes('tls')
      || combined.includes('certificate')
    ) {
      throw new DomainError('SYNC_PROVIDER_UNAVAILABLE', 'Provider is unavailable', 503)
    }

    if (error instanceof DomainError) {
      throw error
    }

    throw new DomainError('SYNC_TRANSIENT_FAILURE', 'Sync run failed', 500)
  }
}

function mapMessage(msg: any, folderRemoteId: string, extracted?: ExtractedBody | null): AdapterMessage {
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

  const fallbackBody = `Fetched via IMAP (uid=${uid}). Subject: ${subject}`
  const bodyText = extracted?.bodyText || fallbackBody
  const snippet = extracted?.snippet || bodyText.slice(0, 180)

  return {
    remoteMessageId: `${folderRemoteId}:${uid}`,
    remoteThreadId: msg.envelope?.messageId ? String(msg.envelope.messageId) : `thread-${uid}`,
    fromAddress: from?.address || '(unknown)',
    toAddress: toAddress || '(unknown)',
    subject,
    snippet,
    receivedAt: date,
    flagsJson: JSON.stringify(flags),
    bodyText,
    bodyHtmlSanitized: extracted?.bodyHtmlSanitized || null,
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

        // Always include a bounded recent window for incremental sync so we can
        // refresh body content improvements for recently seen messages.
        let fromUid = hasCursor
          ? Math.max(1, Math.min(previousCursor + 1, uidNext - MAX_INCREMENTAL_MESSAGES))
          : Math.max(1, uidNext - MAX_INITIAL_MESSAGES)

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
        const messages: AdapterMessage[] = []
        for (const msg of sliced) {
          const uid = Number(msg.uid || 0)
          let extracted: ExtractedBody | null = null

          if (uid > 0) {
            const rawSource = await downloadRawMessageSource(client, uid)
            if (rawSource) {
              try {
                extracted = extractBestBody(rawSource)
              }
              catch {
                extracted = null
              }
            }
          }

          messages.push(mapMessage(msg, folder.remoteFolderId, extracted))
        }
        const lastUid = Number(sliced[sliced.length - 1]?.uid || 0)
        const nextCursor = lastUid > 0
          ? String(Math.max(previousCursor, lastUid))
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
