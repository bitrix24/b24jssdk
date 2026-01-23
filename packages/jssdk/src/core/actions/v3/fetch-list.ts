import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { SdkError } from '../../sdk-error'

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
 * Calls a REST service list method and returns an async generator for efficient large data retrieval.
 *
 * @todo add docs
 * @todo add test
 */
export class FetchListMethod extends AbstractAction {
  /**
   * Calls a REST service list method and returns an async generator for efficient large data retrieval.
   * Implements the fast algorithm for iterating over large datasets without loading all data into memory at once.
   *
   * @todo test
   */
  public override async* make<T = unknown>(options: ActionCallFastListMethod): AsyncGenerator<T[]> {
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
