interface RuntimeConfigLike {
  databaseUrl?: string
  sqlitePath?: string
}

export interface FolderRecord {
  id: string
  accountId: string
  remoteFolderId: string
  name: string
  role: string | null
  createdAt: string
  updatedAt: string
}

export interface SyncCursorRecord {
  id: string
  accountId: string
  folderId: string | null
  cursorValue: string
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MessageUpsertInput {
  accountId: string
  folderId: string
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

export interface SyncedMessageRecord {
  id: string
  accountId: string
  folderId: string
  remoteMessageId: string
  subject: string
  fromAddress: string | null
  toAddress: string | null
  receivedAt: string | null
  snippet: string | null
  bodyText: string | null
}

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

function mapFolder(row: Record<string, unknown> | undefined): FolderRecord | null {
  if (!row) {
    return null
  }

  return {
    id: String(row.id),
    accountId: String(row.account_id),
    remoteFolderId: String(row.remote_folder_id),
    name: String(row.name),
    role: row.role ? String(row.role) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapCursor(row: Record<string, unknown> | undefined): SyncCursorRecord | null {
  if (!row) {
    return null
  }

  return {
    id: String(row.id),
    accountId: String(row.account_id),
    folderId: row.folder_id ? String(row.folder_id) : null,
    cursorValue: String(row.cursor_value),
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function listFoldersForAccount(accountId: string): Promise<FolderRecord[]> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        'SELECT * FROM folders WHERE account_id = $1 ORDER BY created_at ASC',
        [accountId],
      )
      return result.rows
        .map((row: unknown) => mapFolder(row as Record<string, unknown>))
        .filter((row: FolderRecord | null): row is FolderRecord => row !== null)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const rows = db.prepare('SELECT * FROM folders WHERE account_id = ? ORDER BY created_at ASC').all(accountId) as Record<string, unknown>[]
    return rows
      .map((row) => mapFolder(row))
      .filter((row): row is FolderRecord => row !== null)
  }
  finally {
    db.close()
  }
}

export async function upsertFolder(accountId: string, remoteFolderId: string, name: string, role: string | null): Promise<FolderRecord> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const now = new Date().toISOString()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const existing = await client.query(
        'SELECT * FROM folders WHERE account_id = $1 AND remote_folder_id = $2 LIMIT 1',
        [accountId, remoteFolderId],
      )

      if (existing.rows[0]) {
        const updated = await client.query(
          `UPDATE folders SET name = $1, role = $2, updated_at = $3
           WHERE id = $4
           RETURNING *`,
          [name, role, now, existing.rows[0].id],
        )
        return mapFolder(updated.rows[0] as Record<string, unknown>) as FolderRecord
      }

      const inserted = await client.query(
        `INSERT INTO folders (id, account_id, remote_folder_id, name, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [crypto.randomUUID(), accountId, remoteFolderId, name, role, now, now],
      )

      return mapFolder(inserted.rows[0] as Record<string, unknown>) as FolderRecord
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const existing = db
      .prepare('SELECT * FROM folders WHERE account_id = ? AND remote_folder_id = ? LIMIT 1')
      .get(accountId, remoteFolderId) as Record<string, unknown> | undefined

    if (existing) {
      db.prepare('UPDATE folders SET name = ?, role = ?, updated_at = ? WHERE id = ?')
        .run(name, role, now, String(existing.id))
      const updated = db.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').get(String(existing.id)) as Record<string, unknown>
      return mapFolder(updated) as FolderRecord
    }

    const id = crypto.randomUUID()
    db.prepare(
      'INSERT INTO folders (id, account_id, remote_folder_id, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, accountId, remoteFolderId, name, role, now, now)
    const inserted = db.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').get(id) as Record<string, unknown>
    return mapFolder(inserted) as FolderRecord
  }
  finally {
    db.close()
  }
}

export async function findCursor(accountId: string, folderId: string): Promise<SyncCursorRecord | null> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        'SELECT * FROM sync_cursors WHERE account_id = $1 AND folder_id = $2 LIMIT 1',
        [accountId, folderId],
      )
      return mapCursor(result.rows[0] as Record<string, unknown> | undefined)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const row = db.prepare('SELECT * FROM sync_cursors WHERE account_id = ? AND folder_id = ? LIMIT 1').get(accountId, folderId) as Record<string, unknown> | undefined
    return mapCursor(row)
  }
  finally {
    db.close()
  }
}

export async function listCursorsForAccount(accountId: string): Promise<SyncCursorRecord[]> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        'SELECT * FROM sync_cursors WHERE account_id = $1 ORDER BY updated_at DESC',
        [accountId],
      )
      return result.rows
        .map((row: unknown) => mapCursor(row as Record<string, unknown>))
        .filter((row: SyncCursorRecord | null): row is SyncCursorRecord => row !== null)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const rows = db.prepare('SELECT * FROM sync_cursors WHERE account_id = ? ORDER BY updated_at DESC').all(accountId) as Record<string, unknown>[]
    return rows
      .map((row) => mapCursor(row))
      .filter((row): row is SyncCursorRecord => row !== null)
  }
  finally {
    db.close()
  }
}

export async function upsertCursor(accountId: string, folderId: string, cursorValue: string, lastSyncedAt: string): Promise<SyncCursorRecord> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const now = new Date().toISOString()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const existing = await client.query(
        'SELECT * FROM sync_cursors WHERE account_id = $1 AND folder_id = $2 LIMIT 1',
        [accountId, folderId],
      )

      if (existing.rows[0]) {
        const updated = await client.query(
          `UPDATE sync_cursors
           SET cursor_value = $1,
               last_synced_at = $2,
               updated_at = $3
           WHERE id = $4
           RETURNING *`,
          [cursorValue, lastSyncedAt, now, existing.rows[0].id],
        )
        return mapCursor(updated.rows[0] as Record<string, unknown>) as SyncCursorRecord
      }

      const inserted = await client.query(
        `INSERT INTO sync_cursors (id, account_id, folder_id, cursor_value, last_synced_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [crypto.randomUUID(), accountId, folderId, cursorValue, lastSyncedAt, now, now],
      )

      return mapCursor(inserted.rows[0] as Record<string, unknown>) as SyncCursorRecord
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const existing = db
      .prepare('SELECT * FROM sync_cursors WHERE account_id = ? AND folder_id = ? LIMIT 1')
      .get(accountId, folderId) as Record<string, unknown> | undefined

    if (existing) {
      db.prepare(
        'UPDATE sync_cursors SET cursor_value = ?, last_synced_at = ?, updated_at = ? WHERE id = ?',
      ).run(cursorValue, lastSyncedAt, now, String(existing.id))
      const updated = db.prepare('SELECT * FROM sync_cursors WHERE id = ? LIMIT 1').get(String(existing.id)) as Record<string, unknown>
      return mapCursor(updated) as SyncCursorRecord
    }

    const id = crypto.randomUUID()
    db.prepare(
      'INSERT INTO sync_cursors (id, account_id, folder_id, cursor_value, last_synced_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, accountId, folderId, cursorValue, lastSyncedAt, now, now)
    const inserted = db.prepare('SELECT * FROM sync_cursors WHERE id = ? LIMIT 1').get(id) as Record<string, unknown>
    return mapCursor(inserted) as SyncCursorRecord
  }
  finally {
    db.close()
  }
}

export async function upsertMessageWithBody(input: MessageUpsertInput): Promise<void> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const now = new Date().toISOString()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')

      const threadLookup = await client.query(
        'SELECT * FROM threads WHERE account_id = $1 AND remote_thread_id = $2 LIMIT 1',
        [input.accountId, input.remoteThreadId],
      )

      let threadId: string
      if (threadLookup.rows[0]) {
        threadId = String(threadLookup.rows[0].id)
        await client.query(
          'UPDATE threads SET subject_preview = $1, last_message_at = $2, updated_at = $3 WHERE id = $4',
          [input.subject, input.receivedAt, now, threadId],
        )
      }
      else {
        threadId = crypto.randomUUID()
        await client.query(
          `INSERT INTO threads (id, account_id, remote_thread_id, subject_preview, last_message_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [threadId, input.accountId, input.remoteThreadId, input.subject, input.receivedAt, now, now],
        )
      }

      const existingMessage = await client.query(
        'SELECT * FROM messages WHERE account_id = $1 AND remote_message_id = $2 LIMIT 1',
        [input.accountId, input.remoteMessageId],
      )

      let messageId: string
      if (existingMessage.rows[0]) {
        messageId = String(existingMessage.rows[0].id)
        await client.query(
          `UPDATE messages
           SET folder_id = $1,
               thread_id = $2,
               from_address = $3,
               to_address = $4,
               subject = $5,
               snippet = $6,
               received_at = $7,
               flags_json = $8,
               updated_at = $9
           WHERE id = $10`,
          [
            input.folderId,
            threadId,
            input.fromAddress,
            input.toAddress,
            input.subject,
            input.snippet,
            input.receivedAt,
            input.flagsJson,
            now,
            messageId,
          ],
        )
      }
      else {
        messageId = crypto.randomUUID()
        await client.query(
          `INSERT INTO messages (
             id, account_id, folder_id, thread_id, remote_message_id,
             from_address, to_address, subject, snippet, received_at,
             flags_json, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10,
             $11, $12, $13
           )`,
          [
            messageId,
            input.accountId,
            input.folderId,
            threadId,
            input.remoteMessageId,
            input.fromAddress,
            input.toAddress,
            input.subject,
            input.snippet,
            input.receivedAt,
            input.flagsJson,
            now,
            now,
          ],
        )
      }

      const existingBody = await client.query('SELECT * FROM message_bodies WHERE message_id = $1 LIMIT 1', [messageId])
      if (existingBody.rows[0]) {
        await client.query(
          'UPDATE message_bodies SET body_text = $1, body_html_sanitized = $2, updated_at = $3 WHERE message_id = $4',
          [input.bodyText, input.bodyHtmlSanitized, now, messageId],
        )
      }
      else {
        await client.query(
          `INSERT INTO message_bodies (id, message_id, body_text, body_html_sanitized, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), messageId, input.bodyText, input.bodyHtmlSanitized, now, now],
        )
      }

      await client.query('COMMIT')
    }
    catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    finally {
      await client.end()
    }

    return
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    db.exec('BEGIN')

    const existingThread = db
      .prepare('SELECT * FROM threads WHERE account_id = ? AND remote_thread_id = ? LIMIT 1')
      .get(input.accountId, input.remoteThreadId) as Record<string, unknown> | undefined

    let threadId: string
    if (existingThread) {
      threadId = String(existingThread.id)
      db.prepare('UPDATE threads SET subject_preview = ?, last_message_at = ?, updated_at = ? WHERE id = ?')
        .run(input.subject, input.receivedAt, now, threadId)
    }
    else {
      threadId = crypto.randomUUID()
      db.prepare(
        'INSERT INTO threads (id, account_id, remote_thread_id, subject_preview, last_message_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(threadId, input.accountId, input.remoteThreadId, input.subject, input.receivedAt, now, now)
    }

    const existingMessage = db
      .prepare('SELECT * FROM messages WHERE account_id = ? AND remote_message_id = ? LIMIT 1')
      .get(input.accountId, input.remoteMessageId) as Record<string, unknown> | undefined

    let messageId: string
    if (existingMessage) {
      messageId = String(existingMessage.id)
      db.prepare(
        `UPDATE messages
         SET folder_id = ?, thread_id = ?, from_address = ?, to_address = ?, subject = ?, snippet = ?, received_at = ?, flags_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.folderId,
        threadId,
        input.fromAddress,
        input.toAddress,
        input.subject,
        input.snippet,
        input.receivedAt,
        input.flagsJson,
        now,
        messageId,
      )
    }
    else {
      messageId = crypto.randomUUID()
      db.prepare(
        `INSERT INTO messages (
           id, account_id, folder_id, thread_id, remote_message_id,
           from_address, to_address, subject, snippet, received_at,
           flags_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        messageId,
        input.accountId,
        input.folderId,
        threadId,
        input.remoteMessageId,
        input.fromAddress,
        input.toAddress,
        input.subject,
        input.snippet,
        input.receivedAt,
        input.flagsJson,
        now,
        now,
      )
    }

    const existingBody = db
      .prepare('SELECT * FROM message_bodies WHERE message_id = ? LIMIT 1')
      .get(messageId) as Record<string, unknown> | undefined

    if (existingBody) {
      db.prepare('UPDATE message_bodies SET body_text = ?, body_html_sanitized = ?, updated_at = ? WHERE message_id = ?')
        .run(input.bodyText, input.bodyHtmlSanitized, now, messageId)
    }
    else {
      db.prepare(
        'INSERT INTO message_bodies (id, message_id, body_text, body_html_sanitized, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(crypto.randomUUID(), messageId, input.bodyText, input.bodyHtmlSanitized, now, now)
    }

    db.exec('COMMIT')
  }
  catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  finally {
    db.close()
  }
}

export async function countMessagesForAccount(accountId: string): Promise<number> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query('SELECT COUNT(*)::int AS count FROM messages WHERE account_id = $1', [accountId])
      return Number(result.rows[0]?.count || 0)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE account_id = ?').get(accountId) as { count: number }
    return Number(row?.count || 0)
  }
  finally {
    db.close()
  }
}

export async function listRecentMessagesForAccountForUser(accountId: string, userId: string, limit = 20): Promise<SyncedMessageRecord[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)))
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
           m.remote_message_id,
           m.subject,
           m.from_address,
           m.to_address,
           m.received_at,
           m.snippet,
           b.body_text
         FROM messages m
         JOIN mailbox_accounts a ON a.id = m.account_id
         LEFT JOIN message_bodies b ON b.message_id = m.id
         WHERE m.account_id = $1 AND a.user_id = $2
         ORDER BY m.received_at DESC
         LIMIT $3`,
        [accountId, userId, safeLimit],
      )

      return result.rows.map((row) => ({
        id: String(row.id),
        accountId: String(row.account_id),
        folderId: String(row.folder_id),
        remoteMessageId: String(row.remote_message_id),
        subject: row.subject ? String(row.subject) : '(no subject)',
        fromAddress: row.from_address ? String(row.from_address) : null,
        toAddress: row.to_address ? String(row.to_address) : null,
        receivedAt: row.received_at ? String(row.received_at) : null,
        snippet: row.snippet ? String(row.snippet) : null,
        bodyText: row.body_text ? String(row.body_text) : null,
      }))
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const rows = db.prepare(
      `SELECT
         m.id,
         m.account_id,
         m.folder_id,
         m.remote_message_id,
         m.subject,
         m.from_address,
         m.to_address,
         m.received_at,
         m.snippet,
         b.body_text
       FROM messages m
       JOIN mailbox_accounts a ON a.id = m.account_id
       LEFT JOIN message_bodies b ON b.message_id = m.id
       WHERE m.account_id = ? AND a.user_id = ?
       ORDER BY m.received_at DESC
       LIMIT ?`,
    ).all(accountId, userId, safeLimit) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: String(row.id),
      accountId: String(row.account_id),
      folderId: String(row.folder_id),
      remoteMessageId: String(row.remote_message_id),
      subject: row.subject ? String(row.subject) : '(no subject)',
      fromAddress: row.from_address ? String(row.from_address) : null,
      toAddress: row.to_address ? String(row.to_address) : null,
      receivedAt: row.received_at ? String(row.received_at) : null,
      snippet: row.snippet ? String(row.snippet) : null,
      bodyText: row.body_text ? String(row.body_text) : null,
    }))
  }
  finally {
    db.close()
  }
}

export async function purgeStubMessagesForAccount(accountId: string): Promise<number> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const marker = 'This is a Phase 2 sync stub message%'

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')

      const messageIdsResult = await client.query(
        `SELECT m.id
         FROM messages m
         JOIN message_bodies b ON b.message_id = m.id
         WHERE m.account_id = $1
           AND b.body_text LIKE $2`,
        [accountId, marker],
      )
      const messageIds = messageIdsResult.rows.map((row) => String(row.id))

      if (messageIds.length === 0) {
        await client.query('COMMIT')
        return 0
      }

      await client.query('DELETE FROM message_bodies WHERE message_id = ANY($1::text[])', [messageIds])
      await client.query('DELETE FROM messages WHERE id = ANY($1::text[])', [messageIds])

      await client.query(
        `DELETE FROM threads t
         WHERE t.account_id = $1
           AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id)`,
        [accountId],
      )

      await client.query('COMMIT')
      return messageIds.length
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

    const rows = db.prepare(
      `SELECT m.id
       FROM messages m
       JOIN message_bodies b ON b.message_id = m.id
       WHERE m.account_id = ?
         AND b.body_text LIKE ?`,
    ).all(accountId, marker) as Array<Record<string, unknown>>

    const ids = rows.map((row) => String(row.id))
    if (ids.length === 0) {
      db.exec('COMMIT')
      return 0
    }

    const placeholders = ids.map(() => '?').join(', ')
    db.prepare(`DELETE FROM message_bodies WHERE message_id IN (${placeholders})`).run(...ids)
    db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids)
    db.prepare(
      `DELETE FROM threads
       WHERE account_id = ?
         AND id NOT IN (SELECT DISTINCT thread_id FROM messages WHERE thread_id IS NOT NULL)`,
    ).run(accountId)

    db.exec('COMMIT')
    return ids.length
  }
  catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  finally {
    db.close()
  }
}