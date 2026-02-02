import type { TypeB24 } from '../../../types/b24'
import type { LoggerInterface } from '../../../types/logger'
import type { AbstractAction } from '../abstract-action'
import { LoggerFactory } from '../../../logger'
import { CallV2 } from './call'
import { CallListV2 } from './call-list'
import { FetchListV2 } from './fetch-list'
import { BatchV2 } from './batch'
import { BatchByChunkV2 } from './batch-by-chunk'

const callName = Symbol('call_V2')
const callListName = Symbol('callList_V2')
const fetchListName = Symbol('fetchList_V2')
const batchName = Symbol('batch_V2')
const batchByChunkName = Symbol('batchByChunk_V2')

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

  get call(): CallV2 {
    if (!this._mapActions.has(callName)) {
      this._mapActions.set(callName, new CallV2(this._b24, this._logger))
    }
    return this._mapActions.get(callName)! as CallV2
  }

  get callList(): CallListV2 {
    if (!this._mapActions.has(callListName)) {
      this._mapActions.set(callListName, new CallListV2(this._b24, this._logger))
    }
    return this._mapActions.get(callListName)! as CallListV2
  }

  get fetchList(): FetchListV2 {
    if (!this._mapActions.has(fetchListName)) {
      this._mapActions.set(fetchListName, new FetchListV2(this._b24, this._logger))
    }
    return this._mapActions.get(fetchListName)! as FetchListV2
  }

  get batch(): BatchV2 {
    if (!this._mapActions.has(batchName)) {
      this._mapActions.set(batchName, new BatchV2(this._b24, this._logger))
    }
    return this._mapActions.get(batchName)! as BatchV2
  }

  get batchByChunk(): BatchByChunkV2 {
    if (!this._mapActions.has(batchByChunkName)) {
      this._mapActions.set(batchByChunkName, new BatchByChunkV2(this._b24, this._logger))
    }
    return this._mapActions.get(batchByChunkName)! as BatchByChunkV2
  }
}
