import type { AuthActions, B24HookParams } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import type { TypeB24, ApiVersion } from '../types/b24'
import { AbstractB24 } from '../core/abstract-b24'
import { HttpV2 } from '../core/http/v2'
import { HttpV3 } from '../core/http/v3'
import { AuthHookManager } from './auth'
import { versionManager } from '../core/version-manager'

/**
 * B24.Hook Manager.
 *
 * @link https://bitrix24.github.io/b24jssdk/docs/hook/
 *
 * @todo docs
 */
export class B24Hook extends AbstractB24 implements TypeB24 {
  readonly #authHookManager: AuthHookManager

  // region Init ////
  constructor(
    b24HookParams: B24HookParams,
    options?: {
      restrictionParams?: Partial<RestrictionParams>
    }
  ) {
    super()

    this.#authHookManager = new AuthHookManager(
      b24HookParams
    )

    const warningText = 'The B24Hook object is intended exclusively for use on the server.\nA webhook contains a secret access key, which MUST NOT be used in client-side code (browser, mobile app).'

    this._httpV2 = new HttpV2(this.#authHookManager, this._getHttpOptions(), options?.restrictionParams)
    this._httpV2.setClientSideWarning(true, warningText)
    this._httpV3 = new HttpV3(this.#authHookManager, this._getHttpOptions(), options?.restrictionParams)
    this._httpV3.setClientSideWarning(true, warningText)

    this._isInit = true
  }
  // endregion ////

  override get auth(): AuthActions {
    return this.#authHookManager
  }

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

  // region Get ////
  /**
   * @inheritDoc
   */
  public override getTargetOrigin(): string {
    this._ensureInitialized()
    return this.#authHookManager.getTargetOrigin()
  }

  /**
   * @inheritDoc
   */
  public override getTargetOriginWithPath(): Map<ApiVersion, string> {
    this._ensureInitialized()
    return this.#authHookManager.getTargetOriginWithPath()
  }

  // endregion ////

  // region Tools ////
  /**
   * Init Webhook from url
   *   - ver2 `https://your_domain.bitrix24.com/rest/{id}/{webhook}`
   *   - ver3 `https://your_domain.bitrix24.com/rest/api/{id}/{webhook}`
   *
   * @todo docs
   */
  public static fromWebhookUrl(
    url: string,
    options?: { restrictionParams?: Partial<RestrictionParams> }
  ): B24Hook {
    if (!url.trim()) {
      throw new Error('Webhook URL cannot be empty')
    }

    let parsedUrl: URL

    try {
      parsedUrl = new URL(url.replace('/rest/api', '/rest'))
    } catch {
      throw new Error(`Invalid webhook URL format: ${url}`)
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Webhook requires HTTPS protocol')
    }

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
    const isValidFormat = (
      // Format: /rest/{id}/{webhook}
      (pathParts.length === 3 && pathParts[0] === 'rest')
      // Format: /rest/api/{id}/{webhook}
      || (pathParts.length === 4 && pathParts[0] === 'rest' && pathParts[1] === 'api')
    )

    if (!isValidFormat) {
      throw new Error('Webhook URL must follow format: /rest/<userId>/<secret> or /rest/api/<userId>/<secret>')
    }

    // Determine the position of userId and secret depending on the format
    const userIdIndex = pathParts[1] === 'api' ? 2 : 1
    const secretIndex = pathParts[1] === 'api' ? 3 : 2

    const userIdStr = pathParts[userIdIndex]!
    const secret = pathParts[secretIndex]!

    if (!/^\d+$/.test(userIdStr)) {
      throw new Error(`User ID must be numeric in webhook URL, received: ${userIdStr}`)
    }
    const userId = Number.parseInt(userIdStr, 10)

    return new B24Hook(
      {
        b24Url: parsedUrl.origin,
        userId,
        secret
      },
      options
    )
  }
  // endregion ////
}
