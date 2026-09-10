import type { WalkBoundsOptions, WalkProgress } from '../_walk-bounds'
import { isWalkBoundsError } from '../_walk-bounds'
import type { TypeCallParams, TypeCallParamsV3, TypeFilterV3 } from '../../../types/http'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'
import { assertArrayFilter, keysetPaginate, KeysetPaginationError } from './_keyset-paginate'
import { CURSOR_STALLED_HINT_LIST } from '../_cursor-stalled'

export type ActionCallListV3 = WalkBoundsOptions & {
  /** Called after each collected page; see `WalkProgress`. */
  progress?: WalkProgress
  method: string
  /**
   * `filter` is narrowed to the v3 array form here, unlike {@link TypeCallParamsV3},
   * which also accepts the v2 object dialect for backward compatibility.
   *
   * Keyset pagination is emulated by appending `[cursorIdKey, '>', cursor]` to
   * this filter on every page, so an array is not a preference — it is the only
   * shape the mechanism can extend. The object form used to be accepted here and
   * then threw `filter is not iterable` at runtime, one page into the walk.
   */
  params?: Omit<TypeCallParamsV3, 'pagination' | 'order' | 'filter'> & { filter?: TypeFilterV3 }
  idKey?: string
  cursorIdKey?: string
  customKeyForResult: string
  requestId?: string
  limit?: number
}

/**
 * Fast data retrieval without counting the total number of records. `restApi:v3`
 *
 * Iterates through all pages of a v3 list method using keyset (cursor) pagination and collects
 * every item into a single array returned as a `Result`. Unlike the v2 counterpart `CallListV2`,
 * it uses v3-style array filter syntax and supports the `limit` option (the server enforces its own per-method maximum, commonly 1000).
 * Unlike `FetchListV3`, which streams pages via an async generator, this class returns the
 * complete dataset in one awaited call.
 */
export class CallListV3 extends AbstractAction {
  /**
   * Fast data retrieval without counting the total number of records.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   *
   * @param {ActionCallListV3} options - parameters for executing the request.
   *     - `method: string` - The name of the REST API method that returns a list of data (for example: `tasks.task.list`, `main.eventlog.list`)
   *     - `params?: Omit<TypeCallParamsV3, 'pagination' | 'order' | 'filter'> & { filter?: TypeFilterV3 }` - Request parameters, excluding the `pagination` and `order` parameters,
   *         since the method is designed to obtain all data in one call.
   *         Note: Use `filter`, `order`, and `select` to control the selection.
   *     - `idKey?: string` - The name of the id field as it appears in each RESPONSE item; its value
   *         drives the cursor. Default is 'id'. Set it to match the id field the method returns.
   *     - `cursorIdKey?: string` - The field name used in the REQUEST for `order` and the
   *         `[field, '>', n]` page filter. Defaults to `idKey`. Set it only when the sortable /
   *         filterable field name differs from the response field name (e.g. an uppercase request
   *         field but a lowercase response id): pass `idKey: 'id', cursorIdKey: 'ID'`.
   *     - `customKeyForResult: string` - A custom key indicating that the response REST API will be
   *        grouped by this field.
   *        Example: `items` to group a list of CRM items.
   *    - `requestId?: string` - Unique request identifier for tracking and debugging — sent as the `bx24_request_id` query parameter. It does not deduplicate anything; for that see `idempotencyKey` (restApi:v3).
   *    - `maxPages?: number` - Stop after this many pages and throw
   *        `JSSDK_ACTION_MAX_PAGES_EXCEEDED` naming the method. Defaults to 10 000 — a backstop,
   *        not a policy: on `restApi:v2` that is 500 000 rows, and at the default drain rate
   *        about 83 minutes of requests, so a walk that never ends is bounded without capping
   *        a read anyone performs. Nothing is returned when it fires; a short list that looks
   *        complete is the failure this refuses to produce.
   *    - `signal?: AbortSignal` - Stop the walk. Checked at the top of each iteration, so an
   *        already-aborted signal costs no request. Throws `JSSDK_ACTION_ABORTED`.
   *    - `progress?: (p: { pages: number, rows: number }) => void` - Called after each
   *        collected page. Counts, not a percentage: cursor paging reads no total, and
   *        inventing a denominator would be worse than an honest count.
   *    - `limit?: number` - How many records to retrieve at a time. Default is `50`.
   *        **A request, not a guarantee.** Each method applies its own maximum and a page
   *        shorter than `limit` is not the end of the data — `tasks.task.list` answers 50
   *        however much you ask for, measured with 60 rows available. This walker is
   *        cap-tolerant; hand-rolled paging on `call.make` is not. A `limit` of `0` or a
   *        non-numeric one is refused with `INVALIDPAGINATIONEXCEPTION`; a negative one
   *        answers a bare 500.
   *
   * @returns {Promise<Result<T[]>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * import { Text } from '@bitrix24/b24jssdk'
   *
   * interface MainEventLogItem { id: number, userId: number }
   * const sixMonthAgo = new Date()
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const response = await b24.actions.v3.callList.make<MainEventLogItem>({
   *   method: 'main.eventlog.list',
   *   params: {
   *     filter: [
   *       ['timestampX', '>=', Text.toB24Format(sixMonthAgo)] // created at least 6 months ago
   *     ],
   *     select: ['id', 'userId']
   *   },
   *   idKey: 'id',
   *   customKeyForResult: 'items',
   *   requestId: 'eventlog-123',
   *   limit: 60
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * const list = response.getData()
   * console.log(`Result: ${list?.length}`) // Number of items received
   */
  public override async make<T = unknown>(options: ActionCallListV3): Promise<Result<T[]>> {
    const batchSize = options?.limit ?? 50
    const result: Result<T[]> = new Result()

    const idKey = options?.idKey ?? 'id'
    const cursorIdKey = options?.cursorIdKey ?? idKey
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    // Warn and strip user-provided `order` — cursor pagination requires ordering by cursorIdKey only
    if ('order' in params && params['order']) {
      this._logger.warning('callList.make: user-provided `order` parameter is ignored because cursor-based pagination requires ordering by cursorIdKey. Use `filter` to narrow results instead.').catch(() => {})
    }

    assertArrayFilter(params['filter'], 'callList.make')

    const { order: _ignoredOrder, ...restParams } = params as TypeCallParams
    const requestParams: TypeCallParamsV3 & { filter: TypeFilterV3 } = {
      ...restParams,
      order: { [cursorIdKey]: 'ASC' },
      filter: [...(params['filter'] ?? [])],
      pagination: { page: 0, limit: batchSize }
    }

    const allItems: T[] = []
    let pages = 0
    try {
      for await (const page of keysetPaginate<T>(this._b24, this._logger, {
        method: options.method,
        requestId: options.requestId,
        customKeyForResult,
        initialCursor: 0,
        // Emulated keyset: append the `[cursorIdKey, '>', cursor]` page filter.
        buildParams: cursor => ({ ...requestParams, filter: [...requestParams.filter, [cursorIdKey, '>', cursor]] }),
        // Advance by the numeric id read from the last item via `idKey`. A
        // non-numeric value (almost always an `idKey` that doesn't match the
        // response field — e.g. sorting by `ID` while the response carries a
        // lowercase `id`) stops the walk instead of silently truncating.
        readNextCursor: (lastItem) => {
          const value = Number.parseInt(lastItem[idKey], 10)
          return Number.isFinite(value) ? value : null
        },
        noCursorWarning: `callList.make: pagination stops here — no numeric id could be read from the returned items via idKey "${idKey}". Make sure idKey matches the id field in the response; if the sortable field name differs from it, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`,
        errorLabel: 'callFastListMethod',
        actionLabel: 'callList.make',
        stalledCursorHint: CURSOR_STALLED_HINT_LIST,
        maxPages: options?.maxPages,
        signal: options?.signal
      })) {
        for (const item of page) {
          allItems.push(item)
        }
        pages += 1
        options.progress?.({ pages, rows: allItems.length })
      }
    } catch (error) {
      if (error instanceof KeysetPaginationError) {
        for (const [index, err] of error.errors) {
          result.addError(err, index)
        }
      } else if (isWalkBoundsError(error)) {
        // A bound the caller set, not a fault in the data: the pages already
        // collected are correct, so they are returned with the error attached
        // rather than discarded — the same shape this walker already produces
        // for a soft error from the portal.
        result.addError(error)
      } else {
        throw error
      }
    }

    return result.setData(allItems)
  }
}
