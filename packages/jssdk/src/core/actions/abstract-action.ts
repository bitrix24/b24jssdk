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

  public abstract make(options?: ActionOptions): AsyncGenerator | Promise<unknown>
}
