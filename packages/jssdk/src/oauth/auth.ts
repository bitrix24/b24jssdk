/**
 * OAuth Authorization Manager
 *
 * @link https://apidocs.bitrix24.com/api-reference/oauth/index.html
 */
import { RefreshTokenError } from './refresh-token-error'
import Type from '../tools/type'
import { EnumAppStatus } from '../types/b24-helper'
import type { AuthActions, AuthData, B24OAuthParams, B24OAuthSecret, TypeDescriptionError, CallbackRefreshAuth, CustomRefreshAuth, HandlerRefreshAuth } from '../types/auth'
import type { TypeHttp } from '../types/http'
import axios, { type AxiosInstance, AxiosError } from 'axios'

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
  async refreshAuth(): Promise<AuthData> {
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
      this.#authOptions.status = Object.values(EnumAppStatus).find((value) => value === payload.status) || EnumAppStatus.Free

      this.#authExpires = this.#authOptions.expires * 1_000

      const authData = this.getAuthData() as AuthData

      if (this.#callbackRefreshAuth) {
        await this.#callbackRefreshAuth({ authData, b24OAuthParams: this.#authOptions })
      }

      return authData
    } catch (error) {
      if (error instanceof AxiosError) {
        let answerError = {
          error: error?.code || 0,
          errorDescription: error?.message || '',
        }

        if (
          error.response &&
          error.response.data &&
          !Type.isUndefined((error.response.data as TypeDescriptionError).error)
        ) {
          const response = error.response.data as {
            error: string
            error_description: string
          } as TypeDescriptionError

          answerError = {
            error: response.error,
            errorDescription: response.error_description,
          }
        }

        throw new RefreshTokenError({
          code: String(answerError.error),
          description: answerError.errorDescription,
          status: error.response?.status || 0,
          requestInfo: {
            method: '/oauth/token/'
          }
        })
      } else if(error instanceof Error) {
        throw error
      }

      throw new Error(
        `Strange error: ${ error instanceof Error ? error.message : error }`,
        { cause: error }
      )
    }
  }

  setCallbackRefreshAuth(cb: CallbackRefreshAuth): void {
    this.#callbackRefreshAuth = cb
  }

  removeCallbackRefreshAuth(): void {
    this.#callbackRefreshAuth = null
  }

  setCustomRefreshAuth(cb: CustomRefreshAuth): void {
    this.#customRefreshAuth = cb
  }

  removeCustomRefreshAuth(): void {
    this.#customRefreshAuth = null
  }
  // endregion ////

  getUniq(prefix: string): string {
    return [prefix, this.#authOptions.memberId || ''].join('_')
  }

  /**
   * Get the account address BX24 ( https://name.bitrix24.com )
   */
  getTargetOrigin(): string {
    return `${ this.#b24Target }`
  }

  /**
   * Get the account address BX24 with Path ( https://name.bitrix24.com/rest )
   */
  getTargetOriginWithPath(): string {
    return `${ this.#b24TargetRest }`
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
