function stripDangerousTags(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?<\/embed>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
}

function stripDangerousAttributes(input: string): string {
  return input
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*'\s*javascript:[^']*'/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*\s*javascript:[^\s>]+/gi, ' $1="#"')
}

export function sanitizeEmailHtml(html: string): string {
  const normalized = String(html || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')

  const strippedTags = stripDangerousTags(normalized)
  const strippedAttributes = stripDangerousAttributes(strippedTags)
  return strippedAttributes.trim()
}
