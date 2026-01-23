import type { TypeB24 } from '../../../types/b24'
import type { LoggerInterface } from '../../../types/logger'
import type { AbstractAction } from '../abstract-action'
import { LoggerFactory } from '../../../logger'
import { Call } from './call'
import { CallFastListMethod } from './call-fast-list'
import { FetchListMethod } from './fetch-list'

const callName = Symbol('call_V3')
const callFastListMethodName = Symbol('callFastListMethod_V3')
const fetchListMethodName = Symbol('fetchListMethod_v3')
/**
 * Some actions for TypeB24 by Api:v3
 */
export class ActionsManagerV3 {
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
    if (!this._mapActions.has(callName)) {
      this._mapActions.set(callName, new Call(this._b24, this._logger))
    }
    return this._mapActions.get(callName)! as Call
  }

  get callFastListMethod(): CallFastListMethod {
    if (!this._mapActions.has(callFastListMethodName)) {
      this._mapActions.set(callFastListMethodName, new CallFastListMethod(this._b24, this._logger))
    }
    return this._mapActions.get(callFastListMethodName)! as CallFastListMethod
  }

  get fetchListMethod(): FetchListMethod {
    if (!this._mapActions.has(fetchListMethodName)) {
      this._mapActions.set(fetchListMethodName, new FetchListMethod(this._b24, this._logger))
    }
    return this._mapActions.get(fetchListMethodName)! as FetchListMethod
  }
}
