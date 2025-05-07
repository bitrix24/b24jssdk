import type { AuthActions, AuthData } from '../types/auth'

export interface B24OAuthParams {
  b24Url: string
  clientId: string
  clientSecret: string
  accessToken: string
  refreshToken: string
  expiresIn: number
  memberId: string 
}

export type AuthRefreshCallback = (authData: AuthData) => Promise<void> | void
 
/**
 * OAuth Authorization Manager
 */
export class AuthOAuthManager implements AuthActions {
  #b24OAuthParams: B24OAuthParams
  #authData: AuthData | null = null
  #refreshCallback: AuthRefreshCallback | null = null
  
  constructor(
    b24OAuthParams: B24OAuthParams,
    refreshCallback?: AuthRefreshCallback
  ) {
    this.#b24OAuthParams = Object.freeze(Object.assign({}, b24OAuthParams))
    this.#refreshCallback = refreshCallback || null
    this.#initAuthData()
  }

  /**
   * Initializes authentication data from OAuth parameters
   * Transforms URL to domain name and sets up initial auth state
   * @private
   */
  #initAuthData(): void {
    const domain = this.#b24OAuthParams.b24Url
      .replaceAll('https://', '')
      .replaceAll('http://', '')
      .replace(/:(80|443)$/, '')

    this.#authData = {
      access_token: this.#b24OAuthParams.accessToken,
      refresh_token: this.#b24OAuthParams.refreshToken,
      expires_in: this.#b24OAuthParams.expiresIn,
      domain: domain,
      member_id: this.#b24OAuthParams.memberId,
    }
  }

  /**
   * Gets current authentication data
   * @returns AuthData object or false if auth data is not initialized
   */
  getAuthData(): false | AuthData {
    return this.#authData || false
  }

  /**
   * Refreshes the authentication token using OAuth flow
   * @throws Error if auth data is not initialized or refresh token request fails
   * @returns Promise resolving to new AuthData
   */
  async refreshAuth(): Promise<AuthData> {
    if (!this.#authData) {
      throw new Error('AuthData не инициализирован')
    }

    const params = {
        client_id: this.#b24OAuthParams.clientId,
        grant_type: 'refresh_token',
        client_secret: this.#b24OAuthParams.clientSecret,
        refresh_token: this.#authData.refresh_token,
    }

    try {
      const queryParams = new URLSearchParams(params).toString()
      const response = await fetch(`https://oauth.bitrix.info/oauth/token/?${queryParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        throw new Error(`Ошибка обновления токена: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(`Ошибка обновления токена: ${data.error}`)
      }

      this.#authData = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        domain: this.#authData.domain,
        member_id: this.#authData.member_id,
      }

      if (this.#refreshCallback) {
        await Promise.resolve(this.#refreshCallback(this.#authData))
      }

      return this.#authData
    } catch (error) {
      throw new Error(`Ошибка при обновлении токена: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    }
  }

  /**
   * Generates a unique identifier by combining prefix with member_id
   * @param prefix - String to prepend to the unique identifier
   * @returns Combined unique string
   * @throws Error if auth data is not initialized
   */
  getUniq(prefix: string): string {
    const authData = this.getAuthData()
    if (authData === false) {
      throw new Error('AuthData not init')
    }
    return [prefix, authData.member_id].join('_')
  }

  /**
   * Gets the base target origin URL
   * @returns Base Bitrix24 URL
   */
  getTargetOrigin(): string {
    return `${this.#b24OAuthParams.b24Url}`
  }

  /**
   * Gets the target origin URL with REST API path
   * @returns Bitrix24 REST API URL
   */
  getTargetOriginWithPath(): string {
    return `${this.#b24OAuthParams.b24Url}/rest`
  }

  /**
   * Checks if current user has admin rights
   * @returns Boolean indicating admin status (always false for OAuth)
   */
  get isAdmin(): boolean {
    return false
  }
} 