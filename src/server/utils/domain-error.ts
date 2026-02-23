export class DomainError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly details?: unknown

  constructor(code: string, message: string, statusCode = 500, details?: unknown) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export function normalizeError(error: unknown): {
  statusCode: number
  code: string
  message: string
  details?: unknown
} {
  if (error instanceof DomainError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    }
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: error.message,
    }
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unknown error occurred',
  }
}
