import { probeDatabase } from '../../repositories/system.repository'
import { ensureSyncSchedulerInitialized, getSyncSchedulerState } from '../sync/sync.service'
import { getSyncAdapterMode } from '../sync/adapters'

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
      mode: 'active' | 'disabled'
    }
    sync: {
      adapterMode: 'stub' | 'imap'
    }
  }
}

export async function getHealthStatus(): Promise<HealthStatus> {
  ensureSyncSchedulerInitialized()
  const database = await probeDatabase()
  const scheduler = getSyncSchedulerState()
  const adapterMode = getSyncAdapterMode()

  return {
    service: 'raven',
    status: database.ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      api: {
        ok: true,
      },
      database,
      scheduler,
      sync: {
        adapterMode,
      },
    },
  }
}
