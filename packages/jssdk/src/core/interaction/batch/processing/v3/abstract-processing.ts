import type { BatchCommandV3, ICallBatchResult } from '../../../../../types/http'
import type { IProcessingStrategy, ResponseHelper, ResultItems } from '../interface-strategy'
import type { BatchResponseData } from '../../abstract-interaction-batch'
import { AbstractProcessing } from '../interface-strategy'
import { SdkError } from '../../../../sdk-error'
import { AjaxResult } from '../../../../http/ajax-result'
import { Result } from '../../../../result'

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
  public override async prepareItems<T>(
    commands: BatchCommandV3[],
    responseHelper: ResponseHelper<T>
  ): Promise<ResultItems<T>> {
    const results: ResultItems<T> = new Map()

    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    if (!responseHelper.response.isSuccess) {
      return results
    }

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
   * @todo ! api ver3 waite docs
   */
  protected override async _processResponseItem<T>(
    command: BatchCommandV3,
    index: string | number,
    responseHelper: ResponseHelper<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void> {
    const responseResult = responseHelper.response.getData()!.result as BatchResponseData<T>
    const resultData = this._getBatchResultByIndex((responseResult as T[] | Record<string | number, T> | undefined), index)
    const methodName = command.method

    /**
     * @todo ! api ver3 waite docs - this fake
     */
    const resultError = undefined

    /**
     * @todo ! api ver3 waite docs - this fake
     */
    const resultTime = responseHelper.response.getData()!.time
    // Update operating statistics for each method in the batch
    if (typeof resultTime !== 'undefined') {
      await responseHelper.restrictionManager.updateStats(responseHelper.requestId, `batch::${methodName}`, resultTime)
    }

    const result = new AjaxResult<T>({
      answer: {
        result: (resultData ?? {}) as T,
        error: resultError,
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
  public override async handleResults<T>(commands: BatchCommandV3[], results: ResultItems<T>, responseHelper: ResponseHelper<T>): Promise<Result<ICallBatchResult<T>>> {
    const result = new Result<ICallBatchResult<T>>()
    const dataResult: ResultItems<T> = new Map()
    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.prepareItems()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    if (!responseHelper.response.isSuccess) {
      for (const [index, error] of responseHelper.response.errors) {
        result.addError(error, index)
      }
      result.setData({
        result: dataResult,
        time: undefined
      })
      return result
    }

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

        // @todo fix docs
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
