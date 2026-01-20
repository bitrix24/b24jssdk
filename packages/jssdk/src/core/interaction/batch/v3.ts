import { AbstractInteractionBatch } from './abstract-interaction-batch'
import type { AjaxResult } from '../../http/ajax-result'
import type { BatchPayload } from '../../../types/payloads'
import type { Result } from '../../result'
import type { ICallBatchResult } from '../../../types/http'
import { SdkError } from '../../sdk-error'

/**
 * Working with batch requests in API ver3
 * @todo make it work
 */

/**
 * @todo waite docs apiVer3
 */
export const MAX_BATCH_COMMANDS = 50

export class InteractionBatchV3 extends AbstractInteractionBatch {
  override get maxSize(): number {
    return MAX_BATCH_COMMANDS
  }

  public override async prepareResponse<T>(response: AjaxResult<BatchPayload<T>>): Promise<Result<ICallBatchResult<T>>> {
    if (!this.processingStrategy) {
      throw new SdkError({
        code: 'JSSDK_INTERACTION_BATCH_EMPTY_PROCESSING_STRATEGY',
        description: 'ProcessingStrategy not set',
        status: 500
      })
    }

    // const responseData = response.getData()
    const responseHelper = {
      requestId: response.getQuery().requestId,
      parallelDefaultValue: this.parallelDefaultValue,
      restrictionManager: this.restrictionManager,
      response
    }

    const results = await this.processingStrategy.prepareItems<T>(this._commands, responseHelper)

    return this.processingStrategy.handleResults<T>(this._commands, results, responseHelper)
  }
}
