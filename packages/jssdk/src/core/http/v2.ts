import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal, ICallBatchOptions, ICallBatchResult,
  TypeHttp
} from '../../types/http'
import type { AuthActions } from '../../types/auth'
import type { RestrictionParams } from '../../types/limiters'
import type { Result } from '../result'
import type { BatchPayload } from '../../types/payloads'
import { AbstractHttp } from './abstract-http'
import { ApiVersion } from '../../types/b24'
import { InteractionBatchV2 } from '../interaction/batch/v2'
import { ProcessingAsArrayV2 } from '../interaction/batch/processing/v2/as-array'
import { ProcessingAsObjectV2 } from '../interaction/batch/processing/v2/as-object'
import { AjaxError } from './ajax-error'

/**
 * Class for working with RestApi v2 requests via http
 *
 * @link https://bitrix24.github.io/b24jssdk/
 *
 * @todo docs
 */
export class HttpV2 extends AbstractHttp implements TypeHttp {
  constructor(
    authActions: AuthActions,
    options?: null | object,
    restrictionParams?: Partial<RestrictionParams>
  ) {
    super(authActions, options, restrictionParams)
    this._version = ApiVersion.v2
  }

  // region batch ////
  public async batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const opts = {
      isHaltOnError: true,
      ...options
    }

    const requestId = opts.requestId ?? this._requestIdGenerator.getRequestId()

    this._logBatchStart(requestId, calls, opts)

    const interactionBatch = new InteractionBatchV2({
      requestId,
      parallelDefaultValue: !(opts.isHaltOnError),
      restrictionManager: this._restrictionManager
    })

    if (Array.isArray(calls)) {
      interactionBatch.setProcessingStrategy(new ProcessingAsArrayV2())
    } else {
      interactionBatch.setProcessingStrategy(new ProcessingAsObjectV2())
    }

    interactionBatch.addCommands(calls)

    if (interactionBatch.size > interactionBatch.maxSize) {
      throw new AjaxError({
        code: 'JSSDK_BATCH_TOO_LARGE',
        description: `Batch too large: ${interactionBatch.size} commands (max: ${interactionBatch.maxSize})`,
        status: 400,
        requestInfo: { method: 'batch', params: { cmd: calls }, requestId },
        originalError: null
      })
    }

    if (interactionBatch.size === 0) {
      throw new AjaxError({
        code: 'JSSDK_BATCH_EMPTY',
        description: 'Batch must contain at least one command',
        status: 400,
        requestInfo: { method: 'batch', params: { cmd: calls }, requestId },
        originalError: null
      })
    }

    const responseBatch = await this.call<BatchPayload<T>>(
      'batch',
      {
        halt: opts.isHaltOnError ? 1 : 0,
        cmd: interactionBatch.getCommandsForCall()
      },
      requestId
    )

    const response = await interactionBatch.prepareResponse<T>(responseBatch)

    // Log the results
    this._logBatchCompletion(
      requestId,
      response.getData()?.result?.size ?? 0,
      response.getErrorMessages().length
    )

    return response
  }
  // endregion ////
}
