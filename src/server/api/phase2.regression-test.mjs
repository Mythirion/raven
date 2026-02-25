import assert from 'node:assert/strict'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'

function randomEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`
}

function parseCookiePair(setCookieValue) {
  const firstChunk = setCookieValue.split(';')[0] || ''
  const index = firstChunk.indexOf('=')
  if (index <= 0) {
    return null
  }

  const name = firstChunk.slice(0, index).trim()
  const value = firstChunk.slice(index + 1).trim()
  if (!name) {
    return null
  }

  return { name, value }
}

class SessionClient {
  constructor() {
    this.cookies = new Map()
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  absorbCookies(response) {
    const setCookieValues = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : [])

    for (const setCookieValue of setCookieValues) {
      if (!setCookieValue) {
        continue
      }

      const pair = parseCookiePair(setCookieValue)
      if (!pair) {
        continue
      }

      this.cookies.set(pair.name, pair.value)
    }
  }

  async request(path, options = {}) {
    const headers = {
      'content-type': 'application/json',
      ...(options.headers || {}),
    }

    const cookie = this.cookieHeader()
    if (cookie) {
      headers.cookie = cookie
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    this.absorbCookies(response)

    const text = await response.text()
    let json
    try {
      json = text ? JSON.parse(text) : null
    }
    catch {
      json = null
    }

    return {
      status: response.status,
      json,
    }
  }
}

async function login(client, prefix) {
  const email = randomEmail(prefix)
  const response = await client.request('/api/auth/login', {
    method: 'POST',
    body: {
      email,
      password: 'phase2-password',
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.json?.ok, true)
  assert.ok(response.json?.data?.csrfToken)

  return {
    email,
    csrfToken: response.json.data.csrfToken,
  }
}

async function createAccount(client, csrfToken, label) {
  const response = await client.request('/api/accounts', {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfToken,
    },
    body: {
      providerLabel: label,
      emailAddress: `${label.toLowerCase().replace(/\s+/g, '-')}.mailbox@example.test`,
      imapHost: 'imap.example.test',
      imapPort: 993,
      imapTls: true,
      smtpHost: 'smtp.example.test',
      smtpPort: 465,
      smtpTls: true,
      secret: 'phase2-secret',
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.json?.ok, true)
  assert.ok(response.json?.data?.account?.id)
  return response.json.data.account.id
}

async function deleteAccountWithRetry(client, csrfToken, accountId, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await client.request(`/api/accounts/${accountId}`, {
      method: 'DELETE',
      headers: {
        'x-csrf-token': csrfToken,
      },
    })

    if (response.status === 200) {
      assert.equal(response.json?.ok, true)
      return {
        status: 200,
        retries: i,
      }
    }

    const code = response.json?.error?.code
    if (response.status === 503 && code === 'ACCOUNT_DELETE_BUSY') {
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)))
      continue
    }

    assert.fail(`Unexpected delete response: ${response.status} ${JSON.stringify(response.json)}`)
  }

  assert.fail('Delete did not succeed within retry budget')
}

async function main() {
  const user1 = new SessionClient()
  const auth1 = await login(user1, 'phase2-user1')
  const user1AccountId = await createAccount(user1, auth1.csrfToken, 'Phase2 User1')

  const preSyncStatus = await user1.request('/api/ops/sync-status')
  assert.equal(preSyncStatus.status, 200)
  assert.equal(preSyncStatus.json?.ok, true)

  const syncRun = await user1.request(`/api/accounts/${user1AccountId}/sync`, {
    method: 'POST',
    headers: {
      'x-csrf-token': auth1.csrfToken,
    },
  })
  assert.ok([200, 401, 409, 500, 503].includes(syncRun.status))
  if (syncRun.status === 200) {
    assert.equal(syncRun.json?.ok, true)
    assert.ok(syncRun.json?.data?.summary?.syncedFolders >= 0)
  }
  else {
    assert.equal(syncRun.json?.ok, false)
    assert.ok([
      'SYNC_TRANSIENT_FAILURE',
      'SYNC_AUTH_FAILED',
      'SYNC_CURSOR_INVALID',
      'SYNC_PROVIDER_UNAVAILABLE',
    ].includes(syncRun.json?.error?.code))
  }

  const postSyncStatus = await user1.request('/api/ops/sync-status')
  assert.equal(postSyncStatus.status, 200)
  assert.equal(postSyncStatus.json?.ok, true)
  const ownStatus = (postSyncStatus.json?.data?.sync || []).find((row) => row.accountId === user1AccountId)
  assert.ok(ownStatus)
  assert.ok(['idle', 'retrying', 'failed'].includes(ownStatus.state))
  assert.ok(ownStatus.cursorCount >= 0)
  assert.ok(ownStatus.messageCount >= 0)
  assert.ok(ownStatus.lastAttemptedAt)

  const inspectMessages = await user1.request(`/api/accounts/${user1AccountId}/messages?limit=6`)
  assert.equal(inspectMessages.status, 200)
  assert.equal(inspectMessages.json?.ok, true)
  const inspected = inspectMessages.json?.data?.messages || []
  if (inspected.length > 0) {
    assert.ok(inspected[0].remoteMessageId)
    assert.ok(typeof (inspected[0].bodyText || '') === 'string')
  }

  const concurrentSyncPromise = user1.request(`/api/accounts/${user1AccountId}/sync`, {
    method: 'POST',
    headers: {
      'x-csrf-token': auth1.csrfToken,
    },
  })

  const deleteResult = await deleteAccountWithRetry(user1, auth1.csrfToken, user1AccountId)
  const concurrentSync = await concurrentSyncPromise
  assert.ok([200, 401, 404, 409, 500, 503].includes(concurrentSync.status))
  if ([401, 409, 500, 503].includes(concurrentSync.status)) {
    assert.ok([
      'SYNC_TRANSIENT_FAILURE',
      'SYNC_AUTH_FAILED',
      'SYNC_CURSOR_INVALID',
      'SYNC_PROVIDER_UNAVAILABLE',
    ].includes(concurrentSync.json?.error?.code))
  }

  const listAfterDelete = await user1.request('/api/accounts')
  assert.equal(listAfterDelete.status, 200)
  assert.equal(listAfterDelete.json?.ok, true)
  const stillThere = (listAfterDelete.json?.data?.accounts || []).find((row) => row.id === user1AccountId)
  assert.equal(stillThere, undefined)

  const inspectAfterDelete = await user1.request(`/api/accounts/${user1AccountId}/messages?limit=2`)
  assert.equal(inspectAfterDelete.status, 404)
  assert.equal(inspectAfterDelete.json?.error?.code, 'ACCOUNT_NOT_FOUND')

  const user2 = new SessionClient()
  const auth2 = await login(user2, 'phase2-user2')
  await createAccount(user2, auth2.csrfToken, 'Phase2 User2')

  const deniedSync = await user2.request(`/api/accounts/${user1AccountId}/sync`, {
    method: 'POST',
    headers: {
      'x-csrf-token': auth2.csrfToken,
    },
  })
  assert.equal(deniedSync.status, 404)
  assert.equal(deniedSync.json?.error?.code, 'ACCOUNT_NOT_FOUND')

  const user2Status = await user2.request('/api/ops/sync-status')
  assert.equal(user2Status.status, 200)
  assert.equal(user2Status.json?.ok, true)
  const leaked = (user2Status.json?.data?.sync || []).find((row) => row.accountId === user1AccountId)
  assert.equal(leaked, undefined)

  const deniedInspect = await user2.request(`/api/accounts/${user1AccountId}/messages?limit=3`)
  assert.equal(deniedInspect.status, 404)
  assert.equal(deniedInspect.json?.error?.code, 'ACCOUNT_NOT_FOUND')

  console.log('[phase2-regression] passed', {
    user1: auth1.email,
    user2: auth2.email,
    user1AccountId,
    deleteResult,
  })
}

main().catch((error) => {
  console.error('[phase2-regression] failed', error)
  process.exit(1)
})
