import type { WalkBoundsOptions } from '../_walk-bounds'
import { assertNotAborted, maxPagesExceededError, resolveMaxPages } from '../_walk-bounds'
import type { TypeCallParams, TypeCallParamsV2, TypeFilterV2 } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { SdkError } from '../../sdk-error'
import { cursorStalledError, CURSOR_STALLED_HINT_LIST } from '../_cursor-stalled'

export type ActionFetchListV2 = WalkBoundsOptions & {
  method: string
  params?: Omit<TypeCallParamsV2, 'start' | 'order'>
  idKey?: string
  cursorIdKey?: string
  customKeyForResult?: string
  requestId?: string
}

/**
 * Calls a REST API list method and returns an async generator for efficient large data retrieval. `restApi:v2`
 *
 * Iterates through all pages of a v2 list method using cursor-based pagination and yields each
 * page as an array, allowing callers to process records incrementally without holding the entire
 * dataset in memory. Unlike `CallListV2`, which accumulates all pages before returning, this
 * class exposes an `AsyncGenerator` so processing can begin as soon as the first page arrives.
 */
export class FetchListV2 extends AbstractAction {
  /**
   * Calls a REST API list method and returns an async generator for efficient large data retrieval.
   * Implements the fast algorithm for iterating over large datasets without loading all data into memory at once.
   *
   * @template T - The type of items in the returned arrays (default is `unknown`).
   *
   * @param {ActionFetchListV2} options - parameters for executing the request.
   *     - `method: string` - The name of the REST API method that returns a list of data (for example: `crm.item.list`, `tasks.task.list`)
   *     - `params?: Omit<TypeCallParamsV2, 'start' | 'order'>` - Request parameters, excluding the `start` and `order` parameters,
   *         since the method is designed to obtain all data in one call.
   *         Note: Use `filter`, `order`, and `select` to control the selection.
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
   *
   * @returns {AsyncGenerator<T[]>} An async generator that yields chunks of data as arrays of type `T`.
   *     Each iteration returns the next page/batch of results until all data is fetched.
   *
   * @example
   * import { EnumCrmEntityTypeId, Text } from '@bitrix24/b24jssdk'
   *
   * interface CrmItem { id: number, title: string }
   * const sixMonthAgo = new Date()
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const generator = b24.actions.v2.fetchList.make<CrmItem>({
   *   method: 'crm.item.list',
   *   params: {
   *     entityTypeId: EnumCrmEntityTypeId.company,
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
   *
   * for await (const chunk of generator) {
   *   // Process chunk (e.g., save to database, analyze, etc.)
   *   console.log(`Processing ${chunk.length} items`)
   * }
   *
   * @see {@link https://apidocs.bitrix24.com/settings/performance/huge-data.html Bitrix24: Fast algorithm for large data}
   */
  public override async* make<T = unknown>(options: ActionFetchListV2): AsyncGenerator<T[]> {
    const batchSize = 50

    const idKey = options?.idKey ?? 'ID'
    const cursorIdKey = options?.cursorIdKey ?? idKey
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    // Warn and strip user-provided `order` — cursor pagination requires ordering by cursorIdKey only
    if ('order' in params && params['order']) {
      this._logger.warning('fetchList.make: user-provided `order` parameter is ignored because cursor-based pagination requires ordering by cursorIdKey. Use `filter` to narrow results instead.').catch(() => {})
    }

    const moreIdKey = `>${cursorIdKey}`
    const { order: _ignoredOrder, ...restParams } = params as TypeCallParams
    const requestParams: TypeCallParamsV2 & { filter: TypeFilterV2 } = {
      ...restParams,
      order: { [cursorIdKey]: 'ASC' },
      filter: { ...(params['filter'] || {}), [moreIdKey]: 0 },
      start: -1
    }

    let pages = 0
    const maxPages = resolveMaxPages('fetchList.make', options?.maxPages)

    while (true) {
      assertNotAborted(options?.signal, 'fetchList.make', options.method)
      const response: AjaxResult<T> = await this._b24.actions.v2.call.make<T>({
        method: options.method,
        params: requestParams,
        requestId: options.requestId
      })

      if (!response.isSuccess) {
        this._logger.error('fetchList.make', {
          method: options.method,
          requestId: options.requestId,
          messages: response.getErrorMessages()
        }).catch(() => {})
        throw new SdkError({
          code: 'JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V2',
          description: `API Error: ${response.getErrorMessages().join('; ')}`,
          status: 500
        })
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

      pages += 1
      yield resultData

      if (resultData.length < batchSize) {
        break
      }

      // Update the filter for the next iteration
      const lastItem = resultData[resultData.length - 1] as Record<string, any>
      const cursorValue = lastItem ? Number.parseInt(lastItem[idKey], 10) : Number.NaN
      if (Number.isFinite(cursorValue)) {
        // See the note in `v2/call-list.ts`: a full page whose last id equals
        // the one already filtered on means `>idKey` was dropped, and the same
        // page repeats for ever. Here the pages have already been yielded, so
        // the consumer holds the duplicates — the error says so.
        if (cursorValue === requestParams.filter[moreIdKey]) {
          throw cursorStalledError('fetchList.make', CURSOR_STALLED_HINT_LIST)
        }
        requestParams.filter[moreIdKey] = cursorValue

        // Last, so every cheaper stop wins: a walk that ends exactly on its
        // ceiling finishes rather than erroring on its final page, and a stalled
        // cursor is still reported as a stall — the more specific diagnosis.
        if (pages >= maxPages) {
          throw maxPagesExceededError('fetchList.make', options.method, maxPages)
        }
      } else {
        // A full page came back, yet no usable numeric cursor id could be read from
        // its items via `idKey` — almost always an `idKey` that doesn't match the
        // response field (e.g. a request that sorts by `ID` while the response
        // carries a lowercase `id`). Without a cursor we can't advance, so stop and
        // tell the caller how to fix it instead of silently truncating.
        this._logger.warning(`fetchList.make: pagination stops here — no numeric id could be read from the returned items via idKey "${idKey}". Make sure idKey matches the id field in the response; if the sortable field name differs from it, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`).catch(() => {})
        break
      }
    }
  }
}
