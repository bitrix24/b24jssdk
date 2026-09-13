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
import type { LoggerInterface } from '../../../types/logger'
import { SdkError } from '../../sdk-error'
import { LoggerFactory } from '../../../logger'

/**
 * The keys a batch command object is read for. Anything else a caller put there
 * is ignored, and the one that matters is `query`: on `restApi:v3` that is the
 * portal's own wire name for a command's arguments, so a caller reading the
 * portal reference — or translating a `curl` example — reaches for it naturally.
 */
const READ_COMMAND_KEYS: readonly string[] = ['method', 'params', 'as', 'parallel']

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
 *
 * The union carries no discriminant, so nothing in the type system enforces
 * that a v2 strategy only ever sees a v2 response — that coupling is held by
 * `HttpV2`/`HttpV3` each constructing their own `InteractionBatch`. Do not read
 * `getData()!.result` generically outside the paired processing strategy: there
 * is no tag to branch on, and picking the wrong arm compiles.
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
  /** The transport's logger, forwarded to `ParseRow` for its command-key warning. */
  logger?: LoggerInterface
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
  protected logger?: LoggerInterface
  // @memo this regeneration -> isObjectMode
  protected processingStrategy?: IProcessingStrategy

  protected _commands: BatchCommandV3[] = []

  constructor(options: InteractionBatchOptions) {
    this.parallelDefaultValue = options.parallelDefaultValue
    this.requestId = options.requestId
    this.restrictionManager = options.restrictionManager
    this.processingStrategy = options.processingStrategy
    this.logger = options.logger
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

    this._warnUnreadCommandKeys(calls)

    this._commands = this.processingStrategy.prepareCommands(calls, {
      parallelDefaultValue: this.parallelDefaultValue
    })
  }

  /**
   * Warns when a command carries a key the parser does not read.
   *
   * `query` is the reason this exists. On `restApi:v3` the portal's own
   * reference calls a command's arguments `query`, and so does every `curl`
   * example; the SDK's key is `params`, and it writes the wire name for you.
   * Write `query` yourself and the arguments are read by nobody — the command
   * goes out with an empty `query`, which the portal **accepts**. Measured on
   * `main.eventlog.list`: `params: { select: ['id'], pagination: { limit: 2 } }`
   * returns two rows of one field, the same spelled `query` returns full records
   * at the default page size. HTTP 200, no error anywhere.
   *
   * `restApi:v2` loses them just as quietly by a different route: there the
   * arguments are serialised into the `cmd` querystring from `params`, so the
   * command goes out as `method?` with nothing after it. Measured on `user.get`:
   * `params: { filter: { ACTIVE: 'N' } }` returns no rows, the same spelled
   * `query` returns the active users the filter was meant to exclude.
   *
   * So there is nothing to notice on either version: no error, no empty result,
   * just an answer to a question nobody asked.
   *
   * TypeScript catches a fresh object literal and nothing more — assign it to a
   * variable first, or build the commands from a config object, a `JSON.parse`,
   * or plain JavaScript, and the compiler never sees it. Same hole
   * `_warnMisplacedOptions` was written for (#426), and the same trade: warn
   * rather than throw, because the call still does something. Through
   * `forcedLog`, because the default logger is silent and a caller who has not
   * wired one up is exactly who this is for (#483).
   *
   * Once per `addCommands`, not once per command: 50 commands built from one bad
   * template would otherwise be 50 identical console lines, and again for every
   * `batchByChunk` chunk. The keys are collected across the batch and reported
   * together, with the command positions that carried them.
   *
   * Own enumerable string keys only, so a key on a prototype, a symbol key, or a
   * non-enumerable one is not seen — and a tuple carrying extra elements is not
   * checked at all. All are the quiet direction: this exists to catch the
   * ordinary mistake, not to validate every shape a caller can build.
   *
   * `forcedLog` reaches the console only while the app has wired no logger of
   * its own. One that filters by level may drop this, like every other SDK
   * warning.
   */
  protected _warnUnreadCommandKeys(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  ): void {
    const unread = new Set<string>()
    const positions: string[] = []

    for (const [index, row] of Object.entries(calls)) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        continue
      }

      // `Object.keys`, never `Object.values`, and that is load-bearing: what
      // reaches the message is key NAMES, which cannot carry a credential the
      // way a value can. `local/no-credential-in-logger` cannot see through the
      // string building below, so a later "show the value too, it's friendlier"
      // edit would pass lint — it is a security change and should read as one.
      const rowUnread = Object.keys(row).filter(key => !READ_COMMAND_KEYS.includes(key))

      if (0 === rowUnread.length) {
        continue
      }

      // Narrow on purpose: an unread key is only worth saying something about
      // when the arguments are actually missing, or when it is `query` — the one
      // name that is never right here. A caller who carries their own `id`,
      // `label` or `_meta` beside a populated `params` has lost nothing, and
      // warning them on every command of every batch, with advice to move it
      // into `params`, would be both noise and wrong.
      const hasParams = undefined !== (row as { params?: unknown }).params
      const namesTheWireKey = rowUnread.includes('query')

      if (hasParams && !namesTheWireKey) {
        continue
      }

      rowUnread.forEach(key => unread.add(key))
      positions.push(index)
    }

    if (0 === unread.size) {
      return
    }

    const keys = [...unread]

    LoggerFactory.forcedLog(
      this.logger ?? LoggerFactory.createNullLogger(),
      'warning',
      `[b24jssdk] batch command: ${keys.join(', ')} `
      + `${1 === keys.length ? 'is' : 'are'} ignored — `
      + 'a command\'s arguments go in `params`. Write `params: { … }`. '
      + '(`query` is the portal\'s own wire spelling on `restApi:v3`, which the SDK writes for you; '
      + 'on `restApi:v2` the arguments are serialised into the `cmd` querystring instead.)',
      {
        code: 'JSSDK_BATCH_UNREAD_COMMAND_KEY',
        unread: keys.join(', '),
        read: READ_COMMAND_KEYS.join(', '),
        commands: positions.join(', ')
      }
    ).catch(() => {})
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
