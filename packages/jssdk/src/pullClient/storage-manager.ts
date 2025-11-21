import { LoggerBrowser, LoggerType } from '../logger/browser'
import Text from '../tools/text'
import type { StorageManagerParams, TypeStorageManager } from '../types/pull'

export class StorageManager implements TypeStorageManager {
  private _logger: null | LoggerBrowser = null

  private readonly userId: number
  private readonly siteId: string

  constructor(params: StorageManagerParams = {}) {
    this.userId = params.userId ? Text.toInteger(params.userId) : 0
    this.siteId = params.siteId ?? 'none'
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

  set(name: string, value: any): void {
    if (typeof window.localStorage === 'undefined') {
      this.getLogger().error(new Error('undefined window.localStorage'))
      return
    }

    if (typeof value !== 'string' && value) {
      value = JSON.stringify(value)
    }

    window.localStorage.setItem(this._getKey(name), value)
  }

  get(name: string, defaultValue: any): any {
    if (typeof window.localStorage === 'undefined') {
      return defaultValue || null
    }

    const result = window.localStorage.getItem(this._getKey(name))
    if (result === null) {
      return defaultValue || null
    }

    return JSON.parse(result)
  }

  remove(name: string): void {
    if (typeof window.localStorage === 'undefined') {
      this.getLogger().error(new Error('undefined window.localStorage'))
      return
    }

    return window.localStorage.removeItem(this._getKey(name))
  }

  private _getKey(name: string): string {
    return `@bitrix24/b24jssdk-pull-${this.userId}-${this.siteId}-${name}`
  }

  compareKey(eventKey: string, userKey: string): boolean {
    return eventKey === this._getKey(userKey)
  }
}
