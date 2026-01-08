import type { AuthActions, B24OAuthParams, B24OAuthSecret, CallbackRefreshAuth, CustomRefreshAuth } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import type { TypeB24 } from '../types/b24'
import { AbstractB24 } from '../core/abstract-b24'
import Http from '../core/http/controller'
import { AuthOAuthManager } from './auth'
import { ApiVersion } from '../types/b24'

/**
 * B24.OAuth Manager
 * @todo add docs
 *
 * @link https://apidocs.bitrix24.com/sdk/oauth/index.html
 */
export class B24OAuth extends AbstractB24 implements TypeB24 {
  readonly #authOAuthManager: AuthOAuthManager

  readonly #version: ApiVersion

  // region Init ////
  constructor(
    authOptions: B24OAuthParams,
    oAuthSecret: B24OAuthSecret,
    options?: {
      version?: ApiVersion
      restrictionParams?: Partial<RestrictionParams>
    }
  ) {
    super()

    this.#version = options?.version ?? ApiVersion.v2
    this.#authOAuthManager = new AuthOAuthManager(
      authOptions,
      oAuthSecret,
      this.#version
    )

    this._http = new Http(
      this.#authOAuthManager,
      this._getHttpOptions(),
      options?.restrictionParams
    )
    this._http.setClientSideWarning(
      true,
      'It is not safe to use oauth requests on the client side'
    )

    this._isInit = true
  }

  /**
   * Used to initialize information about the current user.
   */
  public async initIsAdmin(requestId?: string): Promise<void> {
    this._ensureInitialized()
    return this.#authOAuthManager.initIsAdmin(this._http!, requestId)
  }

  /**
   * Sets an asynchronous Callback to receive updated authorization data
   * @param cb
   */
  setCallbackRefreshAuth(cb: CallbackRefreshAuth): void {
    this._ensureInitialized()
    this.#authOAuthManager.setCallbackRefreshAuth(cb)
  }

  /**
   * Removes Callback to receive updated authorization data
   */
  removeCallbackRefreshAuth(): void {
    this._ensureInitialized()
    this.#authOAuthManager.removeCallbackRefreshAuth()
  }

  /**
   * Sets an asynchronous function for custom get new refresh token
   * @param cb
   */
  setCustomRefreshAuth(cb: CustomRefreshAuth): void {
    this._ensureInitialized()
    this.#authOAuthManager.setCustomRefreshAuth(cb)
  }

  /**
   * Removes function for custom get new refresh token
   */
  removeCustomRefreshAuth(): void {
    this._ensureInitialized()
    this.#authOAuthManager.removeCustomRefreshAuth()
  }
  // endregion ////

  // region Core ////
  /**
   * Disables warning about client-side query execution
   */
  public offClientSideWarning(): void {
    this.getHttpClient().setClientSideWarning(false, '')
  }
  // endregion ////

  override get auth(): AuthActions {
    return this.#authOAuthManager
  }

  // region Get ////
  /**
   * Get the account address BX24 ( https://name.bitrix24.com )
   */
  override getTargetOrigin(): string {
    this._ensureInitialized()
    return this.#authOAuthManager.getTargetOrigin()
  }

  /**
   * Get the account address BX24 with path
   * - for ver1 `https://name.bitrix24.com/rest`
   * - for ver2 `https://name.bitrix24.com/rest`
   * - for ver3` https://name.bitrix24.com/rest/api`
   */
  override getTargetOriginWithPath(): string {
    this._ensureInitialized()
    return this.#authOAuthManager.getTargetOriginWithPath()
  }
  // endregion ////

  // region Tools ////
  // endregion ////
}
