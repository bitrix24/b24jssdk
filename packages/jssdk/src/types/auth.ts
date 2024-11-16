import type { NumberString } from './common'

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
