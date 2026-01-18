import type { IProcessingStrategy } from './processing/interface-strategy'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchCommandV3, BatchNamedCommandsUniversal,
  ICallBatchOptions, ICallBatchResult
} from '../../../types/http'
import type { RestrictionManager } from '../../http/limiters/manager'
import type { BatchPayload, BatchPayloadResult, PayloadTime } from '../../../types/payloads'
import type { Result } from '../../result'
import type { AjaxResult } from '../../http/ajax-result'
import type { NumberString } from '../../../types/common'
import { SdkError } from '../../sdk-error'

export interface BatchResponseData<T = unknown> {
  readonly result?: T[] | Record<string | number, T>
  readonly result_error?: string[] | Record<string | number, string>
  readonly result_total?: NumberString[] | Record<string | number, NumberString>
  readonly result_next?: NumberString[] | Record<string | number, NumberString>
  readonly result_time?: PayloadTime[] | Record<string | number, PayloadTime>
}

export type InteractionBatchOptions = Required<Omit<ICallBatchOptions, 'isHaltOnError' | 'isObjectMode'>> & {
  /**
   * @memo this regeneration is `isHaltOnError` and it is currently `!isHaltOnError`
   */
  parallelDefaultValue: boolean
  restrictionManager: RestrictionManager
  processingStrategy?: IProcessingStrategy
}

export type ResponseHelper = {
  requestId: string
  status: number
  time: PayloadTime
  restrictionManager: RestrictionManager
}

/**
 * Working with batch requests
 */
export abstract class AbstractInteractionBatch {
  protected parallelDefaultValue: boolean
  protected requestId: string
  protected restrictionManager: RestrictionManager
  // @memo this regeneration -> isObjectMode
  protected processingStrategy?: IProcessingStrategy

  protected _commands: BatchCommandV3[] = []

  constructor(options: InteractionBatchOptions) {
    this.parallelDefaultValue = options.parallelDefaultValue
    this.requestId = options.requestId
    this.restrictionManager = options.restrictionManager
    this.processingStrategy = options.processingStrategy
  }

  // region Setter Strategy ////
  public setProcessingStrategy(processingStrategy: IProcessingStrategy) {
    this.processingStrategy = processingStrategy
  }
  // endregion ////

  // region Getter ////
  get size(): number {
    return this._commands.length
  }

  get maxSize(): number {
    return 0
  }
  // endregion ////

  // region Request ////
  public addCommands(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  ): void {
    if (!this.processingStrategy) {
      throw new SdkError({
        code: 'JSSDK_INTERACTION_BATCH_EMPTY_PROCESSING_STRATEGY',
        description: 'ProcessingStrategy not set',
        status: 500
      })
    }

    this._commands = this.processingStrategy.prepareCommands(calls, {
      parallelDefaultValue: this.parallelDefaultValue
    })
  }

  public getCommandsForCall(): unknown {
    if (!this.processingStrategy) {
      throw new SdkError({
        code: 'JSSDK_INTERACTION_BATCH_EMPTY_PROCESSING_STRATEGY',
        description: 'ProcessingStrategy not set',
        status: 500
      })
    }

    return this.processingStrategy.buildCommands(this._commands)
  }
  // endregion ////

  // region Response ////
  public async prepareResponse<T>(response: AjaxResult<BatchPayload<T>>): Promise<Result<ICallBatchResult<T>>> {
    if (!this.processingStrategy) {
      throw new SdkError({
        code: 'JSSDK_INTERACTION_BATCH_EMPTY_PROCESSING_STRATEGY',
        description: 'ProcessingStrategy not set',
        status: 500
      })
    }

    const responseData = response.getData()
    const responseHelper = {
      requestId: response.getQuery().requestId,
      parallelDefaultValue: this.parallelDefaultValue,
      restrictionManager: this.restrictionManager,
      status: response.getStatus(),
      data: responseData!.result as BatchPayloadResult<T>,
      time: responseData!.time
    }

    const results = await this.processingStrategy.prepareItems<T>(this._commands, responseHelper)

    return this.processingStrategy.handleResults<T>(results, responseHelper)
  }
  // endregion ////
}
