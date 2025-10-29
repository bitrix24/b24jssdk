import { AppFrame } from './frame'
import { MessageManager, MessageCommands } from './message'
import type {
	AuthActions,
	AuthData,
	RefreshAuthData,
	MessageInitData,
} from '../types/auth'

/**
 * Authorization Manager
 */
export class AuthManager implements AuthActions {
	#accessToken: null | string = null
	#refreshId: null | string = null
	#authExpires: number = 0
	#authExpiresIn: number = 0
	#memberId: null | string = null

	#isAdmin: boolean = false

	#appFrame: AppFrame
	#messageManager: MessageManager

	constructor(appFrame: AppFrame, messageManager: MessageManager) {
		this.#appFrame = appFrame
		this.#messageManager = messageManager
	}

	/**
	 * Initializes the data received from the parent window message.
	 * @param data
	 */
	initData(data: MessageInitData): AuthManager {
		if (data.AUTH_ID) {
			this.#accessToken = data.AUTH_ID
			this.#refreshId = data.REFRESH_ID
			this.#authExpiresIn = Number.parseInt(data.AUTH_EXPIRES)
			this.#authExpires = Date.now() + this.#authExpiresIn * 1_000

			this.#isAdmin = data.IS_ADMIN
			this.#memberId = data.MEMBER_ID || ''
		}

		return this
	}

	/**
	 * Returns authorization data
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-get-auth.html
	 */
	getAuthData(): false | AuthData {
		return this.#authExpires > Date.now()
			? ({
					access_token: this.#accessToken,
					refresh_token: this.#refreshId,
          expires: this.#authExpires / 1_000,
          expires_in: this.#authExpiresIn,
					domain: this.#appFrame.getTargetOrigin(),
					member_id: this.#memberId,
				} as AuthData)
			: false
	}

	/**
	 * Updates authorization data through the parent window
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-refresh-auth.html
	 */
	async refreshAuth(): Promise<AuthData> {
		return this.#messageManager
			.send(MessageCommands.refreshAuth, {})
			.then((data: RefreshAuthData) => {
				this.#accessToken = data.AUTH_ID
				this.#refreshId = data.REFRESH_ID
				this.#authExpires = Date.now() + Number.parseInt(data.AUTH_EXPIRES) * 1_000

				return Promise.resolve(this.getAuthData() as AuthData)
			})
	}

	getUniq(prefix: string): string {
		return [prefix, this.#memberId || ''].join('_')
	}

	/**
	 * Determines whether the current user has administrator rights
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-is-admin.html
	 */
	get isAdmin(): boolean {
		return this.#isAdmin
	}
}
