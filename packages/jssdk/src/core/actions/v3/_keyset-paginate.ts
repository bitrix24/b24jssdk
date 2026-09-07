import type { TypeB24 } from '../../../types/b24'
import type { LoggerInterface } from '../../../types/logger'
import type { TypeCallParams, TypeFilterV3 } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { SdkError } from '../../sdk-error'

/**
 * Reject a non-array `filter` for the emulated-keyset list actions.
 *
 * `TypeCallParamsV3.filter` accepts the v3 array of triples AND the v2 object
 * dialect, kept for backward compatibility, and that union is right for a plain
 * `call`, which forwards the filter untouched. It is wrong for `callList` /
 * `fetchList`: those append `[cursorIdKey, '>', cursor]` to the same filter on
 * every page, so an array is not a preference, it is the only shape the
 * mechanism can extend. Passing the object form used to throw `filter is not
 * iterable` from a spread, one page into the walk.
 *
 * Both action option types already narrow `filter` to {@link TypeFilterV3}, so
 * for a TypeScript caller the `asserts` signature adds nothing the parameter
 * type has not already done. It exists for the callers the types cannot reach:
 * JavaScript, and anyone who wrote `params as any`.
 *
 * `callTail` / `fetchTail` do **not** use this one — see {@link assertTailFilter}.
 * They forward `filter` untouched, so the shapes they can accept are decided by
 * the portal rather than by this mechanism.
 *
 * @throws {SdkError} `JSSDK_ACTION_V3_LIST_FILTER_NOT_ARRAY`
 */
export function assertArrayFilter(
  filter: unknown,
  action: string
): asserts filter is undefined | TypeFilterV3 {
  if (filter === undefined || Array.isArray(filter)) {
    return
  }

  // Static text plus the caller-supplied `action` label only. Never interpolate
  // the filter, or any other caller value, into an SdkError description: unlike
  // AjaxError, SdkError does NOT run its message through
  // `redactSensitiveParams`, and a filter legitimately carries user data — the
  // email or phone number being searched for.
  throw new SdkError({
    code: 'JSSDK_ACTION_V3_LIST_FILTER_NOT_ARRAY',
    description: isPortalFilterGroup(filter)
      ? `${action}: \`filter\` must be an array here. A logic group is a valid v3 filter — the portal accepts one on its own — but this action appends its page condition to \`filter\` on every request, and only an array can be extended. Wrap it: filter: [FilterV3.or(...)].`
      : `${action}: \`filter\` must be the restApi:v3 array form, e.g. [['id', '>', 100]] or FilterV3.build(...). `
        + `The restApi:v2 object dialect ({ '>id': 100 }) is not accepted by the portal: a filter element carrying none of type/logic/conditions/negative is read positionally, so a map keyed by an operator prefix matches no condition it knows.`,
    status: 500
  })
}

/**
 * The keys `FilterStructure::fillStructure()` looks for before it falls through
 * to positional parsing.
 */
const PORTAL_GROUP_KEYS = ['type', 'logic', 'conditions', 'negative'] as const

/**
 * Would the portal read this object as a **group** rather than positionally?
 *
 * Deliberately not `isGroup` from `tools/filter-v3.ts`, which asks a different
 * question: that one validates what the *builder* produces and so requires
 * `conditions`. This one predicts what the *portal* will do, and the portal
 * checks all four of `type` / `logic` / `conditions` / `negative` — any one of
 * them takes the group branch. Testing only `conditions` would make the guard
 * stricter than the server it is standing in for, and reject `{ type: … }`,
 * which the portal accepts. A false rejection is worse than the round trip this
 * guard saves, because there is no way for the caller to get past it.
 */
function isPortalFilterGroup(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  return PORTAL_GROUP_KEYS.some(key => key in value)
}

/**
 * Does `filter` mention `field` anywhere — including inside a logic group?
 *
 * The tail walkers warn when the cursor field also appears in `filter`, because
 * the server orders and pages by it and rejects a filter on the same field.
 * That check used to be written inline as "a top-level array containing a
 * triple whose first element is the field", which stopped seeing anything the
 * moment a bare group became a legal filter — and had never seen a group nested
 * inside the array form either. Both are exactly where a caller puts a
 * condition once they reach for `FilterV3.or()`.
 */
export function filterMentionsField(filter: unknown, field: string): boolean {
  if (Array.isArray(filter)) {
    // A triple is an array too: `['id', '>', 100]`.
    if (typeof filter[0] === 'string') {
      return filter[0] === field
    }
    return filter.some(node => filterMentionsField(node, field))
  }

  if (typeof filter === 'object' && filter !== null && 'conditions' in filter) {
    return filterMentionsField((filter as { conditions: unknown }).conditions, field)
  }

  return false
}

/**
 * Reject the `restApi:v2` object dialect for the **native tail** walkers.
 *
 * Narrower than {@link assertArrayFilter} on purpose, because the mechanism is
 * different: `callTail` / `fetchTail` paginate through the separate `cursor`
 * parameter and forward `filter` verbatim, so nothing here needs to extend it.
 * What the portal accepts is therefore the only constraint, and it accepts more
 * than an array.
 *
 * Measured on an on-premise build (`SM_VERSION 26.700.0`), `main.eventlog.list`:
 *
 * | `filter` | portal |
 * | --- | --- |
 * | `[['auditTypeId', '=', 'USER_LOGIN']]` | accepted |
 * | `[{ logic: 'or', conditions: [...] }]` | accepted |
 * | `{ logic: 'or', conditions: [...] }` — bare group | **accepted** |
 * | `{ '>id': 1 }` — the v2 dialect | rejected, "Unknown filter condition" |
 *
 * The grammar explains the split: `FilterStructure::fillStructure()` reads
 * `type` / `logic` / `conditions` / `negative` off a map and only falls through
 * to the positional `handleSimpleCondition()` — which dispatches on `count()`
 * and reads `[0]`, `[1]`, `[2]` — when none of them is present. So a group is a
 * shape the portal knows, and an operator-prefix map is not: there the operator
 * is a position, not a prefix on the field name as it was in v2.
 *
 * A bare group is thus left alone. Guarding it would reject what
 * {@link FilterV3.or} produces and what the portal answers to, which is a worse
 * outcome than the round trip this guard saves.
 *
 * @throws {SdkError} `JSSDK_ACTION_V3_LIST_FILTER_NOT_ARRAY`
 */
export function assertTailFilter(filter: unknown, action: string): void {
  if (filter === undefined || Array.isArray(filter) || isPortalFilterGroup(filter)) {
    return
  }

  // A code of its own rather than the list one: there `NOT_ARRAY` states the
  // condition exactly, here a non-array is valid and only the v2 dialect is
  // refused. Codes are documented as stable strings to match on, so one whose
  // name asserts something untrue of half its call sites is a cost paid by
  // whoever reads it and not by us.
  throw new SdkError({
    code: 'JSSDK_ACTION_V3_TAIL_FILTER_INVALID',
    description: `${action}: \`filter\` must be the restApi:v3 array form, e.g. [['id', '>', 100]] or FilterV3.build(...), or a logic group from FilterV3.or() / and() / not(). `
      + `The restApi:v2 object dialect ({ '>id': 100 }) is not accepted by the portal: a filter element carrying none of type/logic/conditions/negative is read positionally, so a map keyed by an operator prefix matches no condition it knows. `
      + `Rejected here rather than one round trip later, where the server reports it in wording that never mentions the dialect.`,
    status: 500
  })
}

/**
 * Thrown by {@link keysetPaginate} when the underlying v3 `call` reports a soft
 * error part-way through a walk. It carries both the raw `[key, Error]` entries
 * (so the eager `call*` helpers can fold them into a `Result` via `addError`)
 * and the flat messages (so the streaming `fetch*` helpers can rethrow as their
 * own action-specific `SdkError`).
 */
export class KeysetPaginationError extends Error {
  public readonly errors: Iterable<[string, Error]>
  public readonly messages: string[]

  constructor(errors: Iterable<[string, Error]>, messages: string[]) {
    super(messages.join('; '))
    this.name = 'KeysetPaginationError'
    this.errors = errors
    this.messages = messages
  }
}

/**
 * Per-helper plug-ins that adapt the shared keyset loop to either the emulated
 * `list` cursor (a `[field, '>', n]` filter) or the native `tail` cursor.
 */
export type KeysetPaginateStrategy = {
  /** REST API method name (e.g. `tasks.task.list`, `main.eventlog.tail`). */
  method: string
  /** Optional request id forwarded to `call`. */
  requestId?: string
  /** Key under `result` that holds the row array (e.g. `items`). */
  customKeyForResult: string | null
  /** Cursor value used for the very first page. */
  initialCursor: number | string
  /** Build the per-page request params for a given cursor value. */
  buildParams: (cursor: number | string) => TypeCallParams
  /**
   * Read the next cursor value from the last item of a full page. Return `null`
   * to stop pagination — used when the cursor field cannot be read from the
   * response (the loop logs {@link KeysetPaginateStrategy.noCursorWarning}).
   */
  readNextCursor: (lastItem: Record<string, any>) => number | string | null
  /** Logged at `warning` level when `readNextCursor` returns `null`. */
  noCursorWarning: string
  /** Label logged at `error` level when the underlying `call` fails. */
  errorLabel: string
}

/**
 * Shared keyset-pagination driver for the v3 list/tail helpers
 * (`callList`/`fetchList` and `callTail`/`fetchTail`).
 *
 * It repeatedly calls `actions.v3.call`, yields each page, and advances the
 * cursor until the data runs out. End-of-data is detected by the size of the
 * page the **server actually returns**, not the requested `limit`: the loop
 * tracks the largest page seen so far (`maxPageSize`) and stops only when a page
 * is shorter than that (or empty). This matters because some v3 methods (e.g.
 * `tasks.task.list`) silently cap the page below the requested `limit`; keying
 * the stop on `limit` would end the walk right after the first capped page.
 *
 * On a soft error it throws {@link KeysetPaginationError}; the calling helper
 * decides whether to fold it into a `Result` (eager) or rethrow as an
 * `SdkError` (streaming).
 */
export async function* keysetPaginate<T = unknown>(
  b24: TypeB24,
  logger: LoggerInterface,
  strategy: KeysetPaginateStrategy
): AsyncGenerator<T[]> {
  let cursor = strategy.initialCursor
  let maxPageSize = 0

  while (true) {
    const response: AjaxResult<T> = await b24.actions.v3.call.make<T>({
      method: strategy.method,
      params: strategy.buildParams(cursor),
      requestId: strategy.requestId
    })

    if (!response.isSuccess) {
      logger.error(strategy.errorLabel, {
        method: strategy.method,
        requestId: strategy.requestId,
        messages: response.getErrorMessages()
      }).catch(() => {})
      throw new KeysetPaginationError(response.errors, response.getErrorMessages())
    }

    const responseData = response.getData()
    if (!responseData) {
      break
    }

    const resultData: T[] = (responseData.result as any)[strategy.customKeyForResult as any] as T[]
    // Guard against a wrong `customKeyForResult` (key absent → undefined): treat
    // a missing/non-array bucket as "no data" instead of throwing on `.length`.
    if (!Array.isArray(resultData) || resultData.length === 0) {
      break
    }

    yield resultData

    maxPageSize = Math.max(maxPageSize, resultData.length)
    if (resultData.length < maxPageSize) {
      break
    }

    const lastItem = resultData[resultData.length - 1] as Record<string, any>
    const next = lastItem ? strategy.readNextCursor(lastItem) : null
    if (next === null || next === undefined) {
      logger.warning(strategy.noCursorWarning).catch(() => {})
      break
    }

    cursor = next
  }
}
