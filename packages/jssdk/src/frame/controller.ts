import { AbstractB24 } from '../core/abstractB24';
import { B24LangList, Http } from "../core";
import { LoggerBrowser, LoggerType } from "../logger/browser";
import { PropertiesManager } from "./properties";
import { PlacementManager } from "./placement";
import { AuthManager } from "./auth";
import { AppFrame } from "./frame";
import { OptionsManager } from "./options";
import { ParentManager } from "./parent";
import { SliderManager } from "./slider";
import { MessageManager, MessageCommands } from "./message";

import type {
	MessageInitData,
	B24FrameQueryParams
} from "../types";

/**
 * B24 Manager. Replacement api.bitrix24.com
 *
 * @link https://api.bitrix24.com/api/v1/
 */
export class B24Frame
	extends AbstractB24
{
	#isInstallMode: boolean = false;
	#isFirstRun: boolean = false;
	
	readonly #appFrame: AppFrame;
	readonly #placementManager: PlacementManager;
	readonly #messageManager: MessageManager;
	readonly #authManager: AuthManager;
	readonly #optionsManager: OptionsManager;
	readonly #parent: ParentManager;
	readonly #slider: SliderManager;
	readonly #properties: PropertiesManager;
	
	// region Init ////
	constructor(
		queryParams: B24FrameQueryParams,
	)
	{
		super();
		this.logger = LoggerBrowser.build(`B24Frame:controller`);
		this.logger.disable(LoggerType.log);
		// this.logger.disable(LoggerType.info); ////
		// this.logger.disable(LoggerType.warn); ////
		
		this.#appFrame = new AppFrame(queryParams);
		
		this.#placementManager = new PlacementManager();
		
		this.#messageManager = new MessageManager(this.#appFrame);
		this.#messageManager.subscribe();
		
		this.#authManager = new AuthManager(
			this.#appFrame,
			this.#messageManager
		);
		
		this.#optionsManager = new OptionsManager(
			this.#messageManager
		);
		
		this.#parent = new ParentManager(
			this.#messageManager
		);
		
		this.#slider = new SliderManager(
			this.#appFrame,
			this.#messageManager
		);
		
		this.#properties = new PropertiesManager(
			this.#appFrame.getTargetOrigin()
		);
		
		this._isInit = false;
	}
	
	get isFirstRun(): boolean
	{
		if(!this.isInit)
		{
			this.#errorNoInit('isFirstRun');
		}
		
		return this.#isFirstRun;
	}
	
	get isInstallMode(): boolean
	{
		if(!this.isInit)
		{
			this.#errorNoInit('isInstallMode');
		}
		
		return this.#isInstallMode;
	}
	
	get parent(): ParentManager
	{
		if(!this.isInit)
		{
			this.#errorNoInit('parent');
		}
		
		return this.#parent;
	}
	
	get auth(): AuthManager
	{
		if(!this.isInit)
		{
			this.#errorNoInit('auth');
		}
		
		return this.#authManager;
	}
	
	get slider(): SliderManager
	{
		if(!this.isInit)
		{
			this.#errorNoInit('slider');
		}
		
		return this.#slider;
	}
	
	get properties(): PropertiesManager
	{
		if(!this.isInit)
		{
			this.#errorNoInit('properties');
		}
		
		return this.#properties;
	}
	
	get placement(): PlacementManager
	{
		if(!this.isInit)
		{
			this.#errorNoInit('placement');
		}
		
		return this.#placementManager;
	}
	
	get options(): OptionsManager
	{
		if(!this.isInit)
		{
			this.#errorNoInit('options');
		}
		
		return this.#optionsManager;
	}
	
	override async init(): Promise<void>
	{
		return this.#messageManager.send(
			MessageCommands.getInitData,
			{}
		)
		.then((data: MessageInitData) => {
			
			this.logger.log('init data:', data);
			
			this.#appFrame.initData(data);
			this.#authManager.initData(data);
			this.#placementManager.initData(data);
			this.#optionsManager.initData(data);
			
			this.#isInstallMode = data.INSTALL;
			this.#isFirstRun = data.FIRST_RUN;
			
			this._http = new Http(
				this.#appFrame.getTargetOriginWithPath(),
				this.#authManager,
				this._getHttpOptions(),
			);
			
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
				);
			}
			
			return Promise.resolve();
		})
		.then(() => {
			this._isInit = true;
			
			return this.#properties.loadData(this);
		})
		.then(() => {
			return Promise.resolve();
		});
	}
	
	/**
	 * Destructor.
	 * Removes an event subscription
	 */
	override destroy()
	{
		super.destroy();
		this.#messageManager.unsubscribe();
	}
	// endregion ////
	
	// region Core ////
	/**
	 * Signals that the installer or application setup has finished running.
	 *
	 * @link https://dev.1c-bitrix.ru/rest_help/js_library/system/installFinish.php
	 */
	async installFinish(): Promise<any>
	{
		if(!this.isInstallMode)
		{
			return Promise.reject(new Error('Application was previously installed. You cannot call installFinish'));
		}
		
		return this.#messageManager.send(
			MessageCommands.setInstallFinish,
			{}
		);
	}
	// endregion ////
	
	// region Get ////
	/**
	 * Returns the localization of the B24 interface
	 */
	getLang(): B24LangList
	{
		if(!this.isInit)
		{
			this.#errorNoInit('getLang');
		}
		
		return this.#appFrame.getLang();
	}
	// endregion ////
	
	// region Tools ////
	/**
	 * Generates Promise.reject() if the object is not initialized
	 * @private
	 *
	 *
	 */
	#rejectNoInit()
	{
		return Promise.reject(new Error('B24Frame not init.'));
	}
	
	/**
	 * Generates an object not initialized error
	 * @param info
	 * @private
	 */
	#errorNoInit(info?: string): string
	{
		throw new Error(`B24Frame not init ${info ?? ''}`);
	}
	// endregion ////
}