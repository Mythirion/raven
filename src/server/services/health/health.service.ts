import { probeDatabase } from '../../repositories/system.repository'

export interface HealthStatus {
  service: 'raven'
  status: 'ok' | 'degraded'
  timestamp: string
  checks: {
    api: {
      ok: boolean
    }
    database: {
      ok: boolean
      engine: 'sqlite' | 'postgres' | 'unknown'
      latencyMs: number
      error?: string
    }
    scheduler: {
      initialized: boolean
      mode: 'placeholder'
    }
  }
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const database = await probeDatabase()

  return {
    service: 'raven',
    status: database.ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      api: {
        ok: true,
      },
      database,
      scheduler: {
        initialized: true,
        mode: 'placeholder',
      },
    },
  }
}
