type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function resolveLogLevel(): LogLevel {
  const config = useRuntimeConfig()
  const candidate = (config.logLevel || 'info').toLowerCase()
  if (candidate === 'debug' || candidate === 'info' || candidate === 'warn' || candidate === 'error') {
    return candidate
  }

  return 'info'
}

function shouldLog(target: LogLevel): boolean {
  const configured = resolveLogLevel()
  return levelRank[target] >= levelRank[configured]
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload))
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
}
