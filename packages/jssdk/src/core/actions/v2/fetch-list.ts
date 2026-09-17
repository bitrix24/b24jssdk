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
  /** REST list method that returns rows, e.g. `crm.item.list`, `tasks.task.list`. */
  method: string
  /**
   * Request parameters. `start` and `order` are excluded: the walk writes both
   * itself on every page. Use `filter` and `select` to narrow the selection.
   *
   * Conditions must go in the **lowercase** `filter`, with any uppercase
   * `FILTER` removed — see {@link warnOnShadowedUppercaseParams} for what the
   * portal does with two keys differing only by case, and why it is silent.
   */
  params?: Omit<TypeCallParamsV2, 'start' | 'order'>
  /**
   * Name of the id field **as it appears in each response item**; its value
   * drives the cursor. Default `'ID'` — `crm.item.list` and other camelCase
   * methods return `id`, so they need `idKey: 'id'`.
   */
  idKey?: string
  /**
   * Field name used in the **request**, for `order` and the `>` page filter.
   * Defaults to `idKey`. Set it only when a method spells the id differently in
   * the two: `tasks.task.list` sorts and filters by `ID` but returns `id`, so it
   * needs `idKey: 'id', cursorIdKey: 'ID'`.
   */
  cursorIdKey?: string
  /** Key the rows are nested under in the response, e.g. `items` for CRM items. */
  customKeyForResult?: string
  /**
   * Sent as the `bx24_request_id` query parameter, for tracing. It does **not**
   * deduplicate anything — for that see `idempotencyKey` on `restApi:v3`.
   */
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
   * **Every option is documented on the [fetchList v2 page](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/fetch-list-rest-api-ver2/),
   * and each one on {@link ActionFetchListV2}.** Not repeated here: nothing
   * watches a sentence in a comment, while the page is link-checked and its
   * code compiled on every CI run.
   *
   * What matters while editing this file:
   *
   * - The cursor only advances if rows arrive sorted by `cursorIdKey` ascending,
   *   so the walk writes its own `order` and strips a caller's with a `warning`.
   * - `idKey` reads the RESPONSE, `cursorIdKey` writes the REQUEST. A wrong
   *   `cursorIdKey` stalls the walk; a wrong `idKey` truncates it with a
   *   `warning` — see {@link cursorStalledError}.
   * - Page size on `restApi:v2` is a fixed 50 — there is no `limit` to ask with,
   *   so a page shorter than that ends the walk, but only once the cursor read
   *   from it has been vouched for.
   * - The portal keeps only the later of two top-level keys differing by case,
   *   so a caller's uppercase `FILTER` can drop either their conditions or this
   *   walk's cursor. Both are warned about, neither can be fixed from in here —
   *   see {@link warnOnShadowedUppercaseParams}.
   * - `maxPages` never ends a walk silently. Every page up to the ceiling has
   *   already been yielded and is the consumer's; the throw is what stops a
   *   truncated walk from reading as a finished one.
   *
   * @template T - The type of items in the returned arrays (default is `unknown`).
   * @param {ActionFetchListV2} options - every field is documented on the type.
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
