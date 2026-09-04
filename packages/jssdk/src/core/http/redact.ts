/**
 * Bounded-depth redact for params that may contain credentials before they
 * enter any logger or error-rendering surface.
 *
 * Callers: `Http._sanitizeParams` (logger context), `_makeAxiosRequest`
 * (`post/send`, `post/response` and `post/catchError` info logs), `AjaxError`
 * constructor (stores `requestInfo.params` exposed by `toJSON()` /
 * `toString()`). Keeping a single source of truth means the redaction list
 * stays consistent across all of them.
 *
 * **This runs over response bodies, not only over request params.** The
 * `post/response` callsite passes `response.data.result` through here, so
 * whatever the portal chose to put in an answer is in scope — which is a wider
 * remit than "parameters we sent" and is why pass 3 exists.
 *
 * Three complementary passes run over each value:
 *   1. Key match — a property whose (lower-cased) name is in
 *      {@link SENSITIVE_PARAM_KEYS} has its whole value replaced, so a nested
 *      credential object (e.g. `auth: { application_token }`) is masked
 *      wholesale (#151).
 *   2. Query-string scrub — a *string* value is scanned for
 *      `<sensitive-key>=<value>` pairs and the value is masked. This catches the
 *      batch `cmd[i]` shape (`method?auth=<token>&...`) where `_prepareParams`
 *      has already serialised the credential into text the key walk can't see
 *      (#229).
 *   3. Credential-in-path scrub — a *string* value is scanned for the Bitrix24
 *      incoming-webhook URL shape, `/rest/<userId>/<secret>/`, and the secret
 *      segment is masked. Neither of the passes above can see it: the secret is
 *      not a key, and it is not a `key=value` pair — it is a path segment. A
 *      webhook secret is a bearer credential with every scope of the webhook,
 *      no second factor and no expiry, so this is the same class of leak as
 *      #39 / #40 through a different door. It reaches a log because a portal
 *      method can *return* such a URL in its answer:
 *      `rest.deferredbatch.downloadresult` answers
 *      `{ result: { downloadUrl } }` whose path carries the calling webhook's
 *      own secret, measured on a cloud portal. That the portal does this at all
 *      is a platform question and goes to Bitrix24; that the SDK wrote it to an
 *      `info` record while reporting the line as redacted is ours.
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
 *   - `signature` is broad in the same way (added in #43 for the Pull channel
 *     HMAC, `TypeChanel.signature`): any property named `signature` and any
 *     `?signature=…` query pair is masked. In the Bitrix24 push/pull domain
 *     `signature` is the channel HMAC, so the breadth is accepted — at the cost
 *     of over-redacting a non-credential field that happens to be named so.
 *   - empty / nullish values are still treated as sensitive — an empty
 *     `access_token` is unusual but not safe to leave un-redacted.
 *   - the path scrub matches one shape — Bitrix24's own webhook URL — and not
 *     "a credential somewhere in a path" in general, which is not a decidable
 *     question. A credential that some other service puts in a path is not
 *     covered.
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

/**
 * The Bitrix24 incoming-webhook URL shape: `/rest/<userId>/<secret>/`.
 *
 * Deliberately narrow, because a path segment carries no name to match on and
 * the only defence against over-masking is the shape itself:
 *
 * - `<userId>` is digits, as the portal builds it;
 * - `<secret>` is letters and digits only, so a REST method name never matches —
 *   those carry dots (`crm.item.list`, `rest.deferredbatch.downloadresult`);
 * - at least 8 characters, which no short path word (`batch`, `profile`,
 *   `download`) reaches, and every real webhook secret does — they are issued
 *   far longer.
 *
 * **Both API versions.** `restApi:v3` puts the webhook at `/rest/api/<id>/…`
 * rather than `/rest/<id>/…` (`B24Hook.fromWebhookUrl`), so an `api/` segment is
 * optional here. A pattern written for v2 alone would have left every v3 hook
 * unmasked while reporting the same success — the whole defect, one version
 * over.
 *
 * **The segment may end the string.** `.../rest/1/<secret>` with no trailing
 * slash is a legitimate webhook URL — it is the form `fromWebhookUrl` accepts —
 * so the boundary is `/`, `?`, `#` or end of input, not `/` alone. This is
 * where the shape stops being conservative: `/rest/1/somedotlessword` at the end
 * of a string is masked too. Accepted deliberately — dotless REST method names
 * are short (`batch`, `scope`, `profile`) and fall under the length floor, and
 * masking a method name costs a debugging detail while missing a secret costs
 * the portal.
 *
 * Only the secret is masked; the portal host and the user id stay readable,
 * because a redacted line still has to be usable for debugging.
 */
const WEBHOOK_PATH_RE = /(\/rest\/(?:api\/)?\d+\/)[A-Za-z0-9]{8,}(?=[/?#]|$)/g

// Safe to share at module scope despite the `g` flag: `String.replace` scans
// from 0 and resets `lastIndex` when it finishes, and this regex is only ever
// used that way. A `.test()` or `.exec()` call on it would carry `lastIndex`
// between calls and start skipping matches — do not add one.
function redactWebhookPath(value: string): string {
  return value.replace(WEBHOOK_PATH_RE, `$1${REDACTED_PLACEHOLDER}`)
}

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

/**
 * Both string passes, in the order that keeps each one's fast path honest.
 *
 * The query scrub returns early when the string holds no `=` at all, which is
 * correct for a query pair and wrong for a path: `.../rest/1/<secret>/download/`
 * has no `=` anywhere, so routing every string through the query pass alone
 * left exactly that URL untouched.
 */
function redactString(value: string): string {
  return redactWebhookPath(redactQueryString(value))
}

// String scrubbing runs before the `depth <= 0` guard on purpose: scanning a
// string is cheap and bounded, so a serialised credential is masked even at a
// level the object walk would stop descending into. Arrays do not consume a
// depth slot (only object descent decrements `depth`), so an array nested in an
// array is still walked.
function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return redactString(value)
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
 * Redact credentials in a URL string — e.g. a Pull `connectionPath` surfaced by
 * `getDebugInfo()`. Masks the webhook secret when the URL carries one in its
 * path (`/rest/<userId>/<secret>/`), and every
 * {@link SENSITIVE_PARAM_KEYS} value plus any caller-supplied `extraKeys`
 * (e.g. Pull's `CHANNEL_ID`, a private identifier that is not a global
 * credential key). `extraKeys` are regex-escaped, so any literal key name is
 * safe to pass. Anchored and bounded exactly like the in-object scrub, so a
 * value-position `=` and non-query strings are left intact. Non-string input is
 * returned unchanged (a defensive guard for untyped JS callers).
 */
export function redactSensitiveUrl(url: string, extraKeys: readonly string[] = []): string {
  if (typeof url !== 'string') return url
  // The webhook-path pass runs first and unconditionally: a webhook URL with no
  // query string at all holds no `=`, and the query scrub's early return would
  // otherwise hand it back with the secret intact.
  const masked = redactWebhookPath(url)
  if (!masked.includes('=')) return masked
  if (extraKeys.length === 0) return redactQueryString(masked)
  const escaped = extraKeys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(
    `([?&]|^)(${[...SENSITIVE_PARAM_KEYS, ...escaped].join('|')})=[^&#;]*`,
    'gi'
  )
  return masked.replace(re, (_match, sep: string, key: string) => `${sep}${key}=${REDACTED_PLACEHOLDER}`)
}
