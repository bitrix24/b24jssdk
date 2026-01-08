import type { TypeB24 } from '../types/b24'
import type { LoggerInterface } from '../logger'
import { LoggerFactory } from '../logger'

export class UnhandledMatchError extends Error {
  constructor(value: string, ...args: any[]) {
    super(...args)
    this.name = 'UnhandledMatchError'
    this.message = `Unhandled match value of type ${value}`
    this.stack = new Error('for stack').stack
  }
}

export abstract class AbstractHelper {
  protected _b24: TypeB24
  protected _data: any = null

  protected _logger: LoggerInterface

  // region Init ////
  constructor(b24: TypeB24) {
    this._b24 = b24
    this._logger = LoggerFactory.createNullLogger()
  }

  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
    return this._logger
  }
  // endregion ////

  /**
   * Initializes the data received
   */
  async initData(_data: any): Promise<void> {
    return Promise.reject(new Error('Rewrite this function'))
  }

  abstract get data(): any
}
