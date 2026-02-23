import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

export interface DbProbeResult {
  ok: boolean
  engine: 'sqlite' | 'postgres' | 'unknown'
  latencyMs: number
  error?: string
}

export async function probeDatabase(): Promise<DbProbeResult> {
  const config = useRuntimeConfig()
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const databaseUrl = env?.DATABASE_URL || (config.databaseUrl as string)
  const sqlitePath = env?.SQLITE_PATH || (config.sqlitePath as string) || '/data/app.db'
  const startedAt = Date.now()

  if (databaseUrl) {
    try {
      const { Client } = await import('pg')
      const client = new Client({ connectionString: databaseUrl })

      await client.connect()
      await client.query('SELECT 1')
      await client.end()

      return {
        ok: true,
        engine: 'postgres',
        latencyMs: Date.now() - startedAt,
      }
    }
    catch (error) {
      return {
        ok: false,
        engine: 'postgres',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown Postgres error',
      }
    }
  }

  try {
    mkdirSync(dirname(sqlitePath), { recursive: true })
    const Database = (await import('better-sqlite3')).default
    const db = new Database(sqlitePath)
    db.prepare('SELECT 1').get()
    db.close()

    return {
      ok: true,
      engine: 'sqlite',
      latencyMs: Date.now() - startedAt,
    }
  }
  catch (error) {
    return {
      ok: false,
      engine: 'sqlite',
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown SQLite error',
    }
  }
}
