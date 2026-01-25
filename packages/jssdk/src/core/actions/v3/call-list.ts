import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'

export type ActionCallListV3 = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'pagination'>
  idKey?: string
  customKeyForResult: string
  requestId?: string
  limit?: number
}

/**
 * Fast data retrieval without counting the total number of records. `restApi:v3`
 *
 * @todo add docs
 * @todo test self
 * @todo test example
 */
export class CallListV3 extends AbstractAction {
  /**
   * Fast data retrieval without counting the total number of records.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   *
   * @param {ActionCallListV3} options - parameters for executing the request.
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
   * @returns {Promise<Result<T[]>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * interface MainEventLogItem { id: number, userId: number }
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const response = await b24.actions.v3.callList.make<MainEventLogItem>({
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
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    const requestParams: TypeCallParams = {
      ...params,
      order: { ...(params['order'] || {}), [idKey]: 'ASC' },
      filter: [...(params['filter'] || [])],
      pagination: { page: 0, limit: batchSize }
    }

    let allItems: T[] = []
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
        this._logger.error('callFastListMethod', {
          method: options.method,
          requestId: options.requestId,
          messages: response.getErrorMessages()
        })
        for (const [index, error] of response.errors) {
          result.addError(error, index)
        }
        isContinue = false
        break
      }
      const responseData = response.getData()
      if (!responseData) {
        isContinue = false
        break
      }

      const resultData = responseData.result[customKeyForResult] as T[]
      if (resultData.length === 0) {
        isContinue = false
        break
      }

      allItems = [...allItems, ...resultData]

      if (resultData.length < batchSize) {
        isContinue = false
        break
      }

      // Update the filter for the next iteration
      const lastItem = resultData[resultData.length - 1] as Record<string, any>
      if (lastItem && typeof lastItem[idKey] !== 'undefined') {
        nextId = Number.parseInt(lastItem[idKey] as string)
      } else {
        isContinue = false
        break
      }
    } while (isContinue)

    return result.setData(allItems)
  }
}
