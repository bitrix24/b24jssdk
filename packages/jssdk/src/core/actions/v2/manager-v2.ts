import type { TypeB24 } from '../../../types/b24'
import type { LoggerInterface } from '../../../types/logger'
import type { AbstractAction } from '../abstract-action'
import { LoggerFactory } from '../../../logger'
import { Call } from './call'
import { CallFastListMethod } from './call-fast-list'
import { FetchListMethod } from './fetch-list'

/**
 * Some actions for TypeB24 by Api:v2
 */
export class ActionsManagerV2 {
  protected _b24: TypeB24
  protected _logger: LoggerInterface

  protected _mapActions: Map<symbol, AbstractAction>

  constructor(b24: TypeB24) {
    this._b24 = b24
    this._logger = LoggerFactory.createNullLogger()

    this._mapActions = new Map()
  }

  public setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  public getLogger(): LoggerInterface {
    return this._logger
  }

  get call(): Call {
    const toolName = Symbol('call')
    if (!this._mapActions.has(toolName)) {
      this._mapActions.set(toolName, new Call(this._b24, this._logger))
    }
    return this._mapActions.get(toolName)! as Call
  }

  get callFastListMethod(): CallFastListMethod {
    const toolName = Symbol('callFastListMethod')
    if (!this._mapActions.has(toolName)) {
      this._mapActions.set(toolName, new CallFastListMethod(this._b24, this._logger))
    }
    return this._mapActions.get(toolName)! as CallFastListMethod
  }

  get fetchListMethod(): FetchListMethod {
    const toolName = Symbol('fetchListMethod')
    if (!this._mapActions.has(toolName)) {
      this._mapActions.set(toolName, new FetchListMethod(this._b24, this._logger))
    }
    return this._mapActions.get(toolName)! as FetchListMethod
  }
}
