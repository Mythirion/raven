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

async function main() {
  const client = new SessionClient()

  const meUnauthed = await client.request('/api/auth/me')
  assert.equal(meUnauthed.status, 200)
  assert.equal(meUnauthed.json?.ok, true)
  assert.equal(meUnauthed.json?.data?.user, null)

  const listUnauthed = await client.request('/api/accounts')
  assert.equal(listUnauthed.status, 401)
  assert.equal(listUnauthed.json?.ok, false)
  assert.equal(listUnauthed.json?.error?.code, 'AUTH_UNAUTHORIZED')

  const user1Email = randomEmail('phase1-user1')
  const loginUser1 = await client.request('/api/auth/login', {
    method: 'POST',
    body: {
      email: user1Email,
      password: 'phase1-password',
    },
  })
  assert.equal(loginUser1.status, 200)
  assert.equal(loginUser1.json?.ok, true)
  assert.equal(loginUser1.json?.data?.user?.email, user1Email)
  assert.ok(loginUser1.json?.data?.csrfToken)
  const csrfUser1 = loginUser1.json.data.csrfToken

  const createNoCsrf = await client.request('/api/accounts', {
    method: 'POST',
    body: {
      providerLabel: 'No CSRF',
      emailAddress: 'no-csrf@example.test',
      imapHost: 'imap.example.test',
      imapPort: 993,
      imapTls: true,
      smtpHost: 'smtp.example.test',
      smtpPort: 465,
      smtpTls: true,
      secret: 'redacted',
    },
  })
  assert.equal(createNoCsrf.status, 403)
  assert.equal(createNoCsrf.json?.error?.code, 'CSRF_INVALID')

  const createInvalid = await client.request('/api/accounts', {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfUser1,
    },
    body: {
      providerLabel: '',
      emailAddress: 'invalid@example.test',
      imapHost: 'imap.example.test',
      imapPort: 993,
      imapTls: true,
      smtpHost: 'smtp.example.test',
      smtpPort: 465,
      smtpTls: true,
      secret: 'redacted',
    },
  })
  assert.equal(createInvalid.status, 400)
  assert.equal(createInvalid.json?.error?.code, 'VALIDATION_ERROR')

  const createdUser1 = await client.request('/api/accounts', {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfUser1,
    },
    body: {
      providerLabel: 'User1 Mailbox',
      emailAddress: 'user1-mailbox@example.test',
      imapHost: 'imap.example.test',
      imapPort: 993,
      imapTls: true,
      smtpHost: 'smtp.example.test',
      smtpPort: 465,
      smtpTls: true,
      secret: 'user1-secret',
    },
  })
  assert.equal(createdUser1.status, 200)
  assert.equal(createdUser1.json?.ok, true)
  const user1AccountId = createdUser1.json?.data?.account?.id
  assert.ok(user1AccountId)

  const listUser1 = await client.request('/api/accounts')
  assert.equal(listUser1.status, 200)
  assert.equal(listUser1.json?.ok, true)
  assert.ok(Array.isArray(listUser1.json?.data?.accounts))
  assert.ok(listUser1.json.data.accounts.find((row) => row.id === user1AccountId))

  const testUser1 = await client.request(`/api/accounts/${user1AccountId}/test`, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfUser1,
    },
  })
  assert.equal(testUser1.status, 200)
  assert.equal(testUser1.json?.ok, true)

  const patchUser1 = await client.request(`/api/accounts/${user1AccountId}`, {
    method: 'PATCH',
    headers: {
      'x-csrf-token': csrfUser1,
    },
    body: {
      providerLabel: 'User1 Mailbox Updated',
    },
  })
  assert.equal(patchUser1.status, 200)
  assert.equal(patchUser1.json?.ok, true)
  assert.equal(patchUser1.json?.data?.account?.providerLabel, 'User1 Mailbox Updated')

  const deleteUser1 = await client.request(`/api/accounts/${user1AccountId}`, {
    method: 'DELETE',
    headers: {
      'x-csrf-token': csrfUser1,
    },
  })
  assert.equal(deleteUser1.status, 200)
  assert.equal(deleteUser1.json?.ok, true)

  const logoutUser1 = await client.request('/api/auth/logout', {
    method: 'POST',
  })
  assert.equal(logoutUser1.status, 200)
  assert.equal(logoutUser1.json?.ok, true)

  const user2Email = randomEmail('phase1-user2')
  const loginUser2 = await client.request('/api/auth/login', {
    method: 'POST',
    body: {
      email: user2Email,
      password: 'phase1-password',
    },
  })
  assert.equal(loginUser2.status, 200)
  assert.equal(loginUser2.json?.ok, true)
  const csrfUser2 = loginUser2.json?.data?.csrfToken
  assert.ok(csrfUser2)

  const listUser2 = await client.request('/api/accounts')
  assert.equal(listUser2.status, 200)
  assert.equal(listUser2.json?.ok, true)
  assert.ok(Array.isArray(listUser2.json?.data?.accounts))
  assert.equal(listUser2.json.data.accounts.length, 0)

  const user2PatchDenied = await client.request(`/api/accounts/${user1AccountId}`, {
    method: 'PATCH',
    headers: {
      'x-csrf-token': csrfUser2,
    },
    body: {
      providerLabel: 'Should not apply',
    },
  })
  assert.equal(user2PatchDenied.status, 404)
  assert.equal(user2PatchDenied.json?.error?.code, 'ACCOUNT_NOT_FOUND')

  const user2DeleteDenied = await client.request(`/api/accounts/${user1AccountId}`, {
    method: 'DELETE',
    headers: {
      'x-csrf-token': csrfUser2,
    },
  })
  assert.equal(user2DeleteDenied.status, 404)
  assert.equal(user2DeleteDenied.json?.error?.code, 'ACCOUNT_NOT_FOUND')

  const user2TestDenied = await client.request(`/api/accounts/${user1AccountId}/test`, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfUser2,
    },
  })
  assert.equal(user2TestDenied.status, 404)
  assert.equal(user2TestDenied.json?.error?.code, 'ACCOUNT_NOT_FOUND')

  const logoutUser2 = await client.request('/api/auth/logout', {
    method: 'POST',
  })
  assert.equal(logoutUser2.status, 200)
  assert.equal(logoutUser2.json?.ok, true)

  const auditList = await client.request('/api/ops/audit-events')
  assert.equal(auditList.status, 200)
  assert.equal(auditList.json?.ok, true)
  assert.ok(Array.isArray(auditList.json?.data?.events))

  const events = auditList.json.data.events.map((row) => row.eventType)
  for (const expected of [
    'auth.login.success',
    'auth.logout.success',
    'accounts.create.success',
    'accounts.update.success',
    'accounts.test.success',
    'accounts.delete.success',
  ]) {
    assert.ok(events.includes(expected), `Missing audit event: ${expected}`)
  }

  console.log('[phase1-regression] passed', {
    user1Email,
    user2Email,
    user1AccountId,
  })
}

main().catch((error) => {
  console.error('[phase1-regression] failed', error)
  process.exit(1)
})
