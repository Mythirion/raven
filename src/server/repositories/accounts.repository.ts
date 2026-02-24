export interface AccountRecord {
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
  encryptedSecret: string
  createdAt: string
  updatedAt: string
}

export interface AccountMutationInput {
  providerLabel: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
  encryptedSecret: string
}

export interface AccountPatchInput extends Partial<AccountMutationInput> {}

function resolveDbConfig() {
  const config = useRuntimeConfig()
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env

  return {
    databaseUrl: env?.DATABASE_URL || (config.databaseUrl as string) || '',
    sqlitePath: env?.SQLITE_PATH || (config.sqlitePath as string) || '/data/app.db',
  }
}

function mapAccount(row: Record<string, unknown> | undefined): AccountRecord | null {
  if (!row) {
    return null
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    providerLabel: String(row.provider_label),
    emailAddress: String(row.email_address),
    imapHost: String(row.imap_host),
    imapPort: Number(row.imap_port),
    imapTls: Number(row.imap_tls) === 1,
    smtpHost: String(row.smtp_host),
    smtpPort: Number(row.smtp_port),
    smtpTls: Number(row.smtp_tls) === 1,
    encryptedSecret: String(row.encrypted_secret),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function listAccountsForUser(userId: string): Promise<AccountRecord[]> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query('SELECT * FROM mailbox_accounts WHERE user_id = $1 ORDER BY created_at DESC', [userId])
      return result.rows
        .map((row: unknown) => mapAccount(row as Record<string, unknown>))
        .filter((row: AccountRecord | null): row is AccountRecord => row !== null)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const rows = db.prepare('SELECT * FROM mailbox_accounts WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Record<string, unknown>[]
    return rows
      .map((row) => mapAccount(row))
      .filter((row): row is AccountRecord => row !== null)
  }
  finally {
    db.close()
  }
}

export async function findAccountByIdForUser(accountId: string, userId: string): Promise<AccountRecord | null> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query('SELECT * FROM mailbox_accounts WHERE id = $1 AND user_id = $2 LIMIT 1', [accountId, userId])
      return mapAccount(result.rows[0] as Record<string, unknown> | undefined)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const row = db
      .prepare('SELECT * FROM mailbox_accounts WHERE id = ? AND user_id = ? LIMIT 1')
      .get(accountId, userId) as Record<string, unknown> | undefined
    return mapAccount(row)
  }
  finally {
    db.close()
  }
}

export async function createAccountForUser(userId: string, input: AccountMutationInput): Promise<AccountRecord> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const now = new Date().toISOString()
  const accountId = crypto.randomUUID()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        `INSERT INTO mailbox_accounts (
          id, user_id, provider_label, email_address,
          imap_host, imap_port, imap_tls,
          smtp_host, smtp_port, smtp_tls,
          encrypted_secret, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13
        ) RETURNING *`,
        [
          accountId,
          userId,
          input.providerLabel,
          input.emailAddress,
          input.imapHost,
          input.imapPort,
          input.imapTls ? 1 : 0,
          input.smtpHost,
          input.smtpPort,
          input.smtpTls ? 1 : 0,
          input.encryptedSecret,
          now,
          now,
        ],
      )
      return mapAccount(result.rows[0] as Record<string, unknown>) as AccountRecord
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    db.prepare(
      `INSERT INTO mailbox_accounts (
        id, user_id, provider_label, email_address,
        imap_host, imap_port, imap_tls,
        smtp_host, smtp_port, smtp_tls,
        encrypted_secret, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      accountId,
      userId,
      input.providerLabel,
      input.emailAddress,
      input.imapHost,
      input.imapPort,
      input.imapTls ? 1 : 0,
      input.smtpHost,
      input.smtpPort,
      input.smtpTls ? 1 : 0,
      input.encryptedSecret,
      now,
      now,
    )

    const row = db.prepare('SELECT * FROM mailbox_accounts WHERE id = ? LIMIT 1').get(accountId) as Record<string, unknown>
    return mapAccount(row) as AccountRecord
  }
  finally {
    db.close()
  }
}

export async function updateAccountForUser(accountId: string, userId: string, input: AccountPatchInput): Promise<AccountRecord | null> {
  const existing = await findAccountByIdForUser(accountId, userId)
  if (!existing) {
    return null
  }

  const next: AccountMutationInput = {
    providerLabel: input.providerLabel ?? existing.providerLabel,
    emailAddress: input.emailAddress ?? existing.emailAddress,
    imapHost: input.imapHost ?? existing.imapHost,
    imapPort: input.imapPort ?? existing.imapPort,
    imapTls: input.imapTls ?? existing.imapTls,
    smtpHost: input.smtpHost ?? existing.smtpHost,
    smtpPort: input.smtpPort ?? existing.smtpPort,
    smtpTls: input.smtpTls ?? existing.smtpTls,
    encryptedSecret: input.encryptedSecret ?? existing.encryptedSecret,
  }

  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const now = new Date().toISOString()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        `UPDATE mailbox_accounts
         SET provider_label = $1,
             email_address = $2,
             imap_host = $3,
             imap_port = $4,
             imap_tls = $5,
             smtp_host = $6,
             smtp_port = $7,
             smtp_tls = $8,
             encrypted_secret = $9,
             updated_at = $10
         WHERE id = $11 AND user_id = $12
         RETURNING *`,
        [
          next.providerLabel,
          next.emailAddress,
          next.imapHost,
          next.imapPort,
          next.imapTls ? 1 : 0,
          next.smtpHost,
          next.smtpPort,
          next.smtpTls ? 1 : 0,
          next.encryptedSecret,
          now,
          accountId,
          userId,
        ],
      )
      return mapAccount(result.rows[0] as Record<string, unknown> | undefined)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    db.prepare(
      `UPDATE mailbox_accounts
       SET provider_label = ?,
           email_address = ?,
           imap_host = ?,
           imap_port = ?,
           imap_tls = ?,
           smtp_host = ?,
           smtp_port = ?,
           smtp_tls = ?,
           encrypted_secret = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      next.providerLabel,
      next.emailAddress,
      next.imapHost,
      next.imapPort,
      next.imapTls ? 1 : 0,
      next.smtpHost,
      next.smtpPort,
      next.smtpTls ? 1 : 0,
      next.encryptedSecret,
      now,
      accountId,
      userId,
    )

    const row = db.prepare('SELECT * FROM mailbox_accounts WHERE id = ? AND user_id = ? LIMIT 1').get(accountId, userId) as Record<string, unknown> | undefined
    return mapAccount(row)
  }
  finally {
    db.close()
  }
}

export async function deleteAccountForUser(accountId: string, userId: string): Promise<boolean> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query('DELETE FROM mailbox_accounts WHERE id = $1 AND user_id = $2', [accountId, userId])
      return (result.rowCount || 0) > 0
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const result = db.prepare('DELETE FROM mailbox_accounts WHERE id = ? AND user_id = ?').run(accountId, userId)
    return result.changes > 0
  }
  finally {
    db.close()
  }
}
