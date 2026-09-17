import type { WalkBoundsOptions } from '../_walk-bounds'
import type { TypeCallParams, TypeCallParamsV3, TypeFilterV3 } from '../../../types/http'
import { AbstractAction } from '../abstract-action'
import { SdkError } from '../../sdk-error'
import { assertArrayFilter, keysetPaginate, KeysetPaginationError } from './_keyset-paginate'
import { CURSOR_STALLED_HINT_LIST } from '../_cursor-stalled'

export type ActionFetchListV3 = WalkBoundsOptions & {
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
  /**
   * Name of the id field **as it appears in each response item**; its value
   * drives the cursor. Default `'id'`.
   */
  idKey?: string
  /**
   * Field name used in the **request**, for `order` and the `[field, '>', n]`
   * page filter. Defaults to `idKey`, which is usually right on `restApi:v3`
   * where names are camelCase in both directions.
   */
  cursorIdKey?: string
  /** Key the rows are nested under in the response, e.g. `items` for CRM items. */
  customKeyForResult: string
  /**
   * Sent as the `bx24_request_id` query parameter, for tracing. It does **not**
   * deduplicate anything — for that see `idempotencyKey`.
   */
  requestId?: string
  /**
   * Rows per page. Default `50`, and **a request rather than a guarantee**:
   * every method applies its own maximum, so a page shorter than `limit` is not
   * the end of the data. The walk allows for that; hand-rolled paging on
   * `call.make` does not.
   */
  limit?: number
}

/**
 * Calls a REST API list method and returns an async generator for efficient large data retrieval. `restApi:v3`
 *
 * Iterates through all pages of a v3 list method using keyset (cursor) pagination and yields
 * each page as an array, allowing callers to process records incrementally without holding the
 * entire dataset in memory. Unlike `CallListV3`, which accumulates all pages before returning,
 * this class exposes an `AsyncGenerator` so processing can begin as soon as the first page
 * arrives. Compared to `FetchListV2`, it uses v3-style array filter syntax and supports the
 * `limit` option (a requested page size; the server applies its own per-method
 * maximum).
 */
export class FetchListV3 extends AbstractAction {
  /**
   * Calls a REST API list method and returns an async generator, for walking a
   * large dataset without holding all of it in memory.
   *
   * **Every option is documented on the [fetchList v3 page](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/fetch-list-rest-api-ver3/),
   * and each one on {@link ActionFetchListV3}.** Not repeated here: nothing
   * watches a sentence in a comment, while the page is link-checked and its
   * code compiled on every CI run.
   *
   * What matters while editing this file:
   *
   * - The cursor only advances if rows arrive sorted by `cursorIdKey` ascending,
   *   so the walk writes its own `order` and strips a caller's with a `warning`.
   * - `idKey` reads the RESPONSE, `cursorIdKey` writes the REQUEST, and the two
   *   fail differently. A wrong `cursorIdKey` means the page condition never
   *   matches, the same page keeps arriving, and the walk stops with
   *   `JSSDK_ACTION_CURSOR_STALLED`
   *   ({@link CURSOR_STALLED_HINT_LIST} names the usual causes). A wrong `idKey` is quieter: if the value
   *   cannot be read as a number the walk warns and stops short, and if it
   *   names a *different numeric* field it advances a cursor the request never
   *   sorts by — which skips rows rather than reporting anything.
   * - End of data is decided against the largest page seen, never against
   *   `limit`, which methods are free to cap below the ask. The rule lives in
   *   {@link keysetPaginate}, which this delegates to.
   * - `maxPages` never ends a walk silently. Every page up to the ceiling has
   *   already been yielded and is the consumer's; the throw is what stops a
   *   truncated walk from reading as a finished one.
   *
   * @template T - The type of items in the returned arrays (default is `unknown`).
   * @param {ActionFetchListV3} options - every field is documented on the type.
   * @returns {AsyncGenerator<T[]>} An async generator yielding one page of rows
   *     at a time until the dataset is exhausted.
   *
   * @example
   * import { Text } from '@bitrix24/b24jssdk'
   *
   * interface MainEventLogItem { id: number, userId: number }
   * const sixMonthAgo = new Date()
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const generator = b24.actions.v3.fetchList.make<MainEventLogItem>({
   *   method: 'main.eventlog.list',
   *   params: {
   *     filter: [
   *      ['timestampX', '>=', Text.toB24Format(sixMonthAgo)] // created at least 6 months ago
   *     ],
   *     select: ['id', 'userId']
   *   },
   *   idKey: 'id',
   *   customKeyForResult: 'items',
   *   requestId: 'eventlog-123',
   *   limit: 60
   * })
   *
   * for await (const chunk of generator) {
   *   // Process chunk (e.g., save to database, analyze, etc.)
   *   console.log(`Processing ${chunk.length} items`)
   * }
   */
  public override async* make<T = unknown>(options: ActionFetchListV3): AsyncGenerator<T[]> {
    const batchSize = options?.limit ?? 50

    const idKey = options?.idKey ?? 'id'
    const cursorIdKey = options?.cursorIdKey ?? idKey
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    // Warn and strip user-provided `order` — cursor pagination requires ordering by cursorIdKey only
    if ('order' in params && params['order']) {
      this._logger.warning('fetchList.make: user-provided `order` parameter is ignored because cursor-based pagination requires ordering by cursorIdKey. Use `filter` to narrow results instead.').catch(() => {})
    }

    assertArrayFilter(params['filter'], 'fetchList.make')

    const { order: _ignoredOrder, ...restParams } = params as TypeCallParams
    const requestParams: TypeCallParamsV3 & { filter: TypeFilterV3 } = {
      ...restParams,
      order: { [cursorIdKey]: 'ASC' },
      filter: [...(params['filter'] ?? [])],
      pagination: { page: 0, limit: batchSize }
    }

    try {
      yield* keysetPaginate<T>(this._b24, this._logger, {
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
        noCursorWarning: `fetchList.make: pagination stops here — no numeric id could be read from the returned items via idKey "${idKey}". Make sure idKey matches the id field in the response; if the sortable field name differs from it, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`,
        errorLabel: 'fetchList.make',
        actionLabel: 'fetchList.make',
        stalledCursorHint: CURSOR_STALLED_HINT_LIST,
        // Always ascending: the page condition is `[cursorIdKey, '>', cursor]`
        // and the request sorts by the same field, so the cursor read off each
        // page is strictly greater than the one it was requested with.
        cursorDirection: 'ASC',
        maxPages: options?.maxPages,
        signal: options?.signal
      })
    } catch (error) {
      if (error instanceof KeysetPaginationError) {
        throw new SdkError({
          code: 'JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V3',
          description: `API Error: ${error.messages.join('; ')}`,
          status: 500
        })
      }
      throw error
    }
  }
}
