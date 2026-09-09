import type { WalkBoundsOptions, WalkProgress } from '../_walk-bounds'
import { assertNotAborted, maxPagesExceededError, resolveMaxPages } from '../_walk-bounds'
import type { TypeCallParams, TypeCallParamsV2, TypeFilterV2 } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'
import { cursorStalledError, CURSOR_STALLED_HINT_LIST } from '../_cursor-stalled'
import { warnOnShadowedUppercaseParams } from './_uppercase-list-params'

export type ActionCallListV2 = WalkBoundsOptions & {
  /** Called after each collected page; see `WalkProgress`. */
  progress?: WalkProgress
  method: string
  params?: Omit<TypeCallParamsV2, 'start' | 'order'>
  idKey?: string
  cursorIdKey?: string
  customKeyForResult?: string
  requestId?: string
}

/**
 * Fast data retrieval without counting the total number of records. `restApi:v2`
 *
 * Iterates through all pages of a v2 list method using cursor-based pagination (ordering and
 * filtering by the item id) and collects every item into a single array returned as a `Result`.
 * Unlike `FetchListV2`, which yields pages one by one via an async generator, this class waits
 * for all pages to finish and returns the complete dataset in one call.
 */
export class CallListV2 extends AbstractAction {
  /**
   * Fast data retrieval without counting the total number of records.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   *
   * @param {ActionCallListV2} options - parameters for executing the request.
   *     - `method: string` - The name of the REST API method that returns a list of data (for example: `crm.item.list`, `tasks.task.list`)
   *     - `params?: Omit<TypeCallParamsV2, 'start' | 'order'>` - Request parameters, excluding the `start` and `order` parameters,
   *         since the method is designed to obtain all data in one call.
   *         Note: Use `filter` and `select` to control the selection. `order` is NOT one of
   *         them — cursor paging must order by `cursorIdKey`, so a caller-supplied `order` is
   *         stripped with a `warning` (it is `Omit`ted from the type for the same reason —
   *         though the inherited `[key: string]: unknown` index signature still lets one compile).
   *
   *         **Conditions go in lowercase `filter`, and the uppercase key must be removed.**
   *         This walker pages by writing its own lowercase `filter`, `order` and `start`, and the
   *         portal keeps only the later of two top-level keys that differ by case. So a method
   *         documented with uppercase `FILTER` / `SORT` / `ORDER` needs its parameters *moved* to
   *         the lowercase shape: passing `FILTER` alone drops the conditions silently and returns
   *         rows they should have excluded (#483), while passing `FILTER` *and* `filter` drops the
   *         walker's cursor instead and fails the walk as stalled. `SORT` fails the request
   *         outright. All of these are reported with a `warning`.
   *     - `idKey?: string` - The name of the id field as it appears in each RESPONSE item; its value
   *         drives the cursor. Default is 'ID' (uppercase). For methods that return a lowercase /
   *         camelCase id (for example `tasks.task.list` returns `id`), set `idKey: 'id'`.
   *     - `cursorIdKey?: string` - The field name used in the REQUEST for `order` and the `>` page
   *         filter. Defaults to `idKey`. Set it only when the sortable / filterable field name differs
   *         from the response field name — e.g. `tasks.task.list` sorts and filters by `ID` (uppercase)
   *         but returns `id` (lowercase): pass `idKey: 'id', cursorIdKey: 'ID'`.
   *     - `customKeyForResult?: string` - A custom key indicating that the response REST API will be
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
   *
   * @returns {Promise<Result<T[]>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * import { EnumCrmEntityTypeId, Text } from '@bitrix24/b24jssdk'
   *
   * interface CrmItem { id: number, title: string }
   * const sixMonthAgo = new Date()
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const response = await b24.actions.v2.callList.make<CrmItem>({
   *   method: 'crm.item.list',
   *   params: {
   *     entityTypeId:  EnumCrmEntityTypeId.company,
   *     filter: {
   *       '=%title': 'A%',
   *       '>=createdTime': Text.toB24Format(sixMonthAgo) // created at least 6 months ago
   *     },
   *     select: ['id', 'title']
   *   },
   *   idKey: 'id',
   *   customKeyForResult: 'items',
   *   requestId: 'list-123'
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * const list = response.getData()
   * console.log(`Result: ${list?.length}`) // Number of items received
   */
  public override async make<T = unknown>(options: ActionCallListV2): Promise<Result<T[]>> {
    const batchSize = 50
    const result: Result<T[]> = new Result()

    const idKey = options?.idKey ?? 'ID'
    const cursorIdKey = options?.cursorIdKey ?? idKey
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    // Warn and strip user-provided `order` — cursor pagination requires ordering by cursorIdKey only
    if ('order' in params && params['order']) {
      this._logger.warning('callList.make: user-provided `order` parameter is ignored because cursor-based pagination requires ordering by cursorIdKey. Use `filter` to narrow results instead.').catch(() => {})
    }

    const moreIdKey = `>${cursorIdKey}`
    const { order: _ignoredOrder, ...restParams } = params as TypeCallParams
    const requestParams: TypeCallParamsV2 & { filter: TypeFilterV2 } = {
      ...restParams,
      order: { [cursorIdKey]: 'ASC' },
      filter: { ...(params['filter'] || {}), [moreIdKey]: 0 },
      start: -1
    }

    warnOnShadowedUppercaseParams('callList.make', requestParams as Record<string, unknown>, this._logger)

    let allItems: T[] = []
    let pages = 0
    const maxPages = resolveMaxPages('callList.make', options?.maxPages)

    while (true) {
      assertNotAborted(options?.signal, 'callList.make', options.method)

      const response: AjaxResult<T> = await this._b24.actions.v2.call.make<T>({
        method: options.method,
        params: requestParams,
        requestId: options.requestId
      })

      if (!response.isSuccess) {
        this._logger.error('callFastListMethod', {
          method: options.method,
          requestId: options.requestId,
          messages: response.getErrorMessages()
        }).catch(() => {})
        for (const [index, error] of response.errors) {
          result.addError(error, index)
        }
        break
      }
      const responseData = response.getData()
      if (!responseData) {
        break
      }

      const resultData: T[] = null === customKeyForResult
        ? responseData.result as T[]
        : (responseData.result as any)[customKeyForResult] as T[]

      if (resultData.length === 0) {
        break
      }

      allItems = [...allItems, ...resultData]
      pages += 1
      options.progress?.({ pages, rows: allItems.length })

      if (resultData.length < batchSize) {
        break
      }

      // Update the filter for the next iteration
      const lastItem = resultData[resultData.length - 1] as Record<string, any>
      const cursorValue = lastItem ? Number.parseInt(lastItem[idKey], 10) : Number.NaN
      if (Number.isFinite(cursorValue)) {
        // A full page whose last id is the one already filtered on means the
        // `>idKey` condition was dropped and this page will keep arriving. The
        // check above cannot see it — a repeated page is full, so
        // `resultData.length < batchSize` stays false however long the walk runs
        // — and `allItems` grows by the same 50 rows for ever.
        //
        // Measured on a live portal, `tasks.task.list` with `idKey: 'id'` and no
        // `cursorIdKey`: the walk was capped at three pages and collected 150
        // rows of which 50 were unique, the cursor reading 3 every time. The
        // response spells the id lowercase, the filter accepts it uppercase, so
        // `>id` matches nothing the server knows and is ignored. That is the
        // configuration #185 added `cursorIdKey` for; this is the signal that it
        // is missing, instead of a hang.
        if (cursorValue === requestParams.filter[moreIdKey]) {
          throw cursorStalledError('callList.make', CURSOR_STALLED_HINT_LIST)
        }
        requestParams.filter[moreIdKey] = cursorValue

        // Last, so every cheaper stop wins: a walk that ends exactly on its
        // ceiling finishes rather than erroring on its final page, and a stalled
        // cursor is still reported as a stall — the more specific diagnosis.
        if (pages >= maxPages) {
          throw maxPagesExceededError('callList.make', options.method, maxPages)
        }
      } else {
        // A full page came back, yet no usable numeric cursor id could be read from
        // its items via `idKey` — almost always an `idKey` that doesn't match the
        // response field (e.g. a request that sorts by `ID` while the response
        // carries a lowercase `id`). Without a cursor we can't advance, so stop and
        // tell the caller how to fix it instead of silently truncating.
        this._logger.warning(`callList.make: pagination stops here — no numeric id could be read from the returned items via idKey "${idKey}". Make sure idKey matches the id field in the response; if the sortable field name differs from it, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`).catch(() => {})
        break
      }
    }

    return result.setData(allItems)
  }
}
