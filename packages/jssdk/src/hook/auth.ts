import type { AuthActions, AuthData, B24HookParams } from '../types/auth'

/**
 * Authorization Manager
 */
export class AuthHookManager implements AuthActions {
  #b24HookParams: B24HookParams
  readonly #domain: string
  readonly #b24TargetRest: string
  readonly #b24Target: string

  constructor(b24HookParams: B24HookParams) {
    this.#b24HookParams = Object.freeze(Object.assign({}, b24HookParams))
    this.#domain = this.#b24HookParams.b24Url
      .replaceAll('https://', '')
      .replaceAll('http://', '')
      .replace(/:(80|443)$/, '')

    this.#b24TargetRest = `https://${this.#domain}/rest`
    this.#b24Target = `https://${this.#domain}`
  }

  /**
   * @see Http.#prepareParams
   */
  getAuthData(): false | AuthData {
    return {
      access_token: this.#b24HookParams.secret,
      refresh_token: 'hook',
      expires: 0,
      expires_in: 0,
      domain: this.#domain,
      member_id: this.#domain
    }
  }

  refreshAuth(): Promise<AuthData> {
    return Promise.resolve(this.getAuthData() as AuthData)
  }

  getUniq(prefix: string): string {
    const authData = this.getAuthData()
    if (authData === false) {
      throw new Error('AuthData not init')
    }
    return [prefix, authData.member_id].join('_')
  }

  /**
   * Get the account address BX24 ( https://name.bitrix24.com )
   */
  getTargetOrigin(): string {
    return `${this.#b24Target}`
  }

  /**
   * Get the account address BX24 with Path ( https://name.bitrix24.com/rest/1/xxxxx )
   */
  getTargetOriginWithPath(): string {
    return `${this.#b24TargetRest}/${this.#b24HookParams.userId}/${this.#b24HookParams.secret}`
  }

  /**
   * We believe that hooks are created only by the admin
   */
  get isAdmin(): boolean {
    return true
  }
}
