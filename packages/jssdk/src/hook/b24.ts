import { SdkError } from '../core/sdk-error'
import type { AuthActions, B24HookParams } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import type { TypeB24, ApiVersion } from '../types/b24'
import { AbstractB24 } from '../core/abstract-b24'
import { HttpV2 } from '../core/http/v2'
import { HttpV3 } from '../core/http/v3'
import { AuthHookManager } from './auth'
import { versionManager } from '../core/version-manager'

/**
 * Server-side Bitrix24 client based on an inbound webhook URL.
 *
 * Use this class to make REST API calls from a backend service using a
 * pre-configured webhook. The webhook URL embeds a secret access key and
 * therefore **must never be used in browser or mobile code** — instantiating
 * `B24Hook` automatically enables a client-side warning for every HTTP call.
 *
 * @example
 * ```ts
 * import { B24Hook } from '@bitrix24/b24jssdk'
 *
 * const b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/abc123xyz/')
 * const result = await b24.actions.v2.call.make({ method: 'user.current' })
 * ```
 *
 * @link https://bitrix24.github.io/b24jssdk/docs/hook/
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
   * Creates a `B24Hook` instance from a webhook URL.
   *
   * Accepts both REST API v2 and v3 webhook formats:
   *   - v2: `https://your_domain.bitrix24.com/rest/{userId}/{secret}`
   *   - v3: `https://your_domain.bitrix24.com/rest/api/{userId}/{secret}`
   *
   * Validates that the URL uses HTTPS, has the correct path structure, and
   * contains a numeric user ID. Throws a descriptive `Error` on any violation
   * without echoing the URL (which contains the secret).
   *
   * @param url - Full webhook URL as shown in the Bitrix24 admin panel.
   * @param options - Optional restriction parameters (rate limits, etc.).
   * @returns A ready-to-use `B24Hook` instance.
   * @throws {SdkError} If the URL is empty (`JSSDK_HOOK_URL_EMPTY`), unparseable
   *     (`JSSDK_HOOK_URL_INVALID`), not HTTPS (`JSSDK_HOOK_URL_NOT_HTTPS`),
   *     malformed (`JSSDK_HOOK_URL_MALFORMED`), or the userId segment is not
   *     numeric (`JSSDK_HOOK_URL_USER_ID_NOT_NUMERIC`).
   */
  public static fromWebhookUrl(
    url: string,
    options?: { restrictionParams?: Partial<RestrictionParams> }
  ): B24Hook {
    if (!url.trim()) {
      throw new SdkError({ code: 'JSSDK_HOOK_URL_EMPTY', description: 'Webhook URL cannot be empty', status: 0 })
    }

    let parsedUrl: URL

    try {
      parsedUrl = new URL(url.replace('/rest/api', '/rest'))
    } catch {
      // Don't echo the URL — it carries the webhook secret in its path (#43).
      throw new SdkError({ code: 'JSSDK_HOOK_URL_INVALID', description: 'Invalid webhook URL format', status: 0 })
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new SdkError({ code: 'JSSDK_HOOK_URL_NOT_HTTPS', description: 'Webhook requires HTTPS protocol', status: 0 })
    }

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
    const isValidFormat = (
      // Format: /rest/{id}/{webhook}
      (pathParts.length === 3 && pathParts[0] === 'rest')
      // Format: /rest/api/{id}/{webhook}
      || (pathParts.length === 4 && pathParts[0] === 'rest' && pathParts[1] === 'api')
    )

    if (!isValidFormat) {
      throw new SdkError({ code: 'JSSDK_HOOK_URL_MALFORMED', description: 'Webhook URL must follow format: /rest/<userId>/<secret> or /rest/api/<userId>/<secret>', status: 0 })
    }

    // Determine the position of userId and secret depending on the format
    const userIdIndex = pathParts[1] === 'api' ? 2 : 1
    const secretIndex = pathParts[1] === 'api' ? 3 : 2

    const userIdStr = pathParts[userIdIndex]!
    const secret = pathParts[secretIndex]!

    if (!/^\d+$/.test(userIdStr)) {
      // Don't echo the segment — in a transposed URL it could be the secret (#43).
      throw new SdkError({ code: 'JSSDK_HOOK_URL_USER_ID_NOT_NUMERIC', description: 'User ID must be numeric in webhook URL', status: 0 })
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
