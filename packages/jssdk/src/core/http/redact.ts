/**
 * Shallow redact for params that may contain credentials before they enter
 * any logger or error-rendering surface.
 *
 * Two callers today: `Http._sanitizeParams` (logger context) and
 * `AjaxError` constructor (stores `requestInfo.params` exposed by
 * `toJSON()` / `toString()`). Keeping a single source of truth means the
 * redaction list stays consistent across both.
 *
 * The walk is intentionally shallow — the SDK's REST payloads are flat
 * (`auth`, `password`, `token`, …) at the top level. Deep walking
 * arbitrary user payloads would be expensive and brittle; if a deeper
 * redact is ever needed, do it at the callsite.
 */

export const SENSITIVE_PARAM_KEYS: readonly string[] = [
  'auth',
  'password',
  'token',
  'secret',
  'access_token',
  'refresh_token'
]

export const REDACTED_PLACEHOLDER = '***REDACTED***'

/**
 * Returns a shallow copy of `params` with any known credential-bearing
 * key replaced by `REDACTED_PLACEHOLDER`. Non-object / null inputs are
 * returned as-is so callers don't have to pre-check.
 */
export function redactSensitiveParams<T>(params: T): T {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return params
  }
  const sanitized: Record<string, unknown> = { ...(params as Record<string, unknown>) }
  for (const key of SENSITIVE_PARAM_KEYS) {
    if (key in sanitized && sanitized[key]) {
      sanitized[key] = REDACTED_PLACEHOLDER
    }
  }
  return sanitized as T
}
