import type { TypeB24 } from '../../types/b24'
import type { LoggerInterface } from '../../types/logger'
import type { AbstractTool } from './abstract-tool'
import { LoggerFactory } from '../../logger'
import { Ping } from './ping'
import { HealthCheck } from './healthcheck'

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
    const toolName = Symbol('ping')
    if (!this._mapTools.has(toolName)) {
      this._mapTools.set(toolName, new Ping(this._b24, this._logger))
    }
    return this._mapTools.get(toolName)! as Ping
  }

  get healthCheck(): HealthCheck {
    const toolName = Symbol('healthCheck')
    if (!this._mapTools.has(toolName)) {
      this._mapTools.set(toolName, new HealthCheck(this._b24, this._logger))
    }
    return this._mapTools.get(toolName)! as HealthCheck
  }
}
