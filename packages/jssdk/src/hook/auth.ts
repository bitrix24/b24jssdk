import type { AuthActions, AuthData, B24HookParams } from '../types/auth'
import { ApiVersion } from '../types/b24'

/**
 * Authorization Manager
 */
export class AuthHookManager implements AuthActions {
  #b24HookParams: B24HookParams
  readonly #domain: string
  readonly #b24TargetRest: string
  readonly #b24Target: string

  readonly #version: ApiVersion

  constructor(
    b24HookParams: B24HookParams,
    version: ApiVersion = ApiVersion.v2
  ) {
    this.#version = version
    this.#b24HookParams = Object.freeze(Object.assign({}, b24HookParams))
    this.#domain = this.#b24HookParams.b24Url
      .replaceAll('https://', '')
      .replaceAll('http://', '')
      .replace(/:(80|443)$/, '')

    this.#b24TargetRest = `https://${this.#domain}/rest`
    this.#b24Target = `https://${this.#domain}`
  }

  get apiVersion(): ApiVersion {
    return this.#version
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
   * Get the account address BX24 with path
   * - for ver1 `https://name.bitrix24.com/rest/{id}/{webhook}`
   * - for ver2 `https://name.bitrix24.com/rest/{id}/{webhook}`
   * - for ver3` https://name.bitrix24.com/rest/api/{id}/{webhook}`
   */
  getTargetOriginWithPath(): string {
    switch (this.apiVersion) {
      case ApiVersion.v1:
      case ApiVersion.v2:
        return `${this.#b24TargetRest}/${this.#b24HookParams.userId}/${this.#b24HookParams.secret}`
      case ApiVersion.v3:
      default:
        return `${this.#b24TargetRest}/api/${this.#b24HookParams.userId}/${this.#b24HookParams.secret}`
    }
  }

  /**
   * We believe that hooks are created only by the admin
   */
  get isAdmin(): boolean {
    return true
  }
}
