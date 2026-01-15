import type { BatchCommandV3, ICallBatchResult } from '../../../../types/http'
import type { BatchPayloadResult, PayloadTime } from '../../../../types/payloads'
import type { AjaxResult } from '../../../http/ajax-result'
import type { RestrictionManager } from '../../../http/limiters/manager'
import { Result } from '../../../result'
import { AjaxError } from '../../../http/ajax-error'

export type GetCommandsOptions = {
  // @memo this regeneration `isHaltOnError` -> !isHaltOnError
  parallelDefaultValue: boolean
}

export type ResponseHelper<T> = {
  requestId: string
  parallelDefaultValue: boolean
  status: number
  data: BatchPayloadResult<T>
  time: PayloadTime
  restrictionManager: RestrictionManager
}

export type ResultItems<T> = Map<string | number, AjaxResult<T>>

export interface IProcessingStrategy {
  prepareCommands(calls: unknown, options: GetCommandsOptions): BatchCommandV3[]
  buildCommands(commands: BatchCommandV3[]): unknown
  prepareItems<T>(commands: BatchCommandV3[], responseHelper: ResponseHelper<T>): Promise<ResultItems<T>>
  handleResults<T>(results: ResultItems<T>, responseHelper: ResponseHelper<T>): Promise<Result<ICallBatchResult<T>>>
}

export abstract class AbstractProcessing implements IProcessingStrategy {
  public abstract prepareCommands(calls: unknown, options: GetCommandsOptions): BatchCommandV3[]
  public abstract buildCommands(commands: BatchCommandV3[]): unknown

  // region prepareItems ////
  public async prepareItems<T>(
    commands: BatchCommandV3[],
    responseHelper: ResponseHelper<T>
  ): Promise<ResultItems<T>> {
    const results: ResultItems<T> = new Map()

    for (const [index, command] of commands.entries()) {
      await this._processResponseItem<T>(
        command,
        // @memo in this pace we get objectIndex from `command.as` OR array `index` from `commands[]`
        command.as ?? index,
        responseHelper,
        results
      )
    }

    return results
  }

  protected abstract _processResponseItem<T>(
    command: BatchCommandV3,
    index: string | number,
    responseHelper: ResponseHelper<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void>
  // endregion ////

  // region handleResults ////
  public async handleResults<T>(results: ResultItems<T>, responseHelper: ResponseHelper<T>): Promise<Result<ICallBatchResult<T>>> {
    const result = new Result<ICallBatchResult<T>>()
    const dataResult: ResultItems<T> = new Map()

    for (const [index, data] of results) {
      if (data.getStatus() !== 200 || !data.isSuccess) {
        const ajaxError = this._createErrorFromAjaxResult(data)

        /*
         * This should contain code similar to #isOperatingLimitError with a check for
         * the error 'Method is blocked due to operation time limit.'
         * However, `batch` is executed without retries, so there will be an immediate error.
         */

        if (responseHelper.parallelDefaultValue && !data.isSuccess) {
          this._processResponseError<T>(result, ajaxError, `${index}`)
          dataResult.set(index, data)
          continue
        }

        throw ajaxError
      }

      dataResult.set(index, data)
    }

    result.setData({
      result: dataResult,
      time: responseHelper.time
    })

    return result
  }

  protected abstract _processResponseError<T>(result: Result<ICallBatchResult<T>>, ajaxError: AjaxError, index: string): void
  // endregion ////

  // region Tools ////
  protected _getBatchResultByIndex<T>(
    data: T[] | Record<string | number, T> | undefined,
    index: string | number
  ): T | undefined {
    if (!data) return undefined

    if (Array.isArray(data)) {
      return data[index as number]
    }

    return (data as Record<string | number, T>)[index]
  }

  protected _createErrorFromAjaxResult(ajaxResult: AjaxResult): AjaxError {
    if (ajaxResult.hasError('base-error')) {
      return ajaxResult.errors.get('base-error') as AjaxError
    }

    return new AjaxError({
      code: 'JSSDK_BATCH_SUB_ERROR',
      description: ajaxResult.getErrorMessages().join('; '),
      status: ajaxResult.getStatus(),
      requestInfo: { ...ajaxResult.getQuery() },
      originalError: ajaxResult.getErrors().next().value
    })
  }
  // endregion ////
}
