import type { BatchCommandV3 } from '../../../../../types/http'
import type { IProcessingStrategy, ResponseHelper } from '../interface-strategy'
import type { BatchResponseData } from '../../abstract-interaction-batch'
import { AbstractProcessing } from '../interface-strategy'
import { SdkError } from '../../../../sdk-error'
import { AjaxResult } from '../../../../http/ajax-result'

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

  /**
   * @todo ! api ver3 waite docs - this fake
   */
  protected override async _processResponseItem<T>(
    command: BatchCommandV3,
    index: string | number,
    responseHelper: ResponseHelper<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void> {
    const responseResult = responseHelper.data as BatchResponseData<T>
    const resultData = this._getBatchResultByIndex((responseResult as T[] | Record<string | number, T> | undefined), index)

    /**
     * @todo ! api ver3 waite docs - this fake
     */
    const resultError = undefined
    // Update operating statistics for each method in the batch
    const result = new AjaxResult<T>({
      answer: {
        result: (resultData ?? {}) as T,
        /**
         * @todo ! api ver3 waite docs - this fake
         */
        error: resultError,
        /**
         * @todo ! api ver3 waite docs - this fake
         */
        time: responseHelper.time
      },
      query: {
        method: command.method,
        params: command.query || {},
        requestId: responseHelper.requestId
      },
      status: responseHelper.status
    })

    results.set(index, result)
    return
  }
}
