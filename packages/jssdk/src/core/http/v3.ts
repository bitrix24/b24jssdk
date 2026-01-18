import type {
  BatchCommandsArrayUniversal, BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  ICallBatchOptions,
  ICallBatchResult, TypeCallParams,
  TypeHttp
} from '../../types/http'
import type { AuthActions } from '../../types/auth'
import type { RestrictionParams } from '../../types/limiters'
import type { BatchPayload } from '../../types/payloads'
import type { Result } from '../result'
import { AbstractHttp } from './abstract-http'
import { ApiVersion } from '../../types/b24'
import { AjaxError } from './ajax-error'
import { InteractionBatchV3 } from '../interaction/batch/v3'
import { ProcessingAsArrayV3 } from '../interaction/batch/processing/v3/as-array'
import { ProcessingAsObjectV3 } from '../interaction/batch/processing/v3/as-object'

/**
 * Class for working with RestApi v3 requests via http
 *
 * @link https://bitrix24.github.io/b24jssdk/
 * @link https://apidocs.bitrix24.com/api-reference/rest-v3/index.html
 *
 * @todo docs
 */
export class HttpV3 extends AbstractHttp implements TypeHttp {
  constructor(
    authActions: AuthActions,
    options?: null | object,
    restrictionParams?: Partial<RestrictionParams>
  ) {
    super(authActions, options, restrictionParams)
    this._version = ApiVersion.v3
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

    const interactionBatch = new InteractionBatchV3({
      requestId,
      parallelDefaultValue: !(opts.isHaltOnError),
      restrictionManager: this._restrictionManager
    })

    if (Array.isArray(calls)) {
      interactionBatch.setProcessingStrategy(new ProcessingAsArrayV3())
    } else {
      interactionBatch.setProcessingStrategy(new ProcessingAsObjectV3())
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
      interactionBatch.getCommandsForCall() as TypeCallParams,
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

  // region Prepare ////
  /**
   * @inheritDoc
   */
  protected override _prepareMethod(requestId: string, method: string, baseUrl: string): string {
    const methodUrl = `/${encodeURIComponent(method)}`

    const queryParams = new URLSearchParams({
      [this._requestIdGenerator.getQueryStringParameterName()]: requestId,
      [this._requestIdGenerator.getQueryStringSdkParameterName()]: '__SDK_VERSION__',
      [this._requestIdGenerator.getQueryStringSdkTypeParameterName()]: '__SDK_USER_AGENT__'
    })
    return `${baseUrl}${methodUrl}?${queryParams.toString()}`
  }
  // endregion ////
}
