import type { TypeB24 } from '../../types/b24'
import type { LoggerInterface } from '../../types/logger'

/**
 * Abstract Class for working with actions
 */

export type ActionOptions = {
  [key: string]: any
}

export abstract class AbstractAction {
  protected _b24: TypeB24
  protected _logger: LoggerInterface

  constructor(b24: TypeB24, logger: LoggerInterface) {
    this._b24 = b24
    this._logger = logger
  }

  /**
   * Warns when an option that belongs inside a nested bag was passed at the top
   * level, where it is read by nobody.
   *
   * The action option types no longer carry an index signature, so a TypeScript
   * caller writing an object literal gets a compile error instead. This covers
   * everyone else: JavaScript callers, a literal widened through a variable, and
   * anything crossing a `JSON.parse` boundary. Without it the call simply
   * behaves as though the flag were never set — and a dropped
   * `returnAjaxResult` turns a batch where every command succeeded into one that
   * reads as wholly failed, because `isSuccess` on a raw payload is `undefined`
   * (#426).
   *
   * @param options the argument as received
   * @param nestedKeys names that belong in the nested bag
   * @param nestedName the bag they belong in, for the message
   */
  protected _warnMisplacedOptions(
    options: object | undefined,
    nestedKeys: readonly string[],
    nestedName: string
  ): void {
    if (!options) return

    const misplaced = nestedKeys.filter(key => Object.hasOwn(options, key))
    if (misplaced.length === 0) return

    void this._logger.warning(
      `[b24jssdk] ${misplaced.join(', ')} passed at the top level `
      + `${misplaced.length === 1 ? 'is' : 'are'} ignored — `
      + `${misplaced.length === 1 ? 'it belongs' : 'they belong'} in \`${nestedName}\`. `
      + `Write \`${nestedName}: { ${misplaced.join(', ')} }\`.`
    )
  }

  public abstract make(options?: ActionOptions): AsyncGenerator | Promise<unknown>
}
