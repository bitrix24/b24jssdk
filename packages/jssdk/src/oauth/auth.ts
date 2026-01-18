import type { AxiosInstance } from 'axios'
import type { AuthActions, AuthData, B24OAuthParams, B24OAuthSecret, CallbackRefreshAuth, CustomRefreshAuth, HandlerRefreshAuth, TypeDescriptionError, TypeDescriptionErrorV3 } from '../types/auth'
import type { TypeHttp } from '../types/http'
import axios, { AxiosError } from 'axios'
import { RefreshTokenError } from './refresh-token-error'
import { Type } from '../tools/type'
import { EnumAppStatus } from '../types/b24-helper'
import { ApiVersion } from '../types/b24'

/**
 * OAuth Authorization Manager
 *
 * @link https://apidocs.bitrix24.com/settings/oauth/index.html
 * @link https://bitrix24.github.io/b24jssdk/docs/oauth/
 */
export class AuthOAuthManager implements AuthActions {
  #clientAxios: AxiosInstance
  #callbackRefreshAuth: null | CallbackRefreshAuth = null
  #customRefreshAuth: null | CustomRefreshAuth = null
  #authOptions: B24OAuthParams
  readonly #oAuthSecret: B24OAuthSecret
  #authExpires: number = 0
  #authExpiresIn: number = 0
  readonly #domain: string
  readonly #b24TargetRest: string
  readonly #b24Target: string
  readonly #b24TargetRestWithPath: Map<ApiVersion, string>
  readonly #oAuthTarget: string // 'https://oauth.bitrix.info'

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
    this.#b24Target = this.#b24TargetRest.replace('/rest/', '')
    this.#oAuthTarget = this.#authOptions.serverEndpoint.replace('/rest/', '')
    this.#authExpires = this.#authOptions.expires * 1_000
    this.#authExpiresIn = this.#authOptions.expiresIn

    this.#clientAxios = axios.create({
      baseURL: this.#oAuthTarget,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    this.#b24TargetRestWithPath = new Map()
    this.#b24TargetRestWithPath.set(ApiVersion.v2, `${this.#b24TargetRest}`)
    this.#b24TargetRestWithPath.set(ApiVersion.v3, `${this.#b24TargetRest}/api`)
  }

  /**
   * Returns authorization data
   * @see Http.#prepareParams
   */
  public getAuthData(): false | AuthData {
    return this.#authExpires > Date.now()
      ? ({
          access_token: this.#authOptions.accessToken,
          refresh_token: this.#authOptions.refreshToken,
          expires: this.#authExpires / 1_000,
          expires_in: this.#authExpiresIn,
          domain: this.#domain,
          member_id: this.#authOptions.memberId
        } as AuthData)
      : false
  }

  // region RefreshAuth ////
  /**
   * Updates authorization data
   */
  public async refreshAuth(): Promise<AuthData> {
    try {
      let payload: undefined | HandlerRefreshAuth = undefined

      if (this.#customRefreshAuth) {
        payload = await this.#customRefreshAuth()
      } else {
        const response = await this.#clientAxios.get(
          '/oauth/token/',
          {
            params: {
              grant_type: 'refresh_token',
              client_id: this.#oAuthSecret.clientId,
              client_secret: this.#oAuthSecret.clientSecret,
              refresh_token: this.#authOptions.refreshToken
            }
          }
        )

        if (response.data.error) {
          throw new Error(`Token update error: ${response.data.error}`)
        }
        if (response.status !== 200) {
          throw new Error(`Token update error status code: ${response.status}`)
        }

        /**
         * @memo domain = 'oauth.bitrix.info'
         */
        payload = response.data
      }

      if (!payload) {
        throw new Error('Unable to obtain authorization update data')
      }

      this.#authOptions.accessToken = payload.access_token
      this.#authOptions.refreshToken = payload.refresh_token
      this.#authOptions.expires = Number.parseInt(payload.expires || '0')
      this.#authOptions.expiresIn = Number.parseInt(payload.expires_in || '3600')
      this.#authOptions.clientEndpoint = payload.client_endpoint
      this.#authOptions.serverEndpoint = payload.server_endpoint
      this.#authOptions.scope = payload.scope
      this.#authOptions.status = Object.values(EnumAppStatus).find(value => value === payload.status) || EnumAppStatus.Free

      this.#authExpires = this.#authOptions.expires * 1_000

      const authData = this.getAuthData() as AuthData

      if (this.#callbackRefreshAuth) {
        await this.#callbackRefreshAuth({ authData, b24OAuthParams: this.#authOptions })
      }

      return authData
    } catch (error) {
      if (error instanceof AxiosError) {
        const answerError = {
          code: error?.code || 0,
          description: error?.message || ''
        }

        if (
          error.response
          && error.response.data
          && !Type.isUndefined(error.response.data.error)
        ) {
          const responseData = error.response.data as TypeDescriptionError | TypeDescriptionErrorV3

          if (
            responseData.error
            && typeof responseData.error === 'object'
            && 'code' in responseData.error
          ) {
            answerError.code = responseData.error.code
            answerError.description = responseData.error.message
            if (responseData.error.validation) {
              responseData.error.validation.forEach((row) => {
                answerError.description += `${row?.message || JSON.stringify(row)}`
              })
            }
          } else if (responseData.error && typeof responseData.error === 'string') {
            answerError.code = responseData.error
            answerError.description = (responseData as TypeDescriptionError)?.error_description ?? answerError.description
          }
        }

        throw new RefreshTokenError({
          code: String(answerError.code),
          description: answerError.description,
          status: error.response?.status || 0
        })
      } else if (error instanceof Error) {
        throw error
      }

      throw new Error(
        `Strange error: ${error instanceof Error ? error.message : error}`,
        { cause: error }
      )
    }
  }

  public setCallbackRefreshAuth(cb: CallbackRefreshAuth): void {
    this.#callbackRefreshAuth = cb
  }

  public removeCallbackRefreshAuth(): void {
    this.#callbackRefreshAuth = null
  }

  public setCustomRefreshAuth(cb: CustomRefreshAuth): void {
    this.#customRefreshAuth = cb
  }

  public removeCustomRefreshAuth(): void {
    this.#customRefreshAuth = null
  }
  // endregion ////

  public getUniq(prefix: string): string {
    return [prefix, this.#authOptions.memberId || ''].join('_')
  }

  /**
   * @inheritDoc
   */
  public getTargetOrigin(): string {
    return `${this.#b24Target}`
  }

  /**
   * @inheritDoc
   */
  public getTargetOriginWithPath(): Map<ApiVersion, string> {
    return this.#b24TargetRestWithPath
  }

  /**
   * Determines whether the current user has administrator rights
   */
  get isAdmin(): boolean {
    if (null === this.#isAdmin) {
      throw new Error('isAdmin not init. You need call B24OAuth::initIsAdmin().')
    }

    return this.#isAdmin
  }

  public async initIsAdmin(http: TypeHttp, requestId?: string): Promise<void> {
    // set def value
    this.#isAdmin = false

    // region ver3 ////
    /**
     * This is just a template. When API.v3 arrives, we'll replace it.
     * @todo fix then the new API will be available
     */
    if (http.apiVersion === ApiVersion.v3) {
      const response = await http.call('profile', {}, requestId)
      if (!response.isSuccess) {
        throw new Error(response.getErrorMessages().join(';'))
      }

      const data: { profile: { id: number, admin: boolean } } = response.getData()!.result

      if (data.profile?.admin) {
        this.#isAdmin = true
      }

      return
    }
    // endregion ////

    // region ver2 ////
    const response = await http.call('profile', {}, requestId)
    if (!response.isSuccess) {
      throw new Error(response.getErrorMessages().join(';'))
    }

    const data: {
      ID: number
      ADMIN: boolean
    } = response.getData()!.result

    if (data?.ADMIN) {
      this.#isAdmin = true
    }
    // endregion ////
  }
}
