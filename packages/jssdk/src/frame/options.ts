import { MessageManager, MessageCommands } from "./message";
import type { MessageInitData } from "../types/auth";

/**
 * Manager for working with application settings via communication with the parent window
 */
export class OptionsManager
{
	#messageManager: MessageManager;
	#appOptions: null | Record<string, any> = null;
	#userOptions: null | Record<string, any> = null;
	
	constructor(
		messageManager: MessageManager
	)
	{
		this.#messageManager = messageManager;
	}
	
	/**
	 * Initializes the data received from the parent window message.
	 * @param data
	 */
	initData(data: MessageInitData): OptionsManager
	{
		if(!!data.APP_OPTIONS)
		{
			this.#appOptions = data.APP_OPTIONS as Record<string, any>;
		}
		
		if(!!data.USER_OPTIONS)
		{
			this.#userOptions = data.USER_OPTIONS as Record<string, any>;
		}
		
		return this;
	}
	
	/**
	 * Getting application option
	 */
	appGet(option: string): any
	{
		if(this.#appOptions && !!this.#appOptions[option])
		{
			return this.#appOptions[option];
		}
		
		throw new Error(`app.option.${option} not set`);
	}
	
	/**
	 * Updates application data through the parent window
	 */
	async appSet(option: string, value: any): Promise<void>
	{
		if(!this.#appOptions)
		{
			this.#appOptions = [];
		}
		
		this.#appOptions[option] = value;
		
		return this.#sendParentMessage(
			MessageCommands.setAppOption,
			option,
			this.#appOptions[option]
		);
	}
	
	/**
	 * Getting user option
	 */
	userGet(option: string): any
	{
		if(!this.#appOptions)
		{
			this.#appOptions = [];
		}
		
		// @ts-ignore
		if(!!this.#userOptions[option])
		{
			// @ts-ignore
			return this.#userOptions[option];
		}
		
		throw new Error(`user.option.${option} not set`);
	}
	
	/**
	 * Updates user data through the parent window
	 */
	async userSet(option: string, value: any): Promise<void>
	{
		if(!this.#appOptions)
		{
			this.#appOptions = [];
		}
		
		if(!this.#appOptions[option])
		{
			this.#appOptions[option] = null;
		}
		
		// @ts-ignore
		this.#userOptions[option] = value;
		
		return this.#sendParentMessage(
			MessageCommands.setUserOption,
			option,
			// @ts-ignore
			this.#userOptions[option]
		);
	}
	
	async #sendParentMessage(
		command: string,
		option: string,
		value: any
	): Promise<void>
	{
		return this.#messageManager.send(
			command,
			{
				name: option,
				value: value,
				isSafely: true
			},
		)
		.then(() => {
			return Promise.resolve();
		});
	}
}