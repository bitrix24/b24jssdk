import type { AuthActions, B24OAuthParams, B24OAuthSecret, CallbackRefreshAuth, CustomRefreshAuth } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import type { TypeB24, ApiVersion } from '../types/b24'
import { AbstractB24 } from '../core/abstract-b24'
import { SdkError } from '../core/sdk-error'
import { HttpV2 } from '../core/http/v2'
import { HttpV3 } from '../core/http/v3'
import { AuthOAuthManager } from './auth'
import { versionManager } from '../core/version-manager'

/**
 * Server-side Bitrix24 client for OAuth 2.0 applications (local and distributed).
 *
 * Manages access- and refresh-token lifecycle: the underlying `AuthOAuthManager`
 * automatically refreshes the access token when it expires, using the supplied
 * `oAuthSecret` (client ID + client secret). Like `B24Hook`, this class is
 * **server-side only** — OAuth secrets must not be exposed in browser code.
 *
 * @example
 * ```ts
 * import { B24OAuth, type B24OAuthParams } from '@bitrix24/b24jssdk'
 *
 * declare const authOptions: B24OAuthParams
 *
 * const b24 = new B24OAuth(authOptions, { clientId: '...', clientSecret: '...' })
 * const result = await b24.actions.v2.call.make({ method: 'crm.lead.list' })
 * ```
 *
 * @link https://apidocs.bitrix24.com/settings/oauth/index.html
 * @link https://bitrix24.github.io/b24jssdk/docs/oauth/
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

    this._httpV2 = new HttpV2(this.#authOAuthManager, this._getHttpOptions(), options?.restrictionParams)
    this._httpV2.setClientSideWarning(true, warningText)
    this._httpV3 = new HttpV3(this.#authOAuthManager, this._getHttpOptions(), options?.restrictionParams)
    this._httpV3.setClientSideWarning(true, warningText)

    this._isInit = true
  }

  /**
   * Used to initialize information about the current user.
   */
  // TODO: add integration-test coverage for the admin-flag fetch
  public async initIsAdmin(requestId?: string): Promise<void> {
    const method = 'profile'

    this._ensureInitialized()
    try {
      const version = versionManager.automaticallyObtainApiVersion(method)
      const client = this.getHttpClient(version)
      // Deliberately NOT awaited inside the try: the async half — the `profile`
      // request itself — has always propagated its rejection to the caller
      // (now as JSSDK_OAUTH_PROFILE_FAILED), and awaiting here would silently
      // widen this catch to swallow it, making failures LESS visible — the
      // opposite of #155's intent.
      return this.#authOAuthManager.initIsAdmin(client, requestId)
    } catch (error) {
      // This catch therefore covers only the synchronous setup (version
      // resolution, client lookup). It used to be `catch { return }`, which hid
      // even that; the failure is now surfaced to the logger before returning.
      // Fail closed: the admin flag defaults to `false` (least privilege), so
      // returning leaves the safe value (#155).
      this.getLogger().error('initIsAdmin: setup failed before the profile call; treating the user as non-admin', {
        code: error instanceof SdkError ? error.code : 'JSSDK_OAUTH_IS_ADMIN_LOOKUP_FAILED'
      }).catch(() => {})
      return
    }
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
    versionManager.getAllApiVersions().forEach((version) => {
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
