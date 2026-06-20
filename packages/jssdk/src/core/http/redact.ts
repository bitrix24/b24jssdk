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
 * Two complementary passes run over each value:
 *   1. Key match — a property whose (lower-cased) name is in
 *      {@link SENSITIVE_PARAM_KEYS} has its whole value replaced, so a nested
 *      credential object (e.g. `auth: { application_token }`) is masked
 *      wholesale (#151).
 *   2. Query-string scrub — a *string* value is scanned for
 *      `<sensitive-key>=<value>` pairs and the value is masked. This catches the
 *      batch `cmd[i]` shape (`method?auth=<token>&...`) where `_prepareParams`
 *      has already serialised the credential into text the key walk can't see
 *      (#229).
 *
 * The object walk descends two levels into nested objects and arrays — the
 * minimum that covers batch payloads (`{ cmd: [{ method, params:
 * { ...credentials... } }, ...] }`) and flat one-level-nested payloads like
 * `{ data: { token } }`.
 *
 * Residual risk (documented, accepted):
 *   - credential keys nested deeper than two object levels are NOT masked —
 *     redact at the callsite for those;
 *   - the query-string scrub only masks a `key=value` pair whose key is itself
 *     a sensitive key; a bracketed/encoded query key (`auth[application_token]=`)
 *     is not matched by the string pass (its `auth` prefix object form is,
 *     though, via pass 1).
 *   - `key` is deliberately broad: any property literally named `key` (and any
 *     `?key=…` query pair) is masked. In Bitrix24 REST `key` is a credential
 *     parameter (e.g. the Pull shared config), so this is a conservative,
 *     accepted trade-off — it can over-redact a non-credential field that
 *     happens to be named `key`.
 *   - empty / nullish values are still treated as sensitive — an empty
 *     `access_token` is unusual but not safe to leave un-redacted.
 */

export const SENSITIVE_PARAM_KEYS: readonly string[] = [
  'auth',
  'password',
  'token',
  'secret',
  'access_token',
  'refresh_token',
  'client_secret',
  'application_token',
  'sessid',
  'key',
  'signature'
]

export const REDACTED_PLACEHOLDER = '***REDACTED***'

// Matches `<sep><sensitive-key>=<value>` inside a string, case-insensitively,
// and masks the value. The `([?&]|^)` prefix anchors to a real query-param
// boundary so a credential name appearing inside a value (`foo=token=x`) or as
// the tail of a longer key (`access_token` vs `token`) is not mis-matched. The
// value runs to the next `&`, `#`, or `;`, so a `;`-separated adjacent param is
// not swallowed into the redacted span. An embedded `?token=…` inside a nested
// URL value IS masked (intended — still a credential). Single-line: `^` carries
// no `m` flag, so a credential after a newline in a multi-line string value is
// not caught (accepted residual risk, same class as encoded/bracketed keys).
const QS_SENSITIVE_RE = new RegExp(
  `([?&]|^)(${SENSITIVE_PARAM_KEYS.join('|')})=[^&#;]*`,
  'gi'
)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function redactQueryString(value: string): string {
  if (!value.includes('=')) return value
  return value.replace(
    QS_SENSITIVE_RE,
    (_match, sep: string, key: string) => `${sep}${key}=${REDACTED_PLACEHOLDER}`
  )
}

// String scrubbing runs before the `depth <= 0` guard on purpose: scanning a
// string is cheap and bounded, so a serialised credential is masked even at a
// level the object walk would stop descending into. Arrays do not consume a
// depth slot (only object descent decrements `depth`), so an array nested in an
// array is still walked.
function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return redactQueryString(value)
  if (depth <= 0) return value
  if (isPlainObject(value)) return redactObject(value, depth - 1)
  if (Array.isArray(value)) return value.map(item => redactValue(item, depth))
  return value
}

function redactObject(
  source: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...source }
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_PARAM_KEYS.includes(key.toLowerCase())) {
      sanitized[key] = REDACTED_PLACEHOLDER
      continue
    }
    sanitized[key] = redactValue(sanitized[key], depth)
  }
  return sanitized
}

const DEFAULT_REDACT_DEPTH = 2

/**
 * Returns a copy of `params` with any known credential-bearing key replaced by
 * `REDACTED_PLACEHOLDER`, and any credential value embedded in a query-string
 * value masked in place. Walks up to two levels into nested objects/arrays so
 * batch-shaped payloads (`cmd[i].params.<key>` and `cmd[i]` query strings) are
 * covered. Non-object inputs are returned as-is so callers don't have to
 * pre-check.
 */
export function redactSensitiveParams(
  params: Record<string, unknown>
): Record<string, unknown>
export function redactSensitiveParams<T>(params: T): T
export function redactSensitiveParams(params: unknown): unknown {
  if (!isPlainObject(params)) return params
  return redactObject(params, DEFAULT_REDACT_DEPTH)
}

/**
 * Redact credential query-string values in a URL string — e.g. a Pull
 * `connectionPath` surfaced by `getDebugInfo()`. Masks every
 * {@link SENSITIVE_PARAM_KEYS} value plus any caller-supplied `extraKeys`
 * (e.g. Pull's `CHANNEL_ID`, a private identifier that is not a global
 * credential key). `extraKeys` are regex-escaped, so any literal key name is
 * safe to pass. Anchored and bounded exactly like the in-object scrub, so a
 * value-position `=` and non-query strings are left intact. Non-string input is
 * returned unchanged (a defensive guard for untyped JS callers).
 */
export function redactSensitiveUrl(url: string, extraKeys: readonly string[] = []): string {
  if (typeof url !== 'string' || !url.includes('=')) return url
  if (extraKeys.length === 0) return redactQueryString(url)
  const escaped = extraKeys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(
    `([?&]|^)(${[...SENSITIVE_PARAM_KEYS, ...escaped].join('|')})=[^&#;]*`,
    'gi'
  )
  return url.replace(re, (_match, sep: string, key: string) => `${sep}${key}=${REDACTED_PLACEHOLDER}`)
}
