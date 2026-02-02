import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  ICallBatchResult
} from '../../types/http'
import type { CallBatchResult, IB24BatchOptions } from '../../types/b24'
import type { AjaxResult } from '../http/ajax-result'
import { AbstractAction } from './abstract-action'
import { Result } from '../result'

export abstract class AbstractBatch extends AbstractAction {
  protected _addBatchErrorsIfAny(
    response: Result<ICallBatchResult<any>>,
    result: Result
  ): void {
    if (!response.isSuccess) {
      for (const [index, error] of response.errors) {
        result.addError(error, index)
      }
    }
  }

  protected _processBatchResponse<T>(
    response: Result<ICallBatchResult<T>>,
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options: IB24BatchOptions
  ): CallBatchResult<T> {
    const isArrayCall = Array.isArray(calls)

    if (options.returnAjaxResult) {
      return this._createBatchResultWithAjax<T>(response, isArrayCall)
    } else {
      return this._createBatchResultSimple<T>(response, isArrayCall)
    }
  }

  // region BatchResultWithAjax ////
  protected _createBatchResultWithAjax<T>(
    response: Result<ICallBatchResult<T>>,
    isArrayCall: boolean
  ): CallBatchResult<T> {
    return isArrayCall
      ? this._createBatchArrayResult<T>(response)
      : this._createBatchObjectResult<T>(response)
  }

  protected _createBatchArrayResult<T>(response: Result<ICallBatchResult<T>>): Result<AjaxResult<T>[]> {
    const result = new Result<AjaxResult<T>[]>()
    this._addBatchErrorsIfAny(response, result)

    const dataResult: AjaxResult<T>[] = []
    for (const [_index, data] of response.getData()!.result!) {
      dataResult.push(data)
    }

    return result.setData(dataResult)
  }

  protected _createBatchObjectResult<T>(response: Result<ICallBatchResult<T>>): Result<Record<string | number, AjaxResult<T>>> {
    const result = new Result<Record<string | number, AjaxResult<T>>>()
    this._addBatchErrorsIfAny(response, result)

    const dataResult: Record<string | number, any> = {}
    for (const [index, data] of response.getData()!.result!) {
      dataResult[index] = data
    }

    return result.setData(dataResult)
  }
  // endregion ////

  // region BatchResultSimple ////
  protected _createBatchResultSimple<T>(
    response: Result<ICallBatchResult<T>>,
    isArrayCall: boolean
  ): CallBatchResult<T> {
    const result = new Result<T>()
    this._addBatchErrorsIfAny(response, result)
    return result.setData(
      this._extractBatchSimpleData<T>(response, isArrayCall)
    )
  }

  protected _extractBatchSimpleData<T>(
    response: Result<ICallBatchResult<T>>,
    isArrayCall: boolean
  ): T {
    if (isArrayCall) {
      const dataResult: any[] = []
      for (const [_index, data] of response.getData()!.result!) {
        // @memo Add only success rows
        if (data.isSuccess) {
          dataResult.push(data.getData()!.result)
        }
      }
      return dataResult as T
    } else {
      const dataResult: Record<string | number, any> = {}
      for (const [index, data] of response.getData()!.result!) {
        // @memo Add only success rows
        if (data.isSuccess) {
          dataResult[index] = data.getData()!.result
        }
      }
      return dataResult as T
    }
  }
  // endregion ////

  public chunkArray<T = unknown>(array: Array<T>, chunkSize: number = 50): T[][] {
    const result: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      const chunk = array.slice(i, i + chunkSize)
      result.push(chunk)
    }
    return result
  }
}
