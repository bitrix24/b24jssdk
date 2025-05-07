import { LoggerBrowser } from '../logger/browser'
import { AbstractB24 } from '../core/abstract-b24'
import type { TypeB24 } from '../types/b24'
import Http from '../core/http/controller'
import { AuthOAuthManager } from './auth'
import type { AuthActions } from '../types/auth'
import type { B24OAuthParams } from './auth'
import type { AuthRefreshCallback } from './auth'

/**
 * B24.OAuth Manager
 */
export class B24OAuth extends AbstractB24 implements TypeB24 {
  readonly #authOAuthManager: AuthOAuthManager

  constructor(b24OAuthParams: B24OAuthParams, refreshCallback?: AuthRefreshCallback) {
    super()

    this.#authOAuthManager = new AuthOAuthManager(b24OAuthParams, refreshCallback)

    this._http = new Http(
      this.#authOAuthManager.getTargetOriginWithPath(),
      this.#authOAuthManager,
      this._getHttpOptions()
    )
    
    this._isInit = true
  }

  /**
   * Sets a custom logger instance
   * @param logger - Browser logger instance
   */
  public override setLogger(logger: LoggerBrowser): void {
    super.setLogger(logger)
  }

  /**
   * Gets the authentication manager instance
   */
  override get auth(): AuthActions {
    return this.#authOAuthManager
  }

  /**
   * Gets the base target origin URL
   * @returns Base Bitrix24 URL
   */
  override getTargetOrigin(): string {
    this._ensureInitialized()
    return this.#authOAuthManager.getTargetOrigin()
  }

  /**
   * Gets the target origin URL with REST API path
   * @returns Bitrix24 REST API URL
   */
  override getTargetOriginWithPath(): string {
    this._ensureInitialized()
    return this.#authOAuthManager.getTargetOriginWithPath()
  }
} 