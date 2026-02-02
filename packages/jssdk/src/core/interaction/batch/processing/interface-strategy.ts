import type { BatchCommandV3, ICallBatchResult } from '../../../../types/http'
import type { BatchPayload } from '../../../../types/payloads'
import type { AjaxResult } from '../../../http/ajax-result'
import type { RestrictionManager } from '../../../http/limiters/manager'
import type { Result } from '../../../result'
import { AjaxError } from '../../../http/ajax-error'

export type GetCommandsOptions = {
  // @memo this regeneration `isHaltOnError` -> !isHaltOnError
  parallelDefaultValue: boolean
}

export type ResponseHelper<T> = {
  requestId: string
  parallelDefaultValue: boolean
  response: AjaxResult<BatchPayload<T>>
  // status: number
  // data: BatchPayloadResult<T>
  // time: PayloadTime
  restrictionManager: RestrictionManager
}

export type ResultItems<T> = Map<string | number, AjaxResult<T>>

export interface IProcessingStrategy {
  prepareCommands(calls: unknown, options: GetCommandsOptions): BatchCommandV3[]
  buildCommands(commands: BatchCommandV3[]): unknown
  prepareItems<T>(commands: BatchCommandV3[], responseHelper: ResponseHelper<T>): Promise<ResultItems<T>>
  handleResults<T>(commands: BatchCommandV3[], results: ResultItems<T>, responseHelper: ResponseHelper<T>): Promise<Result<ICallBatchResult<T>>>
}

export abstract class AbstractProcessing implements IProcessingStrategy {
  public abstract prepareCommands(calls: unknown, options: GetCommandsOptions): BatchCommandV3[]
  public abstract buildCommands(commands: BatchCommandV3[]): unknown

  // region prepareItems ////
  public abstract prepareItems<T>(
    commands: BatchCommandV3[],
    responseHelper: ResponseHelper<T>
  ): Promise<ResultItems<T>>

  protected abstract _processResponseItem<T>(
    command: BatchCommandV3,
    index: string | number,
    responseHelper: ResponseHelper<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void>
  // endregion ////

  // region handleResults ////
  public abstract handleResults<T>(commands: BatchCommandV3[], results: ResultItems<T>, responseHelper: ResponseHelper<T>): Promise<Result<ICallBatchResult<T>>>

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
