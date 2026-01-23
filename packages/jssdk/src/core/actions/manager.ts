import type { TypeB24 } from '../../types/b24'
import type { LoggerInterface } from '../../types/logger'
import { LoggerFactory } from '../../logger'
import { ApiVersion } from '../../types/b24'
import { ActionsManagerV2 } from './v2/manager-v2'
import { ActionsManagerV3 } from './v3/manager-v3'

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
    const toolName = Symbol(ApiVersion.v2)
    if (!this._mapActions.has(toolName)) {
      this._mapActions.set(toolName, new ActionsManagerV2(this._b24))
    }
    return this._mapActions.get(toolName)! as ActionsManagerV2
  }

  get v3(): ActionsManagerV3 {
    const toolName = Symbol(ApiVersion.v3)
    if (!this._mapActions.has(toolName)) {
      this._mapActions.set(toolName, new ActionsManagerV3(this._b24))
    }
    return this._mapActions.get(toolName)! as ActionsManagerV3
  }
}
