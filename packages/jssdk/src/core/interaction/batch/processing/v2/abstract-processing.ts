import type { BatchCommandV3, ICallBatchResult } from '../../../../../types/http'
import type { IProcessingStrategy, ResponseHelper, ResultItems } from '../interface-strategy'
import type { BatchResponseData } from '../../abstract-interaction-batch'
import * as qs from 'qs-esm'
import { AbstractProcessing } from '../interface-strategy'
import { SdkError } from '../../../../sdk-error'
import { AjaxResult } from '../../../../http/ajax-result'
import { Result } from '../../../../result'

export abstract class AbstractProcessingV2 extends AbstractProcessing implements IProcessingStrategy {
  protected _buildRow(command: BatchCommandV3): string {
    return `${command.method}?${qs.stringify(command.query || {})}`
  }

  public buildCommands(commands: BatchCommandV3[]): string[] | Record<string, string> {
    if (commands.length < 1) {
      throw new SdkError({
        code: 'JSSDK_INTERACTION_BATCH_STRATEGY_V2_EMPTY_COMMANDS',
        description: 'commands not set',
        status: 500
      })
    }

    const firstCommand = commands[0]
    const asObject = (typeof firstCommand.as === 'string' && firstCommand.as.length > 0)

    if (asObject) {
      const result: Record<string, string> = {}

      for (const command of commands) {
        result[command.as!] = this._buildRow(command)
      }
      return result
    }

    const result: string[] = []

    for (const command of commands) {
      result.push(this._buildRow(command))
    }
    return result
  }

  // region prepareItems ////
  public override async prepareItems<T>(
    commands: BatchCommandV3[],
    responseHelper: ResponseHelper<T>
  ): Promise<ResultItems<T>> {
    const results: ResultItems<T> = new Map()

    for (const [index, command] of commands.entries()) {
      await this._processResponseItem<T>(
        command,
        // @memo for apiVer2 in this pace we get objectIndex from `command.as` OR array `index` from `commands[]`
        command.as ?? index,
        responseHelper,
        results
      )
    }

    return results
  }

  protected override async _processResponseItem<T>(
    command: BatchCommandV3,
    index: string | number,
    responseHelper: ResponseHelper<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void> {
    const responseResult = responseHelper.response.getData()!.result as BatchResponseData<T>
    const resultData = this._getBatchResultByIndex(responseResult.result, index)
    const resultError = this._getBatchResultByIndex(responseResult.result_error, index)

    if (
      typeof resultData !== 'undefined'
      || typeof resultError !== 'undefined'
    ) {
      const methodName = command.method

      // Update operating statistics for each method in the batch
      const resultTime = this._getBatchResultByIndex(responseResult.result_time, index)
      if (typeof resultTime !== 'undefined') {
        await responseHelper.restrictionManager.updateStats(responseHelper.requestId, `batch::${methodName}`, resultTime)
      }

      const result = new AjaxResult<T>({
        answer: {
          error: resultError ? (typeof resultError === 'string' ? resultError : resultError.error) : undefined,
          error_description: resultError ? (typeof resultError === 'string' ? undefined : resultError.error_description) : undefined,
          result: (resultData ?? {}) as T,
          total: Number.parseInt(this._getBatchResultByIndex(responseResult.result_total, index) || '0'),
          next: Number.parseInt(this._getBatchResultByIndex(responseResult.result_next, index) || '0'),
          time: resultTime!
        },
        query: {
          method: methodName,
          params: command.query || {},
          requestId: responseHelper.requestId
        },
        status: responseHelper.response.getStatus()
      })

      results.set(index, result)

      return
    }

    if (responseHelper.parallelDefaultValue) {
      throw new SdkError({
        code: 'JSSDK_INTERACTION_BATCH_STRATEGY_V2_EMPTY_COMMAND_RESPONSE',
        description: `There were difficulties parsing the response for batch { index: ${index}, method: ${command.method} }`,
        status: 500
      })
    }
  }
  // endregion ////

  // region handleResults ////
  public override async handleResults<T>(_commands: BatchCommandV3[], results: ResultItems<T>, responseHelper: ResponseHelper<T>): Promise<Result<ICallBatchResult<T>>> {
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

        // @todo fix docs
        // @memo we not throw ajaxError
        this._processResponseError<T>(result, ajaxError, `${index}`)
        dataResult.set(index, data)

        // if (responseHelper.parallelDefaultValue && !data.isSuccess) {
        //   this._processResponseError<T>(result, ajaxError, `${index}`)
        //   dataResult.set(index, data)
        //   continue
        // }
        //
        // throw ajaxError
      }

      dataResult.set(index, data)
    }

    result.setData({
      result: dataResult,
      time: responseHelper.response.getData()!.time
    })

    return result
  }
  // endregion ////
}
