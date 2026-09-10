import { AbstractInteractionBatch } from './abstract-interaction-batch'
import type { BatchResponsePayload } from './abstract-interaction-batch'
import type { AjaxResult } from '../../http/ajax-result'
import type { Result } from '../../result'
import type { ICallBatchResult } from '../../../types/http'
import { SdkError } from '../../sdk-error'

/**
 * Working with batch requests in `restApi:v3`
 */

/**
 * The **SDK's own** ceiling on commands in one `restApi:v3` batch.
 *
 * Not the portal's. 51 commands posted straight at the v3 batch endpoint came
 * back HTTP 200 with 51 results — measured on an on-premise build
 * (`SM_VERSION 26.700.0`). So the real v3 boundary, wherever it is, is above 51
 * and is not published anywhere we can read.
 *
 * 50 is chosen to match `restApi:v2`, where the server does enforce one:
 * `CRestUtil::BATCH_MAX_LENGTH = 50`, checked per command, over-length answered
 * with `ERROR_BATCH_LENGTH_EXCEEDED` — read in the portal's PHP sources rather
 * than measured. Holding both versions to one number keeps `batchByChunk`'s
 * chunking identical across them and keeps the failure client-side, where it is
 * a named error rather than whatever the server would do past its own limit.
 *
 * Raising it is a runtime change, not a documentation one: 51 is a lower bound,
 * not a boundary, and `batchByChunk` already covers callers who have more.
 */
export const MAX_BATCH_COMMANDS_V3 = 50

export class InteractionBatchV3 extends AbstractInteractionBatch {
  override get maxSize(): number {
    return MAX_BATCH_COMMANDS_V3
  }

  public override async prepareResponse<T>(response: AjaxResult<BatchResponsePayload<T>>): Promise<Result<ICallBatchResult<T>>> {
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
