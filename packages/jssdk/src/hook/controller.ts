import { LoggerBrowser } from '../logger/browser'
import { AbstractB24 } from '../core/abstract-b24'
import type { TypeB24 } from '../types/b24'
import Http from '../core/http/controller'
import { AuthHookManager } from './auth'
import type { AuthActions, B24HookParams } from '../types/auth'

/**
 * B24.Hook Manager.
 *
 * @link https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=99&LESSON_ID=8581&LESSON_PATH=8771.8583.8581
 */
export class B24Hook extends AbstractB24 implements TypeB24 {
  readonly #authHookManager: AuthHookManager

  // region Init ////
  constructor(b24HookParams: B24HookParams) {
    super()

    this.#authHookManager = new AuthHookManager(b24HookParams)

    this._http = new Http(
      this.#authHookManager.getTargetOriginWithPath(),
      this.#authHookManager,
      this._getHttpOptions()
    )
    this._http.setClientSideWarning(
      true,
      'It is not safe to use hook requests on the client side'
    )

    this._isInit = true
  }

  public override setLogger(logger: LoggerBrowser): void {
    super.setLogger(logger)
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
   * Get the account address BX24 with Path ( https://name.bitrix24.com/rest/1/xxxxx )
   */
  override getTargetOriginWithPath(): string {
    this._ensureInitialized()
    return this.#authHookManager.getTargetOriginWithPath()
  }

  // endregion ////

  // region Tools ////
  public static fromWebhookUrl(url: string): B24Hook {
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
      throw new Error('Webhook URL must follow format: /rest/<userId>/<secret>');
    }

    const userIdStr = pathParts[1]
    const secret = pathParts[2]

    if (!/^\d+$/.test(userIdStr)) {
      throw new Error(`User ID must be numeric in webhook URL, received: ${userIdStr}`)
    }
    const userId = Number.parseInt(userIdStr, 10)

    return new B24Hook({
      b24Url: parsedUrl.origin,
      userId,
      secret,
    })
  }
  // endregion ////
}
