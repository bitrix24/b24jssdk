import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { SdkError } from '../../sdk-error'

export type ActionFetchListV2 = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'start' | 'order'>
  idKey?: string
  cursorIdKey?: string
  customKeyForResult?: string
  requestId?: string
}

/**
 * Calls a REST API list method and returns an async generator for efficient large data retrieval. `restApi:v2`
 *
 * @todo add docs
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
   *     - `params?: Omit<TypeCallParams, 'start'>` - Request parameters, excluding the `start` parameter,
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
   *    - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging.
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
      this._logger.warning('fetchList.make: user-provided `order` parameter is ignored because cursor-based pagination requires ordering by cursorIdKey. Use `filter` to narrow results instead.')
    }

    const moreIdKey = `>${cursorIdKey}`
    const { order: _ignoredOrder, ...restParams } = params as TypeCallParams
    const requestParams: TypeCallParams = {
      ...restParams,
      order: { [cursorIdKey]: 'ASC' },
      filter: { ...(params['filter'] || {}), [moreIdKey]: 0 },
      start: -1
    }

    let isContinue = true

    do {
      const response: AjaxResult<T> = await this._b24.actions.v2.call.make<T>({
        method: options.method,
        params: requestParams,
        requestId: options.requestId
      })

      if (!response.isSuccess) {
        this._logger.error('fetchListMethod', {
          method: options.method,
          requestId: options.requestId,
          messages: response.getErrorMessages()
        })
        throw new SdkError({
          code: 'JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V2',
          description: `API Error: ${response.getErrorMessages().join('; ')}`,
          status: 500
        })
      }
      const responseData = response.getData()
      if (!responseData) {
        isContinue = false
        break
      }

      let resultData: T[] = []
      if (null === customKeyForResult) {
        resultData = responseData.result as T[]
      } else {
        resultData = (responseData.result as any)[customKeyForResult] as T[]
      }

      if (resultData.length === 0) {
        isContinue = false
        break
      }

      yield resultData

      if (resultData.length < batchSize) {
        isContinue = false
        break
      }

      // Update the filter for the next iteration
      const lastItem = resultData[resultData.length - 1] as Record<string, any>
      if (
        lastItem
        && typeof lastItem[idKey] !== 'undefined'
      ) {
        requestParams.filter[moreIdKey] = Number.parseInt(lastItem[idKey])
      } else {
        // A full page came back, yet the cursor id can't be read from its items —
        // almost always an `idKey` that doesn't match the response field (e.g. the
        // default 'ID' against tasks.task.list, which returns lowercase 'id').
        // Without a cursor value we can't advance, so stop and tell the caller how
        // to fix it instead of silently truncating at the first page.
        this._logger.warning(`fetchList.make: a full page returned but idKey "${idKey}" is missing on its items — pagination stops after the first page. Make sure idKey matches the id field in the response (e.g. tasks.task.list returns lowercase "id"); if the sortable field name differs, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`)
        isContinue = false
        break
      }
    } while (isContinue)
  }
}
