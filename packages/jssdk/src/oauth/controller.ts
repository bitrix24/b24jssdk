import { LoggerBrowser } from '../logger/browser'
import { AbstractB24 } from '../core/abstract-b24'
import type { TypeB24 } from '../types/b24'
import Http from '../core/http/controller'
import { AuthOAuthManager } from './auth'
import type { AuthActions, B24OAuthParams, B24OAuthSecret } from '../types/auth'

/**
 * B24.OAuth Manager
 * @todo add docs
 * @todo add link
 */
export class B24OAuth extends AbstractB24 implements TypeB24 {
  readonly #authOAuthManager: AuthOAuthManager

  constructor(
    authOptions: B24OAuthParams,
    oAuthSecret: B24OAuthSecret
  ) {
    super()

    this.#authOAuthManager = new AuthOAuthManager(authOptions, oAuthSecret)

    this._http = new Http(
      this.#authOAuthManager.getTargetOriginWithPath(),
      this.#authOAuthManager,
      this._getHttpOptions()
    )

    this._isInit = true
  }

  public async initIsAdmin(): Promise<void> {
    if (!this._http) {
      throw new Error('Http Not init')
    }
    return this.#authOAuthManager.initIsAdmin(this._http)
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
