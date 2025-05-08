import type { AuthActions, AuthData, B24OAuthParams, B24OAuthSecret } from '../types/auth'
import type { TypeHttp } from '../types/http'
import type { Payload } from "../types/payloads";
/**
 * OAuth Authorization Manager
 */
export class AuthOAuthManager implements AuthActions {
  #authOptions: B24OAuthParams
  readonly #oAuthSecret: B24OAuthSecret
  #authExpires: number = 0
  readonly #domain: string
  readonly #b24Target: string
  readonly #b24TargetRest: string
  // 'https://oauth.bitrix.info' ////
  readonly #oAuthTarget: string

  #isAdmin: null | boolean = null

  constructor(
    b24OAuthParams: B24OAuthParams,
    oAuthSecret: B24OAuthSecret
  ) {
    this.#authOptions = Object.assign({}, b24OAuthParams) as B24OAuthParams
    this.#oAuthSecret = Object.freeze(Object.assign({}, oAuthSecret)) as B24OAuthSecret

    this.#domain = this.#authOptions.domain
      .replaceAll('https://', '')
      .replaceAll('http://', '')
      .replace(/:(80|443)$/, '')

    this.#b24TargetRest = this.#authOptions.clientEndpoint
    this.#b24Target = this.#b24TargetRest.replace('/rest', '')
    this.#oAuthTarget = this.#authOptions.serverEndpoint.replace('/rest/', '')
    this.#authExpires = this.#authOptions.expires * 1_000

    /**
     * @todo init user info
     */
  }

  /**
   * Returns authorization data
   * @see Http.#prepareParams
   */
  getAuthData(): false | AuthData {
    return this.#authExpires > Date.now()
      ? ({
          access_token: this.#authOptions.accessToken,
          refresh_token: this.#authOptions.refreshToken,
          expires_in: this.#authOptions.expiresIn,
          domain: this.#domain,
          member_id: this.#authOptions.memberId
        } as AuthData)
      : false
  }

  /**
   * Updates authorization data
   */
  async refreshAuth(): Promise<AuthData> {
    try {

      /**
       * @todo change fetch
       */
      const response = await fetch(`${this.#oAuthTarget}/oauth/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          params: {
            client_id: this.#oAuthSecret.clientId,
            grant_type: 'refresh_token',
            client_secret: this.#oAuthSecret.clientSecret,
            refresh_token: this.#authOptions.refreshToken
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Token update error: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(`Token update error: ${data.error}`)
      }

      this.#authOptions.accessToken = data.access_token
      this.#authOptions.refreshToken = data.refresh_token

      /**
       * @todo test this
       */
      this.#authExpires = data.expires * 1_000

    } catch (error) {
      throw new Error(`Token update error: ${error instanceof Error ? error.message : error}`)
    }

    return this.getAuthData() as AuthData
  }

  getUniq(prefix: string): string {
    return [prefix, this.#authOptions.memberId || ''].join('_')
  }

  /**
   * Get the account address BX24 ( https://name.bitrix24.com )
   */
  getTargetOrigin(): string {
    return `${this.#b24Target}`
  }

  /**
   * Get the account address BX24 with Path ( https://name.bitrix24.com/rest )
   */
  getTargetOriginWithPath(): string {
    return `${this.#b24TargetRest}`
  }

  /**
   * Determines whether the current user has administrator rights
   */
  get isAdmin(): boolean {
    if (null === this.#isAdmin ) {

      throw new Error('isAdmin not init. You need call B24OAuth::initIsAdmin().')
    }

    return this.#isAdmin
  }

  async initIsAdmin(http: TypeHttp) {
    const response = await http.call('profile', {}, 0)
    if (!response.isSuccess) {
      throw new Error(response.getErrorMessages().join(';'))
    }

    const data: {
      ID: number
      ADMIN: boolean
    } = response.getData().result

    if (data?.ADMIN) {
      this.#isAdmin = true
    }
  }
}
