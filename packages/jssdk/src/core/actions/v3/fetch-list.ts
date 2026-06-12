import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { SdkError } from '../../sdk-error'

export type ActionFetchListV3 = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'pagination' | 'order'>
  idKey?: string
  cursorIdKey?: string
  customKeyForResult: string
  requestId?: string
  limit?: number
}

/**
 * Calls a REST API list method and returns an async generator for efficient large data retrieval. `restApi:v3`
 *
 * @todo add docs
 */
export class FetchListV3 extends AbstractAction {
  /**
   * Calls a REST API list method and returns an async generator for efficient large data retrieval.
   * Implements the fast algorithm for iterating over large datasets without loading all data into memory at once.
   *
   * @template T - The type of items in the returned arrays (default is `unknown`).
   *
   * @param {ActionFetchListV3} options - parameters for executing the request.
   *     - `method: string` - The name of the REST API method that returns a list of data (for example: `crm.item.list`, `tasks.task.list`)
   *     - `params?: Omit<TypeCallParams, 'pagination' | 'order'>` - Request parameters, excluding the `pagination` and `order` parameters,
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
   *    - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging.
   *    - `limit?: number` - How many records to retrieve at a time. Default is `50`. Maximum is `1000`.
   *
   * @returns {AsyncGenerator<T[]>} An async generator that yields chunks of data as arrays of type `T`.
   *     Each iteration returns the next page/batch of results until all data is fetched.
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
      this._logger.warning('fetchList.make: user-provided `order` parameter is ignored because cursor-based pagination requires ordering by cursorIdKey. Use `filter` to narrow results instead.')
    }

    const { order: _ignoredOrder, ...restParams } = params as TypeCallParams
    const requestParams: TypeCallParams = {
      ...restParams,
      order: { [cursorIdKey]: 'ASC' },
      filter: [...(params['filter'] || [])],
      pagination: { page: 0, limit: batchSize }
    }

    let isContinue = true
    let nextId = 0
    do {
      const sendParams = { ...requestParams, filter: [...requestParams.filter] }
      sendParams.filter.push([cursorIdKey, '>', nextId])

      const response: AjaxResult<T> = await this._b24.actions.v3.call.make<T>({
        method: options.method,
        params: sendParams,
        requestId: options.requestId
      })

      if (!response.isSuccess) {
        this._logger.error('fetchListMethod', {
          method: options.method,
          requestId: options.requestId,
          messages: response.getErrorMessages()
        })
        throw new SdkError({
          code: 'JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V3',
          description: `API Error: ${response.getErrorMessages().join('; ')}`,
          status: 500
        })
      }
      const responseData = response.getData()
      if (!responseData) {
        isContinue = false
        break
      }

      const resultData: T[] = (responseData.result as any)[customKeyForResult] as T[]
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
      const cursorValue = lastItem ? Number.parseInt(lastItem[idKey], 10) : Number.NaN
      if (Number.isFinite(cursorValue)) {
        nextId = cursorValue
      } else {
        // A full page came back, yet no usable numeric cursor id could be read from
        // its items via `idKey` — almost always an `idKey` that doesn't match the
        // response field (e.g. a request that sorts by `ID` while the response
        // carries a lowercase `id`). Without a cursor we can't advance, so stop and
        // tell the caller how to fix it instead of silently truncating.
        this._logger.warning(`fetchList.make: pagination stops here — no numeric id could be read from the returned items via idKey "${idKey}". Make sure idKey matches the id field in the response; if the sortable field name differs from it, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`)
        isContinue = false
        break
      }
    } while (isContinue)
  }
}
