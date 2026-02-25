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
      password: 'phase3-password',
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
      secret: 'phase3-secret',
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.json?.ok, true)
  assert.ok(response.json?.data?.account?.id)
  return response.json.data.account.id
}

async function syncAccount(client, csrfToken, accountId) {
  const response = await client.request(`/api/accounts/${accountId}/sync`, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfToken,
    },
  })

  assert.ok([200, 401, 409, 500, 503].includes(response.status))
  if (response.status !== 200) {
    assert.ok([
      'SYNC_TRANSIENT_FAILURE',
      'SYNC_AUTH_FAILED',
      'SYNC_CURSOR_INVALID',
      'SYNC_PROVIDER_UNAVAILABLE',
    ].includes(response.json?.error?.code))
  }
}

async function ensureMessages(client, accountId) {
  const list = await client.request(`/api/messages?accountId=${accountId}&limit=25`)
  assert.equal(list.status, 200)
  assert.equal(list.json?.ok, true)

  const items = list.json?.data?.messages || []
  if (items.length > 0) {
    return { list, items }
  }

  // fallback to phase2 inspect endpoint if list is empty in this run
  const inspect = await client.request(`/api/accounts/${accountId}/messages?limit=25`)
  assert.equal(inspect.status, 200)
  assert.equal(inspect.json?.ok, true)
  const inspected = inspect.json?.data?.messages || []
  if (inspected.length === 0) {
    return { list, items: [] }
  }

  return { list, items: inspected }
}

async function assertFolderFilters(client, accountId) {
  const filters = ['inbox', 'sent', 'drafts', 'archive', 'trash']

  for (const folderId of filters) {
    const response = await client.request(`/api/messages?accountId=${accountId}&folderId=${folderId}&limit=25`)
    assert.equal(response.status, 200)
    assert.equal(response.json?.ok, true)

    const count = (response.json?.data?.messages || []).length
    assert.ok(count > 0, `Expected folder filter '${folderId}' to return messages`) 
  }
}

async function main() {
  const user1 = new SessionClient()
  const auth1 = await login(user1, 'phase3-user1')
  const user1AccountId = await createAccount(user1, auth1.csrfToken, 'Phase3 User1')
  await syncAccount(user1, auth1.csrfToken, user1AccountId)

  const seed = await ensureMessages(user1, user1AccountId)
  const messages = seed.items || []
  assert.ok(messages.length > 0, 'Expected synced messages for phase3 regression')

  await assertFolderFilters(user1, user1AccountId)

  const target = messages[0]
  assert.ok(target.id)

  const detail = await user1.request(`/api/messages/${target.id}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.json?.ok, true)
  assert.equal(detail.json?.data?.message?.id, target.id)
  assert.ok(
    String(detail.json?.data?.message?.bodyText || '').includes('This is a Phase 2 sync stub message'),
    'Expected message detail to include body content',
  )

  const markRead = await user1.request(`/api/messages/${target.id}/actions`, {
    method: 'POST',
    headers: {
      'x-csrf-token': auth1.csrfToken,
    },
    body: {
      action: 'mark_read',
    },
  })
  assert.equal(markRead.status, 200)
  assert.equal(markRead.json?.ok, true)
  assert.equal(markRead.json?.data?.result?.messageId, target.id)
  assert.equal(markRead.json?.data?.result?.updated, true)

  const missingCsrfSingle = await user1.request(`/api/messages/${target.id}/actions`, {
    method: 'POST',
    body: {
      action: 'mark_unread',
    },
  })
  assert.equal(missingCsrfSingle.status, 403)
  assert.equal(missingCsrfSingle.json?.error?.code, 'CSRF_INVALID')

  const invalidSingleAction = await user1.request(`/api/messages/${target.id}/actions`, {
    method: 'POST',
    headers: {
      'x-csrf-token': auth1.csrfToken,
    },
    body: {
      action: 'definitely_not_real',
    },
  })
  assert.equal(invalidSingleAction.status, 400)
  assert.equal(invalidSingleAction.json?.error?.code, 'MESSAGE_ACTION_INVALID')

  const moveMissingTarget = await user1.request(`/api/messages/${target.id}/actions`, {
    method: 'POST',
    headers: {
      'x-csrf-token': auth1.csrfToken,
    },
    body: {
      action: 'move',
    },
  })
  assert.equal(moveMissingTarget.status, 400)
  assert.equal(moveMissingTarget.json?.error?.code, 'MESSAGE_TARGET_FOLDER_REQUIRED')

  const bulk = await user1.request('/api/messages/actions/bulk', {
    method: 'POST',
    headers: {
      'x-csrf-token': auth1.csrfToken,
    },
    body: {
      action: 'star',
      messageIds: messages.slice(0, 3).map((m) => m.id),
    },
  })
  assert.equal(bulk.status, 200)
  assert.equal(bulk.json?.ok, true)
  assert.ok(bulk.json?.data?.result?.requested >= 1)
  assert.ok(bulk.json?.data?.result?.updated >= 1)

  const missingCsrfBulk = await user1.request('/api/messages/actions/bulk', {
    method: 'POST',
    body: {
      action: 'star',
      messageIds: [target.id],
    },
  })
  assert.equal(missingCsrfBulk.status, 403)
  assert.equal(missingCsrfBulk.json?.error?.code, 'CSRF_INVALID')

  const emptyBulk = await user1.request('/api/messages/actions/bulk', {
    method: 'POST',
    headers: {
      'x-csrf-token': auth1.csrfToken,
    },
    body: {
      action: 'star',
      messageIds: [],
    },
  })
  assert.equal(emptyBulk.status, 400)
  assert.equal(emptyBulk.json?.error?.code, 'MESSAGE_BULK_EMPTY')

  const user2 = new SessionClient()
  const auth2 = await login(user2, 'phase3-user2')

  const deniedDetail = await user2.request(`/api/messages/${target.id}`)
  assert.equal(deniedDetail.status, 404)
  assert.equal(deniedDetail.json?.error?.code, 'MESSAGE_NOT_FOUND')

  const deniedSingleAction = await user2.request(`/api/messages/${target.id}/actions`, {
    method: 'POST',
    headers: {
      'x-csrf-token': auth2.csrfToken,
    },
    body: {
      action: 'mark_unread',
    },
  })
  assert.equal(deniedSingleAction.status, 404)
  assert.equal(deniedSingleAction.json?.error?.code, 'MESSAGE_NOT_FOUND')

  const deniedBulkAction = await user2.request('/api/messages/actions/bulk', {
    method: 'POST',
    headers: {
      'x-csrf-token': auth2.csrfToken,
    },
    body: {
      action: 'delete',
      messageIds: [target.id],
    },
  })
  assert.equal(deniedBulkAction.status, 200)
  assert.equal(deniedBulkAction.json?.ok, true)
  assert.equal(deniedBulkAction.json?.data?.result?.updated, 0)

  console.log('[phase3-regression] passed', {
    user1: auth1.email,
    user2: auth2.email,
    user1AccountId,
    targetMessageId: target.id,
  })
}

main().catch((error) => {
  console.error('[phase3-regression] failed', error)
  process.exit(1)
})
