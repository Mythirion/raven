import Database from 'better-sqlite3'

function decodeHtmlEntities(input) {
  let value = String(input || '')

  // Decode in passes so doubly-encoded entities like &amp;lt; become <.
  for (let i = 0; i < 3; i += 1) {
    const next = value
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")

    if (next === value) {
      break
    }
    value = next
  }

  return value
}

function stripDangerousTags(input) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?<\/embed>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
}

function stripDangerousAttributes(input) {
  return input
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*'\s*javascript:[^']*'/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*\s*javascript:[^\s>]+/gi, ' $1="#"')
}

function sanitizeEmailHtml(html) {
  const normalized = String(html || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
  return stripDangerousAttributes(stripDangerousTags(normalized)).trim()
}

function repairEscapedHtml(value) {
  const raw = String(value || '')
  if (!raw || raw.indexOf('&lt;') < 0) {
    return null
  }

  const withNewlines = raw.replace(/<br\s*\/?>/gi, '\n')
  const decoded = decodeHtmlEntities(withNewlines)
  const repaired = sanitizeEmailHtml(decoded)
  return repaired && repaired !== raw ? repaired : null
}

const sqlitePath = process.env.SQLITE_PATH || '/data/app.db'
const db = new Database(sqlitePath)

try {
  const rows = db.prepare(`
    SELECT id, body_html_sanitized
    FROM message_bodies
    WHERE body_html_sanitized IS NOT NULL
      AND body_html_sanitized LIKE '%&lt;%'
  `).all()

  let updated = 0
  const now = new Date().toISOString()
  const update = db.prepare('UPDATE message_bodies SET body_html_sanitized = ?, updated_at = ? WHERE id = ?')

  const tx = db.transaction(() => {
    for (const row of rows) {
      const repaired = repairEscapedHtml(row.body_html_sanitized)
      if (!repaired) {
        continue
      }
      update.run(repaired, now, row.id)
      updated += 1
    }
  })

  tx()
  console.log(JSON.stringify({ scanned: rows.length, updated }))
}
finally {
  db.close()
}
