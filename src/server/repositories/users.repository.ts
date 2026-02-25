export interface UserRecord {
  id: string
  email: string
  passwordHash: string
  displayName: string | null
  createdAt: string
  updatedAt: string
}

export interface UserIdentityRecord {
  id: string
  email: string
}

interface NewUserInput {
  email: string
  passwordHash: string
  displayName?: string | null
}

function resolveDbConfig() {
  const config = useRuntimeConfig()
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env

  return {
    databaseUrl: env?.DATABASE_URL || (config.databaseUrl as string) || '',
    sqlitePath: env?.SQLITE_PATH || (config.sqlitePath as string) || '/data/app.db',
  }
}

function mapSqliteUser(row: Record<string, unknown> | undefined): UserRecord | null {
  if (!row) {
    return null
  }

  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    displayName: row.display_name ? String(row.display_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapPostgresUser(row: Record<string, unknown> | undefined): UserRecord | null {
  if (!row) {
    return null
  }

  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    displayName: row.display_name ? String(row.display_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function countUsers(): Promise<number> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query('SELECT COUNT(*)::int AS count FROM users')
      return Number(result.rows[0]?.count || 0)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const result = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count?: number } | undefined
    return Number(result?.count || 0)
  }
  finally {
    db.close()
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email])
      return mapPostgresUser(result.rows[0] as Record<string, unknown> | undefined)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const row = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email) as Record<string, unknown> | undefined
    return mapSqliteUser(row)
  }
  finally {
    db.close()
  }
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id])
      return mapPostgresUser(result.rows[0] as Record<string, unknown> | undefined)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const row = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(id) as Record<string, unknown> | undefined
    return mapSqliteUser(row)
  }
  finally {
    db.close()
  }
}

export async function createUser(input: NewUserInput): Promise<UserRecord> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const now = new Date().toISOString()
  const userId = crypto.randomUUID()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, input.email, input.passwordHash, input.displayName || null, now, now],
      )
      return mapPostgresUser(result.rows[0] as Record<string, unknown>) as UserRecord
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, input.email, input.passwordHash, input.displayName || null, now, now)

    const row = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(userId) as Record<string, unknown>
    return mapSqliteUser(row) as UserRecord
  }
  finally {
    db.close()
  }
}

export async function listUsers(): Promise<UserIdentityRecord[]> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query('SELECT id, email FROM users ORDER BY created_at ASC')
      return result.rows.map((row) => ({
        id: String(row.id),
        email: String(row.email),
      }))
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const rows = db.prepare('SELECT id, email FROM users ORDER BY created_at ASC').all() as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
    }))
  }
  finally {
    db.close()
  }
}
