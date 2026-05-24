/**
 * Bounded-depth redact for params that may contain credentials before they
 * enter any logger or error-rendering surface.
 *
 * Callers: `Http._sanitizeParams` (logger context), `_makeAxiosRequest`
 * (`post/send` and `post/catchError` info logs), `AjaxError` constructor
 * (stores `requestInfo.params` exposed by `toJSON()` / `toString()`).
 * Keeping a single source of truth means the redaction list stays
 * consistent across all of them.
 *
 * The walk descends two levels into nested objects and arrays. That is
 * the minimum that covers batch payloads (`{ cmd: [{ method, params:
 * { ...credentials... } }, ...] }`) where the credential lives at
 * `cmd[i].params.<key>`, as well as flat one-level-nested payloads like
 * `{ data: { token } }`. Deeper walks risk arbitrary cost on
 * user-supplied trees and brittle false positives; two levels is the
 * documented contract — beyond that, redact at the callsite.
 *
 * Empty / nullish values are still considered sensitive — an empty
 * `access_token` is unusual but not safe to leave un-redacted.
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function redactObject(
  source: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...source }
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_PARAM_KEYS.includes(key)) {
      sanitized[key] = REDACTED_PLACEHOLDER
      continue
    }
    if (depth <= 0) continue
    const child = sanitized[key]
    if (isPlainObject(child)) {
      sanitized[key] = redactObject(child, depth - 1)
    } else if (Array.isArray(child)) {
      sanitized[key] = child.map(item =>
        isPlainObject(item) ? redactObject(item, depth - 1) : item
      )
    }
  }
  return sanitized
}

const DEFAULT_REDACT_DEPTH = 2

/**
 * Returns a copy of `params` with any known credential-bearing key
 * replaced by `REDACTED_PLACEHOLDER`. Walks up to two levels into nested
 * objects/arrays so batch-shaped payloads (`cmd[i].params.<key>`) are
 * covered. Non-object inputs are returned as-is so callers don't have
 * to pre-check.
 */
export function redactSensitiveParams(
  params: Record<string, unknown>
): Record<string, unknown>
export function redactSensitiveParams<T>(params: T): T
export function redactSensitiveParams(params: unknown): unknown {
  if (!isPlainObject(params)) return params
  return redactObject(params, DEFAULT_REDACT_DEPTH)
}
