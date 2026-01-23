import type { TypeB24 } from '../../types/b24'
import type { LoggerInterface } from '../../types/logger'
import { LoggerFactory } from '../../logger'
import { ApiVersion } from '../../types/b24'
import { ActionsManagerV2 } from './v2/manager-v2'
import { ActionsManagerV3 } from './v3/manager-v3'

const apiV2Name = Symbol(ApiVersion.v2)
const apiV3Name = Symbol(ApiVersion.v3)
/**
 * Some actions for TypeB24
 */
export class ActionsManager {
  protected _b24: TypeB24
  protected _logger: LoggerInterface

  protected _mapActions: Map<symbol, any>

  constructor(b24: TypeB24) {
    this._b24 = b24
    this._logger = LoggerFactory.createNullLogger()

    this._mapActions = new Map()
  }

  public setLogger(logger: LoggerInterface): void {
    this._logger = logger
    this.v2.setLogger(this._logger)
    this.v3.setLogger(this._logger)
  }

  public getLogger(): LoggerInterface {
    return this._logger
  }

  get v2(): ActionsManagerV2 {
    if (!this._mapActions.has(apiV2Name)) {
      this._mapActions.set(apiV2Name, new ActionsManagerV2(this._b24))
    }
    return this._mapActions.get(apiV2Name)! as ActionsManagerV2
  }

  get v3(): ActionsManagerV3 {
    if (!this._mapActions.has(apiV3Name)) {
      this._mapActions.set(apiV3Name, new ActionsManagerV3(this._b24))
    }
    return this._mapActions.get(apiV3Name)! as ActionsManagerV3
  }
}
