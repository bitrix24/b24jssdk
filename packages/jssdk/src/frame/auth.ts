import { AppFrame } from "./frame";
import { MessageManager, MessageCommands } from "./message";
import type {
	AuthActions,
	AuthData,
	RefreshAuthData,
	MessageInitData
} from "../types/auth";

/**
 * Authorization Manager
 */
export class AuthManager
	implements AuthActions
{
	#accessToken: null|string = null;
	#refreshId: null|string = null;
	#authExpires: number = 0;
	#memberId: null|string = null;
	
	#isAdmin: boolean = false;
	
	#appFrame: AppFrame;
	#messageManager: MessageManager;
	
	constructor(
		appFrame: AppFrame,
		messageManager: MessageManager
	)
	{
		this.#appFrame = appFrame;
		this.#messageManager = messageManager;
	}
	
	/**
	 * Initializes the data received from the parent window message.
	 * @param data
	 */
	initData(data: MessageInitData): AuthManager
	{
		if(!!data.AUTH_ID)
		{
			this.#accessToken = data.AUTH_ID;
			this.#refreshId = data.REFRESH_ID;
			this.#authExpires = (new Date()).valueOf() + parseInt(data.AUTH_EXPIRES) * 1_000;
			
			this.#isAdmin = data.IS_ADMIN;
			this.#memberId = data.MEMBER_ID || '';
		}
		
		return this;
	}
	
	/**
	 * Returns authorization data
	 */
	getAuthData(): false|AuthData
	{
		return (this.#authExpires > (new Date()).valueOf())
		? {
			access_token: this.#accessToken,
			refresh_token: this.#refreshId,
			expires_in: this.#authExpires,
			domain: this.#appFrame.getTargetOrigin(),
			member_id: this.#memberId
		} as AuthData
		: false;
	}
	
	/**
	 * Updates authorization data through the parent window
	 */
	async refreshAuth(): Promise<AuthData>
	{
		return this.#messageManager.send(
			MessageCommands.refreshAuth,
			{},
		)
		.then((data: RefreshAuthData) => {
			this.#accessToken = data.AUTH_ID;
			this.#refreshId = data.REFRESH_ID;
			this.#authExpires = (new Date()).valueOf() + parseInt(data.AUTH_EXPIRES) * 1_000;
			
			return Promise.resolve(
				this.getAuthData() as AuthData
			);
		});
	}
	
	/**
	 * Determines whether the current user has administrator rights
	 * @see https://dev.1c-bitrix.ru/rest_help/js_library/additional/isAdmin.php
	 */
	get isAdmin(): boolean
	{
		return this.#isAdmin;
	}
}