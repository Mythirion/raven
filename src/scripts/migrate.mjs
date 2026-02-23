import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(scriptDir, '..', 'db', 'migrations')
const databaseUrl = process.env.DATABASE_URL || ''
const sqlitePath = process.env.SQLITE_PATH || '/data/app.db'

function getMigrationFiles() {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`)
  }

  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

async function runPostgresMigrations(files) {
  const { Client } = await import('pg')
  const client = new Client({ connectionString: databaseUrl })

  await client.connect()
  try {
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      await client.query(sql)
      console.log(`[migrate] applied postgres migration: ${file}`)
    }
  }
  finally {
    await client.end()
  }
}

async function runSqliteMigrations(files) {
  mkdirSync(dirname(sqlitePath), { recursive: true })

  const Database = (await import('better-sqlite3')).default
  const db = new Database(sqlitePath)

  try {
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      db.exec(sql)
      console.log(`[migrate] applied sqlite migration: ${file}`)
    }
  }
  finally {
    db.close()
  }
}

async function main() {
  const files = getMigrationFiles()

  if (files.length === 0) {
    console.log('[migrate] no migrations found')
    return
  }

  if (databaseUrl) {
    await runPostgresMigrations(files)
  }
  else {
    await runSqliteMigrations(files)
  }

  console.log('[migrate] completed')
}

main().catch((error) => {
  console.error('[migrate] failed', error)
  process.exit(1)
})
