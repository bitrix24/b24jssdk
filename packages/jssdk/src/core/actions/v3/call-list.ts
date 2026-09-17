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
 * it uses v3-style array filter syntax and supports the `limit` option — a requested page size,
 * since each method enforces its own maximum. No number here is a rule: `tasks.task.list` was
 * measured at 50 whatever is asked, and 1000 is the figure the reference quotes rather than one
 * observed on any method.
 * Unlike `FetchListV3`, which streams pages via an async generator, this class returns the
 * complete dataset in one awaited call.
 */
export class CallListV3 extends AbstractAction {
  /**
   * Fast data retrieval without counting the total number of records.
   *
   * **Every option is documented on the page below — read it before changing
   * behaviour here.** Not repeated: that copy is link-checked and compiled on
   * every CI run, this one is watched by nothing, and two copies drift (#420).
   * https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/call-list-rest-api-ver3/
   *
   * The invariants this file must not break:
   *
   * - The cursor only advances if rows arrive sorted by `cursorIdKey` ascending,
   *   so the walk writes its own `order` and strips a caller's with a `warning`.
   * - `filter` must be the v3 ARRAY form: the walk appends
   *   `[cursorIdKey, '>', n]` to it each page, so an object has nothing to
   *   extend — refused at the call, not mid-walk.
   * - `idKey` reads the RESPONSE; `cursorIdKey` writes the REQUEST. Conflating
   *   them stalls the walk instead of failing at the call.
   * - End of data is decided by page size against the largest page seen, never
   *   by `limit`, which methods are free to cap below the ask.
   * - `maxPages` yields nothing when it fires. A short list that looks complete
   *   is the failure this refuses to produce.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   * @param {ActionCallListV3} options - see the page above for every field; the
   *     type carries the contract.
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
        // Always ascending: the page condition is `[cursorIdKey, '>', cursor]`
        // and the request sorts by the same field, so the cursor read off each
        // page is strictly greater than the one it was requested with.
        cursorDirection: 'ASC',
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
