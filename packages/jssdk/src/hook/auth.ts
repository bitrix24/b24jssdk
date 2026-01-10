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
  readonly #b24TargetRestWithPath: Map<ApiVersion, string>

  constructor(
    b24HookParams: B24HookParams
  ) {
    this.#b24HookParams = Object.freeze(Object.assign({}, b24HookParams))
    this.#domain = this.#b24HookParams.b24Url
      .replaceAll('https://', '')
      .replaceAll('http://', '')
      .replace(/:(80|443)$/, '')

    this.#b24TargetRest = `https://${this.#domain}/rest`
    this.#b24Target = `https://${this.#domain}`

    this.#b24TargetRestWithPath = new Map()
    this.#b24TargetRestWithPath.set(ApiVersion.v1, `${this.#b24TargetRest}/${this.#b24HookParams.userId}/${this.#b24HookParams.secret}`)
    this.#b24TargetRestWithPath.set(ApiVersion.v2, `${this.#b24TargetRest}/${this.#b24HookParams.userId}/${this.#b24HookParams.secret}`)
    this.#b24TargetRestWithPath.set(ApiVersion.v3, `${this.#b24TargetRest}/api/${this.#b24HookParams.userId}/${this.#b24HookParams.secret}`)
  }

  /**
   * @see Http.#prepareParams
   */
  public getAuthData(): false | AuthData {
    return {
      access_token: this.#b24HookParams.secret,
      refresh_token: 'hook',
      expires: 0,
      expires_in: 0,
      domain: this.#domain,
      member_id: this.#domain
    }
  }

  public refreshAuth(): Promise<AuthData> {
    return Promise.resolve(this.getAuthData() as AuthData)
  }

  public getUniq(prefix: string): string {
    const authData = this.getAuthData()
    if (authData === false) {
      throw new Error('AuthData not init')
    }
    return [prefix, authData.member_id].join('_')
  }

  /**
   * @inheritDoc
   */
  public getTargetOrigin(): string {
    return `${this.#b24Target}`
  }

  /**
   * Get the account address BX24 with path
   *   - ver1 `https://your_domain.bitrix24.com/rest/{id}/{webhook}`
   *   - ver2 `https://your_domain.bitrix24.com/rest/{id}/{webhook}`
   *   - ver3` https://your_domain.bitrix24.com/rest/api/{id}/{webhook}`
   */
  public getTargetOriginWithPath(): Map<ApiVersion, string> {
    return this.#b24TargetRestWithPath
  }

  /**
   * We believe that hooks are created only by the admin
   */
  get isAdmin(): boolean {
    return true
  }
}
