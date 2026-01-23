import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'

export type ActionCallFastListMethod = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'start'>
  idKey?: string
  customKeyForResult?: string
  requestId?: string
}

/**
 * Api:v2
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
