import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'

export type ActionCallFastListMethod = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'pagination'>
  idKey?: string
  customKeyForResult: string
  requestId?: string
  limit?: number
}

/**
 * Api:v3
 * Fast data retrieval without counting the total number of records.
 *
 * @todo add docs
 */
export class CallFastListMethod extends AbstractAction {
  /**
   * Fast data retrieval without counting the total number of records.
   * An optimized version of `callListMethod` that doesn't perform queries
   * to determine the total number of elements (which can be resource-intensive with large data sets).
   *
   * @todo test
   */
  public override async make<T = unknown>(options: ActionCallFastListMethod): Promise<Result<T[]>> {
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
