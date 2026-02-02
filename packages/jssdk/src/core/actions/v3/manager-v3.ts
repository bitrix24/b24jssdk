import type { TypeB24 } from '../../../types/b24'
import type { LoggerInterface } from '../../../types/logger'
import type { AbstractAction } from '../abstract-action'
import { LoggerFactory } from '../../../logger'
import { CallV3 } from './call'
import { CallListV3 } from './call-list'
import { FetchListV3 } from './fetch-list'
import { BatchV3 } from './batch'
import { BatchByChunkV3 } from './batch-by-chunk'

const callName = Symbol('call_V3')
const callListName = Symbol('callList_V3')
const fetchListName = Symbol('fetchList_V3')
const batchName = Symbol('batch_V3')
const batchByChunkName = Symbol('batchByChunk_V3')
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

  get call(): CallV3 {
    if (!this._mapActions.has(callName)) {
      this._mapActions.set(callName, new CallV3(this._b24, this._logger))
    }
    return this._mapActions.get(callName)! as CallV3
  }

  get callList(): CallListV3 {
    if (!this._mapActions.has(callListName)) {
      this._mapActions.set(callListName, new CallListV3(this._b24, this._logger))
    }
    return this._mapActions.get(callListName)! as CallListV3
  }

  get fetchList(): FetchListV3 {
    if (!this._mapActions.has(fetchListName)) {
      this._mapActions.set(fetchListName, new FetchListV3(this._b24, this._logger))
    }
    return this._mapActions.get(fetchListName)! as FetchListV3
  }

  get batch(): BatchV3 {
    if (!this._mapActions.has(batchName)) {
      this._mapActions.set(batchName, new BatchV3(this._b24, this._logger))
    }
    return this._mapActions.get(batchName)! as BatchV3
  }

  get batchByChunk(): BatchByChunkV3 {
    if (!this._mapActions.has(batchByChunkName)) {
      this._mapActions.set(batchByChunkName, new BatchByChunkV3(this._b24, this._logger))
    }
    return this._mapActions.get(batchByChunkName)! as BatchByChunkV3
  }
}
