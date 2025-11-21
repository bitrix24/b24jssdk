import type { NumberString } from './common'
import type { HandlerAuthParams } from './handler'
import type { EnumAppStatus } from './b24-helper'

export type TypeDescriptionError = {
  readonly error: 'invalid_token' | 'expired_token' | string
  readonly error_description: string
}

/**
 * Parameters for hook
 */
export type B24HookParams = {
  /**
   * https://your-bitrix-portal.bitrix24.com
   */
  b24Url: string
  userId: number
  secret: string
}

/**
 * Parameters passed in the GET request from the B24 parent window to the application
 */
export type B24FrameQueryParams = {
  DOMAIN: string | null | undefined
  PROTOCOL: boolean | null | undefined
  LANG: string | null | undefined
  APP_SID: string | null | undefined
}

/**
 * Parameters for application for OAuth
 */
export type B24OAuthSecret = {
  clientId: string
  clientSecret: string
}

/**
 * Parameters for OAuth
 * @memo We get from b24 event this data
 */
export interface B24OAuthParams {
  /**
   * @example '1xxxxx1694'
   */
  applicationToken: string
  /**
   * @example 1
   */
  userId: number
  /**
   * @example '3xx2030386cyy1b'
   */
  memberId: string
  /**
   * @example '1xxxxx1694'
   */
  accessToken: string
  /**
   * @example '0xxxx4e000011e700000001000000260dc83b47c40e9b5fd501093674c4f5'
   */
  refreshToken: string
  /**
   * @example 1745997853
   */
  expires: number
  /**
   * @example 3600
   */
  expiresIn: number
  /**
   * @example 'crm,catalog,bizproc,placement,user_brief'
   */
  scope: string
  /**
   * @example 'xxx.bitrix24.com'
   */
  domain: string
  /**
   * @example 'https://xxx.bitrix24.com/rest/'
   */
  clientEndpoint: string
  /**
   * @example 'https://oauth.bitrix.info/rest/'
   */
  serverEndpoint: string
  /**
   * @example 'L'
   */
  status: typeof EnumAppStatus[keyof typeof EnumAppStatus]
  issuer?: 'request' | 'store' | string
}

export type HandlerRefreshAuth = Pick<HandlerAuthParams, 'access_token' | 'refresh_token' | 'expires' | 'expires_in' | 'client_endpoint' | 'server_endpoint' | 'member_id' | 'scope' | 'status' | 'domain'>

/**
 * Callback called when OAuth authorization is updated
 */
export type CallbackRefreshAuth = (params: { authData: AuthData, b24OAuthParams: B24OAuthParams }) => Promise<void>

/**
 * Use for custom get new refresh token for OAuth
 */
export type CustomRefreshAuth = () => Promise<HandlerRefreshAuth>

/**
 * Parameters passed from the parent window when calling refreshAuth
 */
export type RefreshAuthData = {
  AUTH_ID: string
  REFRESH_ID: string
  AUTH_EXPIRES: NumberString
}

/**
 * Parameters passed from the parent window when calling getInitData
 */
export type MessageInitData = RefreshAuthData & {
  DOMAIN: string
  PROTOCOL: string
  PATH: string
  LANG: string
  MEMBER_ID: string
  IS_ADMIN: boolean
  APP_OPTIONS: Record<string, any>
  USER_OPTIONS: Record<string, any>
  PLACEMENT: string
  PLACEMENT_OPTIONS: Record<string, any>
  INSTALL: boolean
  FIRST_RUN: boolean
}

/**
 * Parameters for OAuth authorization
 */
export type AuthData = {
  access_token: string
  refresh_token: string
  expires: number
  expires_in: number
  domain: string
  member_id: string
}

/**
 * Interface for updating authorization
 */
export interface AuthActions {
  getAuthData: () => false | AuthData
  refreshAuth: () => Promise<AuthData>
  getUniq: (prefix: string) => string
  isAdmin: boolean
}
