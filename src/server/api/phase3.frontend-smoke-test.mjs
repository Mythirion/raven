import assert from 'node:assert/strict'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'

async function main() {
  const response = await fetch(`${baseUrl}/messages`)
  assert.equal(response.status, 200)

  const html = await response.text()
  assert.ok(html.includes('Message Workspace'), 'Messages workspace shell should render')
  assert.ok(html.includes('Bulk read'), 'Bulk action controls should render')
  assert.ok(html.includes('Select visible'), 'Selection toolbar should render')
  assert.ok(html.includes('Back to list'), 'Mobile detail back control should render')
  assert.ok(html.includes('HTML (sanitized)'), 'Detail mode toggle should render')
  assert.ok(!html.includes('>Open<'), 'Explicit Open button should not render in message list')

  console.log('[phase3-frontend-smoke] passed')
}

main().catch((error) => {
  console.error('[phase3-frontend-smoke] failed', error)
  process.exit(1)
})
