import type { AuthActions, B24HookParams } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import type { TypeB24 } from '../types/b24'
import { AbstractB24 } from '../core/abstract-b24'
import Http from '../core/http/controller'
import { AuthHookManager } from './auth'
import { ApiVersion } from '../types/b24'

/**
 * B24.Hook Manager.
 *
 * @link https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=99&LESSON_ID=8581&LESSON_PATH=8771.8583.8581
 */
export class B24Hook extends AbstractB24 implements TypeB24 {
  readonly #authHookManager: AuthHookManager

  readonly #version: ApiVersion

  // region Init ////
  constructor(
    b24HookParams: B24HookParams,
    options?: {
      version?: ApiVersion
      restrictionParams?: Partial<RestrictionParams>
    }
  ) {
    super()

    this.#version = options?.version ?? ApiVersion.v2
    this.#authHookManager = new AuthHookManager(
      b24HookParams,
      this.#version
    )

    this._http = new Http(
      this.#authHookManager,
      this._getHttpOptions(),
      options?.restrictionParams
    )
    this._http.setClientSideWarning(
      true,
      'It is not safe to use hook requests on the client side'
    )

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
    this.getHttpClient().setClientSideWarning(false, '')
  }

  // endregion ////

  // region Get ////
  /**
   * Get the account address BX24 ( https://name.bitrix24.com )
   */
  override getTargetOrigin(): string {
    this._ensureInitialized()
    return this.#authHookManager.getTargetOrigin()
  }

  /**
   * Get the account address BX24 with path
   * - for ver1 `https://name.bitrix24.com/rest/{id}/{webhook}`
   * - for ver2 `https://name.bitrix24.com/rest/{id}/{webhook}`
   * - for ver3` https://name.bitrix24.com/rest/api/{id}/{webhook}`
   */
  override getTargetOriginWithPath(): string {
    this._ensureInitialized()
    return this.#authHookManager.getTargetOriginWithPath()
  }

  // endregion ////

  // region Tools ////
  public static fromWebhookUrl(
    url: string,
    options?: {
      version?: ApiVersion
      restrictionParams?: Partial<RestrictionParams>
    }
  ): B24Hook {
    if (!url.trim()) {
      throw new Error('Webhook URL cannot be empty')
    }

    let parsedUrl: URL

    try {
      parsedUrl = new URL(url)
    } catch {
      throw new Error(`Invalid webhook URL format: ${url}`)
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Webhook requires HTTPS protocol')
    }

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
    if (pathParts.length < 3 || pathParts[0] !== 'rest') {
      throw new Error('Webhook URL must follow format: /rest/<userId>/<secret>')
    }

    const userIdStr = pathParts[1]
    const secret = pathParts[2]

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
