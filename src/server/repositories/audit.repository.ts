export interface AuditEventInput {
  userId: string | null
  eventType: string
  resourceType: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
}

export interface AuditEventRecord {
  id: string
  userId: string | null
  eventType: string
  resourceType: string
  resourceId: string | null
  metadataJson: string | null
  createdAt: string
}

type RuntimeConfigLike = {
  databaseUrl?: string
  sqlitePath?: string
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

export async function createAuditEvent(input: AuditEventInput): Promise<void> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query(
        `INSERT INTO audit_events (id, user_id, event_type, resource_type, resource_id, metadata_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, input.userId, input.eventType, input.resourceType, input.resourceId || null, metadataJson, now],
      )
    }
    finally {
      await client.end()
    }

    return
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    db.prepare(
      `INSERT INTO audit_events (id, user_id, event_type, resource_type, resource_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.userId, input.eventType, input.resourceType, input.resourceId || null, metadataJson, now)
  }
  finally {
    db.close()
  }
}

function mapAuditEvent(row: Record<string, unknown> | undefined): AuditEventRecord | null {
  if (!row) {
    return null
  }

  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    eventType: String(row.event_type),
    resourceType: String(row.resource_type),
    resourceId: row.resource_id ? String(row.resource_id) : null,
    metadataJson: row.metadata_json ? String(row.metadata_json) : null,
    createdAt: String(row.created_at),
  }
}

export async function listRecentAuditEvents(limit = 100): Promise<AuditEventRecord[]> {
  const { databaseUrl, sqlitePath } = resolveDbConfig()
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)))

  if (databaseUrl) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        `SELECT id, user_id, event_type, resource_type, resource_id, metadata_json, created_at
         FROM audit_events
         ORDER BY created_at DESC
         LIMIT $1`,
        [safeLimit],
      )
      return result.rows
        .map((row: unknown) => mapAuditEvent(row as Record<string, unknown>))
        .filter((row: AuditEventRecord | null): row is AuditEventRecord => row !== null)
    }
    finally {
      await client.end()
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)
  try {
    const rows = db.prepare(
      `SELECT id, user_id, event_type, resource_type, resource_id, metadata_json, created_at
       FROM audit_events
       ORDER BY created_at DESC
       LIMIT ?`,
    ).all(safeLimit) as Record<string, unknown>[]

    return rows
      .map((row) => mapAuditEvent(row))
      .filter((row): row is AuditEventRecord => row !== null)
  }
  finally {
    db.close()
  }
}
