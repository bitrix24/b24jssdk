import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'

export type ActionCallListV2 = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'start'>
  idKey?: string
  customKeyForResult?: string
  requestId?: string
}

/**
 * Fast data retrieval without counting the total number of records. `restApi:v2`
 *
 * @todo add docs
 */
export class CallListV2 extends AbstractAction {
  /**
   * Fast data retrieval without counting the total number of records.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   *
   * @param {ActionCallListV2} options - parameters for executing the request.
   *     - `method: string` - The name of the REST API method that returns a list of data (for example: `crm.item.list`, `tasks.task.list`)
   *     - `params?: Omit<TypeCallParams, 'start'>` - Request parameters, excluding the `start` parameter,
   *         since the method is designed to obtain all data in one call.
   *         Note: Use `filter`, `order`, and `select` to control the selection.
   *     - `idKey?: string` - The name of the field containing the unique identifier of the element.
   *         Default is 'ID' (uppercase). Alternatively, it can be 'id' (lowercase).
   *         or another field, depending on the REST API data structure.
   *     - `customKeyForResult?: string` - A custom key indicating that the response REST API will be
   *        grouped by this field.
   *        Example: `items` to group a list of CRM items.
   *    - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging.
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
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    const moreIdKey = `>${idKey}`
    const requestParams: TypeCallParams = {
      ...params,
      order: { ...(params['order'] || {}), [idKey]: 'ASC' },
      filter: { ...(params['filter'] || {}), [moreIdKey]: 0 },
      start: -1
    }

    let allItems: T[] = []
    let isContinue = true

    do {
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

      let resultData: T[] = []
      if (null === customKeyForResult) {
        resultData = responseData.result as T[]
      } else {
        resultData = responseData.result[customKeyForResult] as T[]
      }

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
      if (
        lastItem
        && typeof lastItem[idKey] !== 'undefined'
      ) {
        requestParams.filter[moreIdKey] = Number.parseInt(lastItem[idKey])
      } else {
        isContinue = false
        break
      }
    } while (isContinue)

    return result.setData(allItems)
  }
}
