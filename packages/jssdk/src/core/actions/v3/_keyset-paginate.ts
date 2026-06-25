import type { TypeB24 } from '../../../types/b24'
import type { LoggerInterface } from '../../../types/logger'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'

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
      })
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
      logger.warning(strategy.noCursorWarning)
      break
    }
    cursor = next
  }
}
