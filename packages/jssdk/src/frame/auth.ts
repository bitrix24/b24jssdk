import type { AppFrame } from './frame'
import type { MessageManager } from './message'
import type { AuthActions, AuthData, RefreshAuthData, MessageInitData } from '../types/auth'
import type { ApiVersion } from '../types/b24'
import { MessageCommands } from './message'
import { SdkError } from '../core/sdk-error'

// How long to wait for the parent window to answer a `refreshAuth` postMessage
// before giving up. Without this the promise never settles if the parent is
// slow / navigated away / blocked — and since #182 every 401 refreshes, so a
// hung parent would hang the request. (#189)
const REFRESH_AUTH_TIMEOUT = 10_000

/**
 * Authorization Manager
 */
export class AuthManager implements AuthActions {
  #accessToken: null | string = null
  #refreshId: null | string = null
  #authExpires: number = 0
  #authExpiresIn: number = 0
  #memberId: null | string = null

  #isAdmin: boolean = false

  #appFrame: AppFrame
  #messageManager: MessageManager

  constructor(
    appFrame: AppFrame,
    messageManager: MessageManager
  ) {
    this.#appFrame = appFrame
    this.#messageManager = messageManager
  }

  /**
   * Initializes the data received from the parent window message.
   * @param data
   */
  public initData(data: MessageInitData): AuthManager {
    if (data.AUTH_ID) {
      this.#accessToken = data.AUTH_ID
      this.#refreshId = data.REFRESH_ID
      this.#authExpiresIn = Number.parseInt(data.AUTH_EXPIRES)
      this.#authExpires = Date.now() + this.#authExpiresIn * 1_000

      this.#isAdmin = data.IS_ADMIN
      this.#memberId = data.MEMBER_ID || ''
    }

    return this
  }

  /**
   * Returns authorization data
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-functions/bx24-get-auth.html
   */
  public getAuthData(): false | AuthData {
    return this.#authExpires > Date.now()
      ? ({
          access_token: this.#accessToken,
          refresh_token: this.#refreshId,
          expires: this.#authExpires / 1_000,
          expires_in: this.#authExpiresIn,
          domain: this.#appFrame.getTargetOrigin(),
          member_id: this.#memberId
        } as AuthData)
      : false
  }

  /**
   * Updates authorization data through the parent window
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-functions/bx24-refresh-auth.html
   */
  public async refreshAuth(): Promise<AuthData> {
    // Bound the wait: `MessageManager.send` has no timeout of its own here, and
    // its `isSafely` mode auto-*resolves* with `{ isSafely: true }` — which is
    // NOT valid `AuthData`. So race the send against a timer that *rejects*, so
    // a hung parent surfaces a clean error instead of never settling. (#189)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new SdkError({
          code: 'JSSDK_FRAME_REFRESH_AUTH_TIMEOUT',
          status: 408,
          description: `refreshAuth: the parent window did not answer within ${REFRESH_AUTH_TIMEOUT}ms`
        })),
        REFRESH_AUTH_TIMEOUT
      )
    })

    try {
      const data = await Promise.race([
        this.#messageManager.send(MessageCommands.refreshAuth, {}) as Promise<RefreshAuthData>,
        timeout
      ])

      this.#accessToken = data.AUTH_ID
      this.#refreshId = data.REFRESH_ID
      this.#authExpires = Date.now() + Number.parseInt(data.AUTH_EXPIRES) * 1_000

      return this.getAuthData() as AuthData
    } finally {
      // Clear the timer on either outcome so a resolved refresh doesn't leave a
      // pending reject-timer running (and keep the event loop clean).
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  public getUniq(prefix: string): string {
    return [prefix, this.#memberId || ''].join('_')
  }

  /**
   * Determines whether the current user has administrator rights
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-is-admin.html
   */
  get isAdmin(): boolean {
    return this.#isAdmin
  }

  /**
   * @inheritDoc
   */
  public getTargetOrigin(): string {
    return this.#appFrame.getTargetOrigin()
  }

  /**
   * @inheritDoc
   */
  public getTargetOriginWithPath(): Map<ApiVersion, string> {
    return this.#appFrame.getTargetOriginWithPath()
  }
}
