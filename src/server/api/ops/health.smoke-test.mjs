const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'

async function main() {
  const response = await fetch(`${baseUrl}/api/ops/health`)
  if (!response.ok) {
    throw new Error(`Health endpoint returned non-200 status: ${response.status}`)
  }

  const payload = await response.json()

  if (!payload?.ok) {
    throw new Error('Health response envelope indicates failure')
  }

  if (!payload?.data?.checks?.database?.ok) {
    throw new Error('Database health check is not ok')
  }

  console.log('[smoke-test] health endpoint passed', {
    engine: payload.data.checks.database.engine,
    status: payload.data.status,
  })
}

main().catch((error) => {
  console.error('[smoke-test] failed', error)
  process.exit(1)
})
