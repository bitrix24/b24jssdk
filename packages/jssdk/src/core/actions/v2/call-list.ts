import type { WalkBoundsOptions, WalkProgress } from '../_walk-bounds'
import { assertNotAborted, isWalkBoundsError, maxPagesExceededError, resolveMaxPages } from '../_walk-bounds'
import type { TypeCallParams, TypeCallParamsV2, TypeFilterV2 } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'
import { cursorStalledError, cursorWentBackwardsError, CURSOR_STALLED_HINT_LIST } from '../_cursor-stalled'
import { cursorProgressed } from '../_cursor-progress'
import { warnOnShadowedUppercaseParams } from './_uppercase-list-params'

export type ActionCallListV2 = WalkBoundsOptions & {
  /** Called after each collected page; see `WalkProgress`. */
  progress?: WalkProgress
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
   * **Every option is documented on the [callList v2 page](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/call-list-rest-api-ver2/),
   * and each one on {@link ActionCallListV2}.** Not repeated here: nothing
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
   * - `maxPages` never ends a walk silently: the rows already read come back
   *   with `JSSDK_ACTION_MAX_PAGES_EXCEEDED` attached, so a short list that
   *   looks complete is never what a caller gets.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   * @param {ActionCallListV2} options - every field is documented on the type.
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

    try {
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

          // …and a cursor that moved the wrong way. A server alternating between
          // two pages never repeats the immediately preceding value, so the
          // check above never fires and the walk runs for ever (#495). Every
          // cycle steps backwards somewhere, and this is that step.
          if (!cursorProgressed(cursorValue, requestParams.filter[moreIdKey] as number, 'ASC')) {
            throw cursorWentBackwardsError('callList.make', CURSOR_STALLED_HINT_LIST)
          }

          // End of data, now that the cursor has been vouched for.
          if (isShortPage) {
            break
          }

          requestParams.filter[moreIdKey] = cursorValue

          // Last, so every cheaper stop wins: a stalled cursor is still
          // reported as a stall, the more specific diagnosis. A walk that ends
          // exactly on its ceiling finishes only when its final page is short —
          // that is what proves end-of-data. On an exact multiple of the page
          // size the last page is full, nothing has proved the data ended, and
          // this fires; the rows read are returned with the error attached,
          // not discarded.
          if (pages >= maxPages) {
            throw maxPagesExceededError('callList.make', options.method, maxPages)
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
            this._logger.warning(`callList.make: pagination stops here — no numeric id could be read from the returned items via idKey "${idKey}". Make sure idKey matches the id field in the response; if the sortable field name differs from it, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`).catch(() => {})
          }
          break
        }
      }
    } catch (error) {
      // A bound the caller set, not a fault in the data: the pages already
      // collected are correct, so they are returned with the error attached
      // rather than discarded — the same shape the soft-error exit above
      // already produces.
      if (isWalkBoundsError(error)) {
        result.addError(error)
      } else {
        throw error
      }
    }

    return result.setData(allItems)
  }
}
