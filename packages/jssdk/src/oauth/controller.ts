import type { AuthActions, B24OAuthParams, B24OAuthSecret, CallbackRefreshAuth, CustomRefreshAuth } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import type { TypeB24, ApiVersion } from '../types/b24'
import { AbstractB24 } from '../core/abstract-b24'
import { HttpV1 } from '../core/http/controller-v1'
import { HttpV2 } from '../core/http/controller-v2'
import { HttpV3 } from '../core/http/controller-v3'
import { AuthOAuthManager } from './auth'
import { versionManager } from '../core/http/version-manager'

/**
 * B24.OAuth Manager
 *
 * @link https://apidocs.bitrix24.com/settings/oauth/index.html
 * @link https://bitrix24.github.io/b24jssdk/docs/oauth/
 *
 * @todo add docs
 */
export class B24OAuth extends AbstractB24 implements TypeB24 {
  readonly #authOAuthManager: AuthOAuthManager

  // region Init ////
  constructor(
    authOptions: B24OAuthParams,
    oAuthSecret: B24OAuthSecret,
    options?: {
      restrictionParams?: Partial<RestrictionParams>
    }
  ) {
    super()

    this.#authOAuthManager = new AuthOAuthManager(
      authOptions,
      oAuthSecret
    )

    const warningText = 'The B24OAuth object is intended exclusively for use on the server.\nA webhook contains a secret access key, which MUST NOT be used in client-side code (browser, mobile app).'

    this._httpV1 = new HttpV1(this.#authOAuthManager, this._getHttpOptions(), options?.restrictionParams)
    this._httpV1.setClientSideWarning(true, warningText)
    this._httpV2 = new HttpV2(this.#authOAuthManager, this._getHttpOptions(), options?.restrictionParams)
    this._httpV2.setClientSideWarning(true, warningText)
    this._httpV3 = new HttpV3(this.#authOAuthManager, this._getHttpOptions(), options?.restrictionParams)
    this._httpV3.setClientSideWarning(true, warningText)

    this._isInit = true
  }

  /**
   * Used to initialize information about the current user.
   *
   * @todo test this
   */
  public async initIsAdmin(requestId?: string): Promise<void> {
    const method = 'profile'

    this._ensureInitialized()

    const version = this.getAllApiVersions().find(version => versionManager.isSupport(version, method))

    if (!version) return
    const client = this.getHttpClient(version)
    return this.#authOAuthManager.initIsAdmin(client, requestId)
  }

  /**
   * Sets an asynchronous Callback to receive updated authorization data
   * @param cb
   */
  public setCallbackRefreshAuth(cb: CallbackRefreshAuth): void {
    this._ensureInitialized()
    this.#authOAuthManager.setCallbackRefreshAuth(cb)
  }

  /**
   * Removes Callback to receive updated authorization data
   */
  public removeCallbackRefreshAuth(): void {
    this._ensureInitialized()
    this.#authOAuthManager.removeCallbackRefreshAuth()
  }

  /**
   * Sets an asynchronous function for custom get new refresh token
   * @param cb
   */
  public setCustomRefreshAuth(cb: CustomRefreshAuth): void {
    this._ensureInitialized()
    this.#authOAuthManager.setCustomRefreshAuth(cb)
  }

  /**
   * Removes function for custom get new refresh token
   */
  public removeCustomRefreshAuth(): void {
    this._ensureInitialized()
    this.#authOAuthManager.removeCustomRefreshAuth()
  }
  // endregion ////

  // region Core ////
  /**
   * Disables warning about client-side query execution
   */
  public offClientSideWarning(): void {
    this.getAllApiVersions().forEach((version) => {
      this.getHttpClient(version).setClientSideWarning(false, '')
    })
  }
  // endregion ////

  override get auth(): AuthActions {
    return this.#authOAuthManager
  }

  // region Get ////
  /**
   * @inheritDoc
   */
  public override getTargetOrigin(): string {
    this._ensureInitialized()
    return this.#authOAuthManager.getTargetOrigin()
  }

  /**
   * @inheritDoc
   */
  public override getTargetOriginWithPath(): Map<ApiVersion, string> {
    this._ensureInitialized()
    return this.#authOAuthManager.getTargetOriginWithPath()
  }
  // endregion ////

  // region Tools ////
  // endregion ////
}
