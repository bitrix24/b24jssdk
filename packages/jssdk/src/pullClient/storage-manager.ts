import type { StorageManagerParams, TypeStorageManager } from '../types/pull'
import type { LoggerInterface } from '../logger'
import { LoggerFactory } from '../logger'
import { Text } from '../tools/text'

export class StorageManager implements TypeStorageManager {
  private _logger: LoggerInterface

  private readonly userId: number
  private readonly siteId: string

  constructor(params: StorageManagerParams = {}) {
    this._logger = LoggerFactory.createNullLogger()
    this.userId = params.userId ? Text.toInteger(params.userId) : 0
    this.siteId = params.siteId ?? 'none'
  }

  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
    return this._logger
  }

  set(name: string, value: any): void {
    if (typeof window.localStorage === 'undefined') {
      this.getLogger().error('localStorage undefined', {
        error: new Error('undefined window.localStorage')
      })
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
      this.getLogger().error('localStorage undefined', {
        error: new Error('undefined window.localStorage')
      })
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
