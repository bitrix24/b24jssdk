import type { IProcessingStrategy } from './processing/interface-strategy'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchCommandV3, BatchNamedCommandsUniversal,
  ICallBatchOptions, ICallBatchResult
} from '../../../types/http'
import type { RestrictionManager } from '../../http/limiters/manager'
import type { PayloadTime } from '../../../types/payloads'
import type { Result } from '../../result'
import type { AjaxResult } from '../../http/ajax-result'
import type { NumberString } from '../../../types/common'
import type { TypeDescriptionError } from '../../../types/auth'
import { SdkError } from '../../sdk-error'

export interface BatchResponseData<T = unknown> {
  readonly result?: T[] | Record<string | number, T>
  readonly result_error?: (string | TypeDescriptionError)[] | Record<string | number, string | TypeDescriptionError>
  readonly result_total?: NumberString[] | Record<string | number, NumberString>
  readonly result_next?: NumberString[] | Record<string | number, NumberString>
  readonly result_time?: PayloadTime[] | Record<string | number, PayloadTime>
}

/**
 * What a `batch` call's `result` field actually holds, i.e. what
 * `AjaxResult.getData()!.result` returns for a batch response.
 *
 * `AjaxResult<X>` already means "the payload is `{ result: X, time }`", so the
 * type argument is the INNER value, not the whole envelope. This used to be
 * written `AjaxResult<BatchPayload<T>>`, which described one envelope too many
 * (`{ result: { result: …, time }, time }`) — every consumer then had to launder
 * the difference through `as unknown as`, and those casts were load-bearing
 * rather than cosmetic: they silenced a real mismatch.
 *
 * The two arms are the two REST versions, which genuinely differ:
 * - **v2** splits the response into `result` / `result_error` / `result_time` /
 *   `result_total` / `result_next` — {@link BatchResponseData}.
 * - **v3** puts the per-command results directly in `result`, with no
 *   per-command error or time split.
 *
 * Each version's strategy narrows the union with a plain `as`, which is a
 * narrowing the runtime really does make (the transport knows its own version)
 * rather than an unchecked reinterpretation.
 */
export type BatchResponsePayload<T = unknown>
  = BatchResponseData<T>
    | T[]
    | Record<string | number, T>

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
  public abstract prepareResponse<T>(response: AjaxResult<BatchResponsePayload<T>>): Promise<Result<ICallBatchResult<T>>>
  // endregion ////
}
