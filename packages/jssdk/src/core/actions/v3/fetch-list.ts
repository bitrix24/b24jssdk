import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { SdkError } from '../../sdk-error'

export type ActionFetchListV3 = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'pagination'>
  idKey?: string
  customKeyForResult: string
  requestId?: string
  limit?: number
}

/**
 * Calls a REST API list method and returns an async generator for efficient large data retrieval. `restApi:v3`
 *
 * @todo add docs
 * @todo test self
 * @todo test example
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
   *     - `params?: Omit<TypeCallParams, 'pagination'>` - Request parameters, excluding the `pagination` parameter,
   *         since the method is designed to obtain all data in one call.
   *         Note: Use `filter`, `order`, and `select` to control the selection.
   *     - `idKey?: string` - The name of the field containing the unique identifier of the element.
   *         Default is 'id'. Alternatively, it can be another field, depending on the REST API data structure.
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
   * interface MainEventLogItem { id: number, userId: number }
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const generator = b24.actions.v3.fetchList.make<MainEventLogItem>({
   *   method: 'main.eventlog.list',
   *   params: {
   *     filter: [
   *      ['timestampX', '>=', sixMonthAgo] // created at least 6 months ago
   *     ],
   *     select: ['id', 'userId']
   *   },
   *   idKey: 'id',
   *   customKeyForResult: 'items',
   *   requestId: 'eventlog-123',
   *   limit: 60
   * })
   * for await (const chunk of generator) {
   *   // Process chunk (e.g., save to database, analyze, etc.)
   *   console.log(`Processing ${chunk.length} items`)
   * }
   */
  public override async* make<T = unknown>(options: ActionFetchListV3): AsyncGenerator<T[]> {
    const batchSize = options?.limit ?? 50

    const idKey = options?.idKey ?? 'id'
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    const requestParams: TypeCallParams = {
      ...params,
      order: { ...(params['order'] || {}), [idKey]: 'ASC' },
      filter: [...(params['filter'] || [])],
      pagination: { page: 0, limit: batchSize }
    }

    let isContinue = true
    let nextId = 0
    do {
      const sendParams = { ...requestParams }
      sendParams.filter.push([idKey, '>', nextId])

      const response: AjaxResult<T> = await this._b24.actions.v3.call.make<T>({
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

      const resultData: T[] = responseData.result[customKeyForResult] as T[]
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
        nextId = Number.parseInt(lastItem[idKey] as string)
      } else {
        isContinue = false
        break
      }
    } while (isContinue)
  }
}
