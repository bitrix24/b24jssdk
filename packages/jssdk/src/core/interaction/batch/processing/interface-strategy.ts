import type { BatchCommandV3, ICallBatchResult } from '../../../../types/http'
import type { BatchPayload } from '../../../../types/payloads'
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
  /**
   * Template method. The soft-error envelope guard lives here ONCE so v2 and v3
   * can't drift on it (#228 — hoisted from the duplicated #145 fix).
   *
   * When the batch CALL itself soft-errors (a top-level code in the restriction
   * manager's `exceptionCodeForSoft` set, surfaced as a soft `Result` instead of
   * a throw), the envelope carries `{ error }` and no `result`, so
   * `response.getData()` is `undefined`. Skip per-row parsing — it would
   * dereference `getData()!.result` — and let {@link handleResults} surface the
   * top-level errors. The version-specific success path is {@link _prepareItemsSuccess}.
   */
  public async prepareItems<T>(
    commands: BatchCommandV3[],
    responseHelper: ResponseHelper<T>
  ): Promise<ResultItems<T>> {
    const results: ResultItems<T> = new Map()

    if (!responseHelper.response.isSuccess) {
      return results
    }

    return this._prepareItemsSuccess<T>(commands, responseHelper, results)
  }

  /** Per-version success path: parse the response payload into `results`. */
  protected abstract _prepareItemsSuccess<T>(
    commands: BatchCommandV3[],
    responseHelper: ResponseHelper<T>,
    results: ResultItems<T>
  ): Promise<ResultItems<T>>

  protected abstract _processResponseItem<T>(
    command: BatchCommandV3,
    index: string | number,
    responseHelper: ResponseHelper<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void>
  // endregion ////

  // region handleResults ////
  /**
   * Template method. Same single soft-error guard as {@link prepareItems} (#228):
   * there is no per-row data and `getData()` is `undefined`, so surface the
   * envelope's top-level errors and return an empty data map instead of
   * dereferencing `getData()!.time`. The version-specific success path is
   * {@link _handleResultsSuccess}.
   */
  public async handleResults<T>(
    commands: BatchCommandV3[],
    results: ResultItems<T>,
    responseHelper: ResponseHelper<T>
  ): Promise<Result<ICallBatchResult<T>>> {
    const result = new Result<ICallBatchResult<T>>()

    if (!responseHelper.response.isSuccess) {
      for (const [index, error] of responseHelper.response.errors) {
        result.addError(error, index)
      }
      result.setData({
        result: new Map(),
        time: undefined
      })
      return result
    }

    return this._handleResultsSuccess<T>(commands, results, responseHelper, result)
  }

  /** Per-version success path: fold per-command `results` into `result`. */
  protected abstract _handleResultsSuccess<T>(
    commands: BatchCommandV3[],
    results: ResultItems<T>,
    responseHelper: ResponseHelper<T>,
    result: Result<ICallBatchResult<T>>
  ): Promise<Result<ICallBatchResult<T>>>

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
