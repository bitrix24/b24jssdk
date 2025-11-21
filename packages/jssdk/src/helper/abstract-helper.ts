import { LoggerBrowser, LoggerType } from '../logger/browser'
import type { TypeB24 } from '../types/b24'

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
  protected _logger: null | LoggerBrowser = null
  protected _data: any = null

  // region Init ////
  constructor(b24: TypeB24) {
    this._b24 = b24
  }

  setLogger(logger: LoggerBrowser): void {
    this._logger = logger
  }

  getLogger(): LoggerBrowser {
    if (null === this._logger) {
      this._logger = LoggerBrowser.build(`NullLogger`)

      this._logger.setConfig({
        [LoggerType.desktop]: false,
        [LoggerType.log]: false,
        [LoggerType.info]: false,
        [LoggerType.warn]: false,
        [LoggerType.error]: true,
        [LoggerType.trace]: false
      })
    }

    return this._logger
  }
  // endregion ////

  /**
   * Initializes the data received
   * @param data
   */
  async initData(data: any): Promise<void> {
    this.getLogger().log(data)
    return Promise.reject(new Error('Rewrite this function'))
  }

  abstract get data(): any
}
