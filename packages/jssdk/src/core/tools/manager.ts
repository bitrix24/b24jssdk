import type { TypeB24 } from '../../types/b24'
import type { LoggerInterface } from '../../types/logger'
import type { AbstractTool } from './abstract-tool'
import { LoggerFactory } from '../../logger'
import { Ping } from './ping'
import { HealthCheck } from './healthcheck'

const pingName = Symbol('ping')
const healthCheckName = Symbol('healthCheck')
/**
 * Some tools for TypeB24
 * @todo add docs
 */
export class ToolsManager {
  protected _b24: TypeB24
  protected _logger: LoggerInterface

  protected _mapTools: Map<symbol, AbstractTool>

  constructor(b24: TypeB24) {
    this._b24 = b24
    this._logger = LoggerFactory.createNullLogger()

    this._mapTools = new Map()
  }

  public setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  public getLogger(): LoggerInterface {
    return this._logger
  }

  get ping(): Ping {
    if (!this._mapTools.has(pingName)) {
      this._mapTools.set(pingName, new Ping(this._b24, this._logger))
    }
    return this._mapTools.get(pingName)! as Ping
  }

  get healthCheck(): HealthCheck {
    if (!this._mapTools.has(healthCheckName)) {
      this._mapTools.set(healthCheckName, new HealthCheck(this._b24, this._logger))
    }
    return this._mapTools.get(healthCheckName)! as HealthCheck
  }
}
