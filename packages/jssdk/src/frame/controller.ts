import { B24LangList } from "../core/language/list"
import { AbstractB24, type IB24 } from '../core/abstractB24'
import Http from "../core/http/controller"
import { LoggerBrowser } from "../logger/browser"
import { PlacementManager } from "./placement"
import { AuthManager } from "./auth"
import { AppFrame } from "./frame"
import { OptionsManager } from "./options"
import { ParentManager } from "./parent"
import { SliderManager } from "./slider"
import { MessageManager, MessageCommands } from "./message"

import type {
	MessageInitData,
	B24FrameQueryParams
} from "../types/auth"

/**
 * B24 Manager. Replacement api.bitrix24.com
 *
 * @link https://api.bitrix24.com/api/v1/
 */
export class B24Frame
	extends AbstractB24
	implements IB24
{
	#isInstallMode: boolean = false
	#isFirstRun: boolean = false
	
	readonly #appFrame: AppFrame
	readonly #placementManager: PlacementManager
	readonly #messageManager: MessageManager
	readonly #authManager: AuthManager
	readonly #optionsManager: OptionsManager
	readonly #parent: ParentManager
	readonly #slider: SliderManager
	
	// region Init ////
	constructor(
		queryParams: B24FrameQueryParams,
	)
	{
		super()
		
		this.#appFrame = new AppFrame(queryParams)
		
		this.#placementManager = new PlacementManager()
		
		this.#messageManager = new MessageManager(this.#appFrame)
		this.#messageManager.subscribe()
		
		this.#authManager = new AuthManager(
			this.#appFrame,
			this.#messageManager
		)
		
		this.#optionsManager = new OptionsManager(
			this.#messageManager
		)
		
		this.#parent = new ParentManager(
			this.#messageManager
		)
		
		this.#slider = new SliderManager(
			this.#appFrame,
			this.#messageManager
		)
		
		this._isInit = false
	}
	
	override setLogger(logger: LoggerBrowser): void
	{
		super.setLogger(logger)
		this.#messageManager.setLogger(this.getLogger())
	}
	
	get isFirstRun(): boolean
	{
		this._ensureInitialized()
		return this.#isFirstRun
	}
	
	get isInstallMode(): boolean
	{
		this._ensureInitialized()
		return this.#isInstallMode
	}
	
	get parent(): ParentManager
	{
		this._ensureInitialized()
		return this.#parent
	}
	
	get auth(): AuthManager
	{
		this._ensureInitialized()
		return this.#authManager
	}
	
	get slider(): SliderManager
	{
		this._ensureInitialized()
		return this.#slider
	}
	
	get placement(): PlacementManager
	{
		this._ensureInitialized()
		return this.#placementManager
	}
	
	get options(): OptionsManager
	{
		this._ensureInitialized()
		return this.#optionsManager
	}
	
	override async init(): Promise<void>
	{
		return this.#messageManager.send(
			MessageCommands.getInitData,
			{}
		)
		.then((data: MessageInitData) => {
			
			this.getLogger().log('init data:', data)
			
			this.#appFrame.initData(data)
			this.#authManager.initData(data)
			this.#placementManager.initData(data)
			this.#optionsManager.initData(data)
			
			this.#isInstallMode = data.INSTALL
			this.#isFirstRun = data.FIRST_RUN
			
			this._http = new Http(
				this.#appFrame.getTargetOriginWithPath(),
				this.#authManager,
				this._getHttpOptions(),
			)
			
			if(this.#isFirstRun)
			{
				
				/**
				 * @memo Writes the fact of the 1st launch to app_options
				 */
				return this.#messageManager.send(
					MessageCommands.setInstall,
					{
						install: true
					}
				)
			}
			
			this._isInit = true
			
			return Promise.resolve()
		})
	}
	
	/**
	 * Destructor.
	 * Removes an event subscription
	 */
	override destroy()
	{
		super.destroy()
		this.#messageManager.unsubscribe()
	}
	// endregion ////
	
	// region Core ////
	/**
	 * Signals that the installer or application setup has finished running.
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-install-finish.html
	 */
	async installFinish(): Promise<any>
	{
		if(!this.isInstallMode)
		{
			return Promise.reject(new Error('Application was previously installed. You cannot call installFinish'))
		}
		
		return this.#messageManager.send(
			MessageCommands.setInstallFinish,
			{}
		)
	}
	// endregion ////
	
	// region Get ////
	/**
	 * Get the account address BX24 ( https://name.bitrix24.com )
	 */
	override getTargetOrigin(): string
	{
		this._ensureInitialized()
		return this.#appFrame.getTargetOrigin()
	}
	
	/**
	 * Get the account address BX24 with Path ( https://name.bitrix24.com/rest )
	 */
	override getTargetOriginWithPath(): string
	{
		this._ensureInitialized()
		return this.#appFrame.getTargetOriginWithPath()
	}
	
	/**
	 * Returns the sid of the application relative to the parent window like this `9c33468728e1d2c8c97562475edfd96`
	 */
	getAppSid(): string
	{
		this._ensureInitialized()
		return this.#appFrame.getAppSid()
	}
	
	/**
	 * Returns the localization of the B24 interface
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-get-lang.html
	 */
	getLang(): B24LangList
	{
		this._ensureInitialized()
		return this.#appFrame.getLang()
	}
	// endregion ////
}