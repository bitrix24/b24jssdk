import type { WalkBoundsOptions } from '../_walk-bounds'
import { assertNotAborted, maxPagesExceededError, resolveMaxPages } from '../_walk-bounds'
import type { TypeCallParams, TypeCallParamsV2, TypeFilterV2 } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { SdkError } from '../../sdk-error'
import { cursorStalledError, cursorWentBackwardsError, CURSOR_STALLED_HINT_LIST } from '../_cursor-stalled'
import { cursorProgressed } from '../_cursor-progress'
import { warnOnShadowedUppercaseParams } from './_uppercase-list-params'

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
   * Calls a REST API list method and returns an async generator, for walking a
   * large dataset without holding all of it in memory.
   *
   * **Every option is documented on the page below — read it before changing
   * behaviour here.** Not repeated: that copy is link-checked and compiled on
   * every CI run, this one is watched by nothing, and two copies drift (#420).
   * https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/fetch-list-rest-api-ver2/
   *
   * The invariants this file must not break:
   *
   * - The cursor only advances if rows arrive sorted by `cursorIdKey` ascending,
   *   so the walk writes its own `order` and strips a caller's with a `warning`.
   * - `idKey` reads the RESPONSE; `cursorIdKey` writes the REQUEST. Conflating
   *   them stalls the walk instead of failing at the call.
   * - End of data is decided by page size against the largest page seen, never
   *   by a constant: a method that caps pages below the ask must still walk on.
   * - `maxPages` yields nothing when it fires. A short list that looks complete
   *   is the failure this refuses to produce.
   *
   * @template T - The type of items in the returned arrays (default is `unknown`).
   * @param {ActionFetchListV2} options - see the page above for every field; the
   *     type carries the contract.
   * @returns {AsyncGenerator<T[]>} An async generator yielding one page of rows
   *     at a time until the dataset is exhausted.
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

    warnOnShadowedUppercaseParams('fetchList.make', requestParams as Record<string, unknown>, this._logger)

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
      // Again after the page has been handed over. The gap between `yield` and
      // the top of the loop is not empty - the stall guard and the ceiling both
      // sit in it - so a consumer that aborts while holding a page would
      // otherwise be told the read is too large, or that the cursor stalled,
      // when what actually happened is that they cancelled. No request is saved
      // by this check; the correct diagnosis is.
      assertNotAborted(options?.signal, 'fetchList.make', options.method)

      // Read rather than acted on: the cursor is checked first, and only
      // then does a short page end the walk. A page shorter than the one
      // asked for used to end it as "end of data" whatever the cursor did, so
      // a stalled page that happened to be capped returned a truncated,
      // overlapping result and reported success (#496). The two are
      // separable: `>idKey` asks for rows strictly past the cursor, so a row
      // at or before it cannot be in an answer that honoured the condition,
      // however short the page.
      const isShortPage = resultData.length < batchSize

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

        // …and a cursor that moved the wrong way. A server alternating between
        // two pages never repeats the immediately preceding value, so the
        // check above never fires and the walk runs for ever (#495). Every
        // cycle steps backwards somewhere, and this is that step.
        if (!cursorProgressed(cursorValue, requestParams.filter[moreIdKey] as number, 'ASC')) {
          throw cursorWentBackwardsError('fetchList.make', CURSOR_STALLED_HINT_LIST)
        }

        // End of data, now that the cursor has been vouched for.
        if (isShortPage) {
          break
        }

        requestParams.filter[moreIdKey] = cursorValue

        // Last, so every cheaper stop wins: a stalled cursor is still reported
        // as a stall, the more specific diagnosis. A walk that ends exactly on
        // its ceiling finishes only when its final page is short — that is what
        // proves end-of-data. On an exact multiple of the page size the last
        // page is full, nothing has proved the data ended, and this fires; the
        // rows read are returned with the error attached, not discarded.
        if (pages >= maxPages) {
          throw maxPagesExceededError('fetchList.make', options.method, maxPages)
        }
      } else {
        // No usable numeric cursor id could be read from the page's items via
        // `idKey` — almost always an `idKey` that doesn't match the
        // response field (e.g. a request that sorts by `ID` while the response
        // carries a lowercase `id`). Without a cursor we can't advance, so stop and
        // tell the caller how to fix it instead of silently truncating.
        // A short page is simply the end of the data, so say nothing about a
        // cursor the walk never needed.
        if (!isShortPage) {
          this._logger.warning(`fetchList.make: pagination stops here — no numeric id could be read from the returned items via idKey "${idKey}". Make sure idKey matches the id field in the response; if the sortable field name differs from it, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`).catch(() => {})
        }
        break
      }
    }
  }
}
