import type { BatchCommandV3, ICallBatchResult } from '../../../../../types/http'
import type { IProcessingStrategy, ResponseHelper, ResultItems } from '../interface-strategy'
import { AbstractProcessing } from '../interface-strategy'
import { SdkError } from '../../../../sdk-error'
import { AjaxResult } from '../../../../http/ajax-result'
import type { Result } from '../../../../result'

export abstract class AbstractProcessingV3 extends AbstractProcessing implements IProcessingStrategy {
  public buildCommands(commands: BatchCommandV3[]): BatchCommandV3[] {
    if (commands.length < 1) {
      throw new SdkError({
        code: 'JSSDK_INTERACTION_BATCH_BUILD_STRATEGY_V3_EMPTY_COMMANDS',
        description: 'commands not set',
        status: 500
      })
    }

    return commands
  }

  // region prepareItems ////
  // Soft-error guard lives in AbstractProcessing.prepareItems (#228); this is the
  // success-only path for apiVer3 (all-or-nothing — no per-command errors).
  protected override async _prepareItemsSuccess<T>(
    commands: BatchCommandV3[],
    responseHelper: ResponseHelper<T>,
    results: ResultItems<T>
  ): Promise<ResultItems<T>> {
    for (const [index, command] of commands.entries()) {
      await this._processResponseItem<T>(
        command,
        // @memo for apiVer3 in this pace we get objectIndex from array `index` from `commands[]`
        index,
        responseHelper,
        results
      )
    }

    return results
  }

  /**
   * In `restApi:v3`, `response.getData().result` is the array/record of per-command
   * results directly (no `result_error`/`result_time`/`result_total`/`result_next`
   * split as in v2). Per-command errors do not exist in this format.
   *
   * The per-command `result` value is forwarded as-is, including `null` when the
   * underlying REST method returns `null` (see issue #23).
   */
  protected override async _processResponseItem<T>(
    command: BatchCommandV3,
    index: string | number,
    responseHelper: ResponseHelper<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void> {
    const responseResult = responseHelper.response.getData()!.result as unknown as
      T[] | Record<string | number, T> | undefined
    const resultData = this._getBatchResultByIndex(responseResult, index)

    if (typeof resultData === 'undefined') {
      throw new SdkError({
        code: 'JSSDK_INTERACTION_BATCH_STRATEGY_V3_EMPTY_COMMAND_RESPONSE',
        description: `There were difficulties parsing the response for batch { index: ${index}, method: ${command.method} }`,
        status: 500
      })
    }

    /**
     * `time` on the v3 response is the batch-level time, not per-command.
     * We forward it to AjaxResult so callers can still inspect it, but we do
     * not feed it into `restrictionManager.updateStats(batch::<method>, …)`
     * — attributing the whole-batch duration to every method would distort
     * the rate-limiter stats.
     */
    const resultTime = responseHelper.response.getData()!.time

    const result = new AjaxResult<T>({
      answer: {
        result: resultData as T,
        error: undefined,
        time: resultTime
      },
      query: {
        method: command.method,
        params: command.query || {},
        requestId: responseHelper.requestId
      },
      status: responseHelper.response.getStatus()
    })

    results.set(index, result)
    return
  }
  // endregion ////

  // region handleResults ////
  // Soft-error guard lives in AbstractProcessing.handleResults (#228); this is the
  // success-only path for apiVer3.
  protected override async _handleResultsSuccess<T>(
    commands: BatchCommandV3[],
    results: ResultItems<T>,
    responseHelper: ResponseHelper<T>,
    result: Result<ICallBatchResult<T>>
  ): Promise<Result<ICallBatchResult<T>>> {
    const dataResult: ResultItems<T> = new Map()

    for (const [index, data] of results) {
      const rowIndex = Number.parseInt(`${index}`)
      const command = commands[rowIndex]
      if (typeof command === 'undefined') {
        throw new SdkError({
          code: 'JSSDK_INTERACTION_BATCH_BUILD_STRATEGY_V3_EMPTY_COMMAND',
          description: `command for index ${index} not set`,
          status: 500
        })
      }

      const commandIndex = command.as ?? index
      if (data.getStatus() !== 200 || !data.isSuccess) {
        const ajaxError = this._createErrorFromAjaxResult(data)

        /*
         * This should contain code similar to #isOperatingLimitError with a check for
         * the error 'Method is blocked due to operation time limit.'
         * However, `batch` is executed without retries, so there will be an immediate error.
         */

        // Errors are collected into the result rather than thrown, so all batch
        // commands are processed even when individual ones fail.
        // @memo we not throw ajaxError
        this._processResponseError<T>(result, ajaxError, `${commandIndex}`)
        dataResult.set(commandIndex, data)

        // if (responseHelper.parallelDefaultValue && !data.isSuccess) {
        //   this._processResponseError<T>(result, ajaxError, `${index}`)
        //   dataResult.set(index, data)
        //   continue
        // }
        //
        // throw ajaxError
      }

      dataResult.set(commandIndex, data)
    }

    result.setData({
      result: dataResult,
      time: responseHelper.response.getData()!.time
    })

    return result
  }
  // endregion ////
}
