import { DomainError } from '../utils/domain-error'
import type {
  BulkMessageActionResult,
  MessageAction,
  MessageDetail,
  MessageListQuery,
  MessageListResult,
  MessageSummary,
} from '../services/messages/types'

interface RuntimeConfigLike {
  databaseUrl?: string
  sqlitePath?: string
}

interface CursorToken {
  sortTs: string
  id: string
}

interface MessageFlagState {
  isRead: boolean
  isStarred: boolean
  isArchived: boolean
  isDeleted: boolean
}

const FOLDER_ROLE_FILTERS = new Set(['inbox', 'sent', 'drafts', 'archive', 'trash'])

function getRuntimeConfigLike(): RuntimeConfigLike {
  const g = globalThis as {
    useRuntimeConfig?: () => RuntimeConfigLike
  }
  if (typeof g.useRuntimeConfig === 'function') {
    return g.useRuntimeConfig() || {}
  }
  return {}
}

function resolveDbConfig() {
  const config = getRuntimeConfigLike()
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return {
    databaseUrl: env?.DATABASE_URL || (config.databaseUrl as string) || '',
    sqlitePath: env?.SQLITE_PATH || (config.sqlitePath as string) || '/data/app.db',
  }
}

function parseCursor(cursor: string | undefined): CursorToken | null {
  if (!cursor) {
    return null
  }

  try {
    let padded = cursor.replace(/-/g, '+').replace(/_/g, '/')
    while ((padded.length % 4) !== 0) {
      padded += '='
    }
    const raw = atob(padded)
    const parsed = JSON.parse(raw) as { sortTs?: unknown, id?: unknown }
    const sortTs = String(parsed.sortTs || '')
    const id = String(parsed.id || '')
    if (!sortTs || !id) {
      return null
    }
    return { sortTs, id }
  }
  catch {
    return null
  }
}

function createCursor(sortTs: string, id: string): string {
  const raw = JSON.stringify({ sortTs, id })
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function parseFlags(flagsJson: string | null): MessageFlagState {
  const base: MessageFlagState = {
    isRead: false,
    isStarred: false,
    isArchived: false,
    isDeleted: false,
  }

  if (!flagsJson) {
    return base
  }

  try {
    const parsed = JSON.parse(flagsJson) as unknown
    if (Array.isArray(parsed)) {
      const lowered = parsed.map((flag) => String(flag || '').toLowerCase())
      return {
        isRead: lowered.indexOf('\\seen') >= 0 || lowered.indexOf('seen') >= 0,
        isStarred: lowered.indexOf('\\flagged') >= 0 || lowered.indexOf('flagged') >= 0,
        isArchived: lowered.indexOf('\\archived') >= 0 || lowered.indexOf('archived') >= 0,
        isDeleted: lowered.indexOf('\\deleted') >= 0 || lowered.indexOf('deleted') >= 0,
      }
    }

    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      return {
        isRead: Boolean(record.seen ?? record.isRead),
        isStarred: Boolean(record.flagged ?? record.isStarred),
        isArchived: Boolean(record.archived ?? record.isArchived),
        isDeleted: Boolean(record.deleted ?? record.isDeleted),
      }
    }
  }
  catch {
    // fall through to base
  }

  return base
}

function serializeFlags(flags: MessageFlagState): string {
  return JSON.stringify({
    seen: flags.isRead,
    flagged: flags.isStarred,
    archived: flags.isArchived,
    deleted: flags.isDeleted,
  })
}

function applyFlagAction(current: MessageFlagState, action: MessageAction): MessageFlagState {
  if (action === 'mark_read') {
    return { ...current, isRead: true }
  }
  if (action === 'mark_unread') {
    return { ...current, isRead: false }
  }
  if (action === 'star') {
    return { ...current, isStarred: true }
  }
  if (action === 'unstar') {
    return { ...current, isStarred: false }
  }
  if (action === 'archive') {
    return { ...current, isArchived: true }
  }
  if (action === 'delete') {
    return { ...current, isDeleted: true }
  }

  return current
}

function mapSummaryRow(row: Record<string, unknown>): MessageSummary & { sortTs: string } {
  const flags = parseFlags(row.flags_json ? String(row.flags_json) : null)
  const sortTs = String(row.sort_ts || row.received_at || row.created_at || '')

  return {
    id: String(row.id),
    accountId: String(row.account_id),
    folderId: String(row.folder_id),
    subject: row.subject ? String(row.subject) : '(no subject)',
    fromAddress: row.from_address ? String(row.from_address) : null,
    toAddress: row.to_address ? String(row.to_address) : null,
    snippet: row.snippet ? String(row.snippet) : null,
    receivedAt: row.received_at ? String(row.received_at) : null,
    isRead: flags.isRead,
    isStarred: flags.isStarred,
    isArchived: flags.isArchived,
    isDeleted: flags.isDeleted,
    sortTs,
  }
}

function mapDetailRow(row: Record<string, unknown>): MessageDetail {
  const { sortTs: _sortTs, ...base } = mapSummaryRow(row)
  return {
    ...base,
    bodyText: row.body_text ? String(row.body_text) : null,
    bodyHtmlSanitized: row.body_html_sanitized ? String(row.body_html_sanitized) : null,
  }
}

async function ensureFolderOwnedByUser(folderId: string, userId: string): Promise<void> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        `SELECT f.id
         FROM folders f
         JOIN mailbox_accounts a ON a.id = f.account_id
         WHERE f.id = $1 AND a.user_id = $2
         LIMIT 1`,
        [folderId, userId],
      )

      if (!result.rows[0]) {
        throw new DomainError('MESSAGE_FORBIDDEN', 'Target folder is not accessible', 403)
      }
    }
    finally {
      await client.end()
    }
    return
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const row = db.prepare(
      `SELECT f.id
       FROM folders f
       JOIN mailbox_accounts a ON a.id = f.account_id
       WHERE f.id = ? AND a.user_id = ?
       LIMIT 1`,
    ).get(folderId, userId) as Record<string, unknown> | undefined

    if (!row) {
      throw new DomainError('MESSAGE_FORBIDDEN', 'Target folder is not accessible', 403)
    }
  }
  finally {
    db.close()
  }
}

export async function listMessagesForUser(userId: string, query: MessageListQuery): Promise<MessageListResult> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(query.limit || 25)))
  const cursor = parseCursor(query.cursor)
  const normalizedFolderFilter = String(query.folderId || '').trim().toLowerCase()
  const useRoleFilter = FOLDER_ROLE_FILTERS.has(normalizedFolderFilter)
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const where: string[] = ['a.user_id = $1']
    const values: unknown[] = [userId]
    let param = 2

    if (query.accountId) {
      where.push(`m.account_id = $${param}`)
      values.push(query.accountId)
      param += 1
    }

    if (query.folderId) {
      if (useRoleFilter) {
        where.push(`LOWER(COALESCE(f.role, '')) = $${param}`)
        values.push(normalizedFolderFilter)
      }
      else {
        where.push(`m.folder_id = $${param}`)
        values.push(query.folderId)
      }
      param += 1
    }

    if (query.q) {
      where.push(`(LOWER(COALESCE(m.subject, '')) LIKE $${param} OR LOWER(COALESCE(m.from_address, '')) LIKE $${param})`)
      values.push(`%${query.q.toLowerCase()}%`)
      param += 1
    }

    if (cursor) {
      where.push(`(COALESCE(m.received_at, m.created_at), m.id) < ($${param}, $${param + 1})`)
      values.push(cursor.sortTs, cursor.id)
      param += 2
    }

    values.push(safeLimit + 1)
    const limitParam = `$${param}`

    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        `SELECT
           m.id,
           m.account_id,
           m.folder_id,
           m.subject,
           m.from_address,
           m.to_address,
           m.snippet,
           m.received_at,
           m.created_at,
           m.flags_json,
           COALESCE(m.received_at, m.created_at) AS sort_ts
         FROM messages m
         JOIN mailbox_accounts a ON a.id = m.account_id
         LEFT JOIN folders f ON f.id = m.folder_id
         WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(m.received_at, m.created_at) DESC, m.id DESC
         LIMIT ${limitParam}`,
        values,
      )

      const rows = result.rows.map((row) => mapSummaryRow(row as Record<string, unknown>))
      const hasMore = rows.length > safeLimit
      const items = hasMore ? rows.slice(0, safeLimit) : rows
      const last = items[items.length - 1]

      return {
        messages: items.map(({ sortTs: _sortTs, ...message }) => message),
        nextCursor: hasMore && last ? createCursor(last.sortTs, last.id) : null,
      }
    }
    finally {
      await client.end()
    }
  }

  const where: string[] = ['a.user_id = ?']
  const values: unknown[] = [userId]

  if (query.accountId) {
    where.push('m.account_id = ?')
    values.push(query.accountId)
  }
  if (query.folderId) {
    if (useRoleFilter) {
      where.push("LOWER(COALESCE(f.role, '')) = ?")
      values.push(normalizedFolderFilter)
    }
    else {
      where.push('m.folder_id = ?')
      values.push(query.folderId)
    }
  }
  if (query.q) {
    where.push(`(LOWER(COALESCE(m.subject, '')) LIKE ? OR LOWER(COALESCE(m.from_address, '')) LIKE ?)`)
    values.push(`%${query.q.toLowerCase()}%`, `%${query.q.toLowerCase()}%`)
  }
  if (cursor) {
    where.push('(COALESCE(m.received_at, m.created_at) < ? OR (COALESCE(m.received_at, m.created_at) = ? AND m.id < ?))')
    values.push(cursor.sortTs, cursor.sortTs, cursor.id)
  }

  values.push(safeLimit + 1)

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const rows = db.prepare(
      `SELECT
         m.id,
         m.account_id,
         m.folder_id,
         m.subject,
         m.from_address,
         m.to_address,
         m.snippet,
         m.received_at,
         m.created_at,
         m.flags_json,
         COALESCE(m.received_at, m.created_at) AS sort_ts
       FROM messages m
       JOIN mailbox_accounts a ON a.id = m.account_id
       LEFT JOIN folders f ON f.id = m.folder_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(m.received_at, m.created_at) DESC, m.id DESC
       LIMIT ?`,
    ).all(...values) as Array<Record<string, unknown>>

    const mapped = rows.map((row) => mapSummaryRow(row))
    const hasMore = mapped.length > safeLimit
    const items = hasMore ? mapped.slice(0, safeLimit) : mapped
    const last = items[items.length - 1]

    return {
      messages: items.map(({ sortTs: _sortTs, ...message }) => message),
      nextCursor: hasMore && last ? createCursor(last.sortTs, last.id) : null,
    }
  }
  finally {
    db.close()
  }
}

export async function findMessageDetailForUser(userId: string, messageId: string): Promise<MessageDetail | null> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        `SELECT
           m.id,
           m.account_id,
           m.folder_id,
           m.subject,
           m.from_address,
           m.to_address,
           m.snippet,
           m.received_at,
           m.created_at,
           m.flags_json,
           b.body_text,
           b.body_html_sanitized,
           COALESCE(m.received_at, m.created_at) AS sort_ts
         FROM messages m
         JOIN mailbox_accounts a ON a.id = m.account_id
         LEFT JOIN message_bodies b ON b.message_id = m.id
         WHERE m.id = $1 AND a.user_id = $2
         LIMIT 1`,
        [messageId, userId],
      )

      if (!result.rows[0]) {
        return null
      }

      return mapDetailRow(result.rows[0] as Record<string, unknown>)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const row = db.prepare(
      `SELECT
         m.id,
         m.account_id,
         m.folder_id,
         m.subject,
         m.from_address,
         m.to_address,
         m.snippet,
         m.received_at,
         m.created_at,
         m.flags_json,
         b.body_text,
         b.body_html_sanitized,
         COALESCE(m.received_at, m.created_at) AS sort_ts
       FROM messages m
       JOIN mailbox_accounts a ON a.id = m.account_id
       LEFT JOIN message_bodies b ON b.message_id = m.id
       WHERE m.id = ? AND a.user_id = ?
       LIMIT 1`,
    ).get(messageId, userId) as Record<string, unknown> | undefined

    return row ? mapDetailRow(row) : null
  }
  finally {
    db.close()
  }
}

export async function applyActionForUserMessage(
  userId: string,
  messageId: string,
  action: MessageAction,
  targetFolderId?: string,
): Promise<boolean> {
  const result = await applyBulkActionForUserMessages(userId, [messageId], action, targetFolderId)
  return result.updated > 0
}

export async function applyBulkActionForUserMessages(
  userId: string,
  messageIds: string[],
  action: MessageAction,
  targetFolderId?: string,
): Promise<BulkMessageActionResult> {
  const seen: Record<string, true> = {}
  const uniqueIds: string[] = []
  for (const rawId of messageIds) {
    const id = String(rawId || '').trim()
    if (!id || seen[id]) {
      continue
    }
    seen[id] = true
    uniqueIds.push(id)
  }
  if (uniqueIds.length === 0) {
    return {
      action,
      requested: 0,
      updated: 0,
    }
  }

  if (action === 'move') {
    if (!targetFolderId) {
      throw new DomainError('MESSAGE_TARGET_FOLDER_REQUIRED', 'targetFolderId is required when action is move', 400)
    }
    await ensureFolderOwnedByUser(targetFolderId, userId)
  }

  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')

      const result = await client.query(
        `SELECT m.id, m.flags_json
         FROM messages m
         JOIN mailbox_accounts a ON a.id = m.account_id
         WHERE a.user_id = $1
           AND m.id = ANY($2::text[])`,
        [userId, uniqueIds],
      )

      let updated = 0
      for (const row of result.rows as Array<Record<string, unknown>>) {
        const id = String(row.id)
        const nextFlags = serializeFlags(applyFlagAction(parseFlags(row.flags_json ? String(row.flags_json) : null), action))

        if (action === 'move' && targetFolderId) {
          await client.query(
            'UPDATE messages SET folder_id = $1, flags_json = $2, updated_at = $3 WHERE id = $4',
            [targetFolderId, nextFlags, new Date().toISOString(), id],
          )
        }
        else {
          await client.query(
            'UPDATE messages SET flags_json = $1, updated_at = $2 WHERE id = $3',
            [nextFlags, new Date().toISOString(), id],
          )
        }

        updated += 1
      }

      await client.query('COMMIT')
      return {
        action,
        requested: uniqueIds.length,
        updated,
      }
    }
    catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    db.exec('BEGIN')

    const placeholders = uniqueIds.map(() => '?').join(', ')
    const rows = db.prepare(
      `SELECT m.id, m.flags_json
       FROM messages m
       JOIN mailbox_accounts a ON a.id = m.account_id
       WHERE a.user_id = ?
         AND m.id IN (${placeholders})`,
    ).all(userId, ...uniqueIds) as Array<Record<string, unknown>>

    let updated = 0
    for (const row of rows) {
      const id = String(row.id)
      const nextFlags = serializeFlags(applyFlagAction(parseFlags(row.flags_json ? String(row.flags_json) : null), action))
      const now = new Date().toISOString()

      if (action === 'move' && targetFolderId) {
        db.prepare('UPDATE messages SET folder_id = ?, flags_json = ?, updated_at = ? WHERE id = ?').run(targetFolderId, nextFlags, now, id)
      }
      else {
        db.prepare('UPDATE messages SET flags_json = ?, updated_at = ? WHERE id = ?').run(nextFlags, now, id)
      }

      updated += 1
    }

    db.exec('COMMIT')
    return {
      action,
      requested: uniqueIds.length,
      updated,
    }
  }
  catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  finally {
    db.close()
  }
}
