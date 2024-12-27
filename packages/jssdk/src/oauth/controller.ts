import { LoggerBrowser } from '../logger/browser'
import { AbstractB24 } from '../core/abstract-b24'
import type { TypeB24 } from '../types/b24'
import Http from '../core/http/controller'
import { AuthOAuthManager } from './auth'
import type { AuthActions } from '../types/auth'
import type { B24OAuthParams } from './auth'

/**
 * B24.OAuth Manager
 */
export class B24OAuth extends AbstractB24 implements TypeB24 {
  readonly #authOAuthManager: AuthOAuthManager

  constructor(b24OAuthParams: B24OAuthParams) {
    super()

    this.#authOAuthManager = new AuthOAuthManager(b24OAuthParams)

    this._http = new Http(
      this.#authOAuthManager.getTargetOriginWithPath(),
      this.#authOAuthManager,
      this._getHttpOptions()
    )
    
    this._isInit = true
  }

  public override setLogger(logger: LoggerBrowser): void {
    super.setLogger(logger)
  }

  override get auth(): AuthActions {
    return this.#authOAuthManager
  }

  override getTargetOrigin(): string {
    this._ensureInitialized()
    return this.#authOAuthManager.getTargetOrigin()
  }

  override getTargetOriginWithPath(): string {
    this._ensureInitialized()
    return this.#authOAuthManager.getTargetOriginWithPath()
  }
} 