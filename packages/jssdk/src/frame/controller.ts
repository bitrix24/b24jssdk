import { LoggerBrowser } from '../logger/browser'
import { AbstractB24 } from '../core/abstract-b24'
import Http from '../core/http/controller'
import { AppFrame } from './frame'
import { MessageManager, MessageCommands } from './message'
import { B24LangList } from '../core/language/list'
import { AuthManager } from './auth'
import { ParentManager } from './parent'
import { OptionsManager } from './options'
import { DialogManager } from './dialog';
import { SliderManager } from './slider'
import { PlacementManager } from './placement'
import type { TypeB24 } from '../types/b24'
import type { AuthActions } from '../types/auth'

import type {
	MessageInitData,
	B24FrameQueryParams
} from '../types/auth'

/**
 * B24 Manager. Replacement api.bitrix24.com
 *
 * @link https://api.bitrix24.com/api/v1/
 * @see /bitrix/js/rest/applayout.js
 */
export class B24Frame
	extends AbstractB24
	implements TypeB24
{
	#isInstallMode: boolean = false
	#isFirstRun: boolean = false
	
	readonly #appFrame: AppFrame
	readonly #messageManager: MessageManager
	readonly #authManager: AuthManager
	readonly #parentManager: ParentManager
	readonly #optionsManager: OptionsManager
	readonly #dialogManager: DialogManager
	readonly #sliderManager: SliderManager
	readonly #placementManager: PlacementManager
	
	// region Init ////
	constructor(
		queryParams: B24FrameQueryParams,
	)
	{
		super()
		
		this.#appFrame = new AppFrame(queryParams)
		
		this.#messageManager = new MessageManager(this.#appFrame)
		this.#messageManager.subscribe()
		
		this.#authManager = new AuthManager( this.#appFrame, this.#messageManager )
		this.#parentManager = new ParentManager( this.#messageManager )
		this.#optionsManager = new OptionsManager( this.#messageManager )
		this.#dialogManager = new DialogManager( this.#messageManager )
		this.#sliderManager = new SliderManager( this.#appFrame, this.#messageManager )
		this.#placementManager = new PlacementManager()
		
		this._isInit = false
	}
	
	public override setLogger(logger: LoggerBrowser): void
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
		return this.#parentManager
	}
	
	override get auth(): AuthActions
	{
		this._ensureInitialized()
		return this.#authManager
	}
	
	get slider(): SliderManager
	{
		this._ensureInitialized()
		return this.#sliderManager
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
	
	get dialog(): DialogManager
	{
		this._ensureInitialized()
		return this.#dialogManager
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
			
			/**
			 * @memo Writes the fact of the 1st launch to `app_options`
			 */
			if(this.#isFirstRun)
			{
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
		this.#messageManager.unsubscribe()
		super.destroy()
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