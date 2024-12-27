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

/**
 * OAuth Authorization Manager
 */
export class AuthOAuthManager implements AuthActions {
  #b24OAuthParams: B24OAuthParams
  #authData: AuthData | null = null
  
  constructor(b24OAuthParams: B24OAuthParams) {
    this.#b24OAuthParams = Object.freeze(Object.assign({}, b24OAuthParams))
    this.#initAuthData()
  }

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

  getAuthData(): false | AuthData {
    return this.#authData || false
  }

  async refreshAuth(): Promise<AuthData> {
    if (!this.#authData) {
      throw new Error('AuthData не инициализирован')
    }

    const params = {
      this_auth: 'Y',
      params: {
        client_id: this.#b24OAuthParams.clientId,
        grant_type: 'refresh_token',
        client_secret: this.#b24OAuthParams.clientSecret,
        refresh_token: this.#authData.refresh_token,
      }
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

      // Обновляем данные авторизации
      this.#authData = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        domain: this.#authData.domain,
        member_id: this.#authData.member_id,
      }

      return this.#authData
    } catch (error) {
      throw new Error(`Ошибка при обновлении токена: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    }
  }

  getUniq(prefix: string): string {
    const authData = this.getAuthData()
    if (authData === false) {
      throw new Error('AuthData not init')
    }
    return [prefix, authData.member_id].join('_')
  }

  getTargetOrigin(): string {
    return `${this.#b24OAuthParams.b24Url}`
  }

  getTargetOriginWithPath(): string {
    return `${this.#b24OAuthParams.b24Url}/rest`
  }

  get isAdmin(): boolean {
    // В OAuth нужно проверять права пользователя
    // Для примера возвращаем false
    return false
  }
} 