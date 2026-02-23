export interface ApiSuccessEnvelope<T> {
  ok: true
  data: T
  meta?: Record<string, unknown>
}

export interface ApiErrorEnvelope {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export function successResponse<T>(data: T, meta?: Record<string, unknown>): ApiSuccessEnvelope<T> {
  return {
    ok: true,
    data,
    ...(meta ? { meta } : {}),
  }
}

export function errorResponse(code: string, message: string, details?: unknown): ApiErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  }
}
