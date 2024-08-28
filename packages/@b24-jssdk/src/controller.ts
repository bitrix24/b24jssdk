import { LoggerBrowser, LoggerType } from './logger/browser';
import type { B24FrameQueryParams, MessageInitData } from "./types/auth";
import type { ListPayload } from "./types/payloads";
import { AppFrame } from './frame';
import { AuthManager } from './auth';
import { Result } from './result';
import { MessageManager } from './message';
import { MessageCommands } from './message/commands';
import Http from './http';
import { B24LangList } from './language/list';
import type { AjaxResult } from "./http/ajaxResult";
import { ParentManager } from './parent';
import { SliderManager } from './slider';
import { PlacementManager } from "./placement";
import { PropertiesManager } from "./properties";
import { OptionsManager } from "./options";

/**
 * B24 Manager. Replacement api.bitrix24.com
 *
 * @link https://api.bitrix24.com/api/v1/
 */
export class B24Frame
{
	static readonly batchSize = 50;
	
	#isInit: boolean = false;
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
	
	#http: null|Http = null;
	
	private logger: LoggerBrowser;
	
	// region Init ////
	constructor(
		queryParams: B24FrameQueryParams,
	)
	{
		this.logger = LoggerBrowser.build('b24frame:controller');
		this.logger.disable(LoggerType.log); ////
		// this.logger.disable(LoggerType.info); ////
		// this.logger.disable(LoggerType.warn); ////
		
		this.#appFrame = new AppFrame(queryParams);
		
		this.#placementManager = new PlacementManager();
		
		this.#isInit = false;
		
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
			//this.#appFrame,
			this.#messageManager
		);
		
		this.#slider = new SliderManager(
			this.#appFrame,
			this.#messageManager
		);
		
		this.#properties = new PropertiesManager(
			this.#appFrame
		);
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
	
	get isInit(): boolean
	{
		return this.#isInit;
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
	
	async init(): Promise<void>
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
			
			this.#http = new Http(
				this.#appFrame,
				this.#authManager,
				this.#getHttpOptions(),
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
			this.#isInit = true;
			
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
	destroy()
	{
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
	
	/**
	 * Calls a REST service method with the specified parameters
	 *
	 * @param {string} method
	 * @param {object} params
	 * @param {number} start
	 *
	 * @return {object} Promise
	 *
	 * @see https://dev.1c-bitrix.ru/rest_help/js_library/rest/callMethod.php BX24.callMethod
	 */
	callMethod(
		method: string,
		params: object = {},
		start: number = 0
	): Promise<AjaxResult>
	{
		return this.getHttpClient().call(
			method,
			params,
			start
		);
	}
	
	/**
	 * Calls a REST service list method with the specified parameters
	 *
	 * @param  {string} method Query method
	 * @param  {object} params Request parameters
	 * @param {null|Function} progress Processing steps
	 *
	 * @return {object} Promise
	 *
	 * @see https://dev.1c-bitrix.ru/rest_help/js_library/rest/callMethod.php BX24.callMethod
	 */
	async callListMethod(
		method: string,
		params: object = {},
		progress: null|Function = null
	): Promise<Result>
	{
		const result = new Result();
		
		if(!!progress)
		{
			progress(0);
		}
		
		return this.callMethod(
			method,
			params,
			0
		)
		.then(async(response) =>
		{
			let list: any[] = [];
			
			let resultData = (response.getData() as ListPayload<any>).result;
			if(!!resultData?.items)
			{
				resultData = resultData.items;
			}
			
			list = list.concat(resultData);
			if(response.isMore())
			{
				let responseLoop: false|AjaxResult = response;
				while(true)
				{
					responseLoop = await responseLoop.getNext(this.getHttpClient());
					
					if(responseLoop === false)
					{
						break;
					}
					
					resultData = (responseLoop.getData() as ListPayload<any>).result;
					if(!!resultData?.items)
					{
						resultData = resultData.items;
					}
					
					list = list.concat(resultData.result);
					
					if(!!progress)
					{
						let total = responseLoop.getTotal();
						progress(total > 0 ? Math.round(100 * list.length / total) : 100);
					}
				}
			}
			
			result.setData(list);
			
			return Promise.resolve(result);
		});
	}
	
	/**
	 * Calls a REST service list method with the specified parameters and returns a generator object.
	 * Implements the fast algorithm described in {@see https://dev.1c-bitrix.ru/rest_help/rest_sum/start.php}
	 *
	 * @param {string} method Query method
	 * @param {object} params Request parameters
	 * @param {string} idKey Entity ID field name ('ID' || 'id')
	 * @param {string} customKeyForResult Custom field indicating that the result will be a grouping key
	 *
	 * @return {AsyncGenerator} Generator
	 * @see https://dev.1c-bitrix.ru/rest_help/js_library/rest/callMethod.php BX24.callMethod
	 */
	async *fetchListMethod(
		method: string,
		params: {
			moduleId?: string,
			select?: string[]|{[key: string]: any},
			order?: any,
			filter?: any,
			start?: number
		} = {},
		idKey: string = 'ID',
		customKeyForResult: null|string = null
	): AsyncGenerator<any[]>
	{
		params.order = params.order || {};
		params.filter = params.filter || {};
		params.start = -1;
		
		let moreIdKey = `>${idKey}`;
		
		params.order[idKey] = 'ASC';
		params.filter[moreIdKey] = 0;
		
		do
		{
			let result = await this.callMethod(method, params, params.start);
			let data = undefined;
			if(null !== customKeyForResult)
			{
				data = result.getData().result[customKeyForResult] as [];
			}
			else
			{
				data = result.getData().result as [];
			}
			
			if(data.length === 0)
			{
				break;
			}
			
			yield data;
			
			if(data.length < 50)
			{
				break;
			}
			
			// @ts-ignore
			params.filter[ moreIdKey ] = data[ data.length - 1 ][ idKey ];
			
		} while(true);
	}
	
	/**
	 * Calls a batch request with a maximum number of commands of no more than 50
	 *
	 * @param  {array|object} calls Request packet
	 * calls = [[method,params],[method,params]];
	 * calls = [{method:method,params:params},[method,params]];
	 * calls = {call_id:[method,params],...};
	 * @param  {boolean} isHaltOnError Abort package execution when an error occurs
	 * @return {object} Promise
	 *
	 * @see https://dev.1c-bitrix.ru/rest_help/js_library/rest/callBatch.php BX24.callBatch
	 */
	callBatch(
		calls: Array<any>|object,
		isHaltOnError: boolean = true
	): Promise<Result>
	{
		return this.getHttpClient().batch(
			calls,
			isHaltOnError
		);
	}
	
	async callLongBatch(
		calls: any[],
		isHaltOnError: boolean = true,
		progress: null|Function = null
	): Promise<Result>
	{
		const result = new Result();
		
		let list: any[] = [];
		let total = calls.length;
		let counter = 0;
		let start = 0;

		if(!!progress)
		{
			progress(0);
		}

		do
		{
			let end = start + B24Frame.batchSize;
			let chunk = calls.slice(start, end);
			
			if(chunk.length < 1)
			{
				break;
			}
			let response = await this.callBatch(
				chunk,
				isHaltOnError
			);
			
			counter += chunk.length;
			list = list.concat(response.getData());

			if(!!progress)
			{
				progress(
					total > 0
					? Math.round(100 * counter / total)
					: 100
				);
			}

			start = end;
			if(start >= total)
			{
				break;
			}

		} while(true);
		
		result.setData(list);
			
		return Promise.resolve(result);
	}
	
	async *fetchLongBatch(
		calls: any[],
		isHaltOnError: boolean = true,
		progress: null|Function = null
	)
	{
		let total = calls.length;
		let counter = 0;
		let start = 0;

		if(!!progress)
		{
			progress(0);
		}

		do {
			let end = start + B24Frame.batchSize;
			let chunk = calls.slice(start, end);

			let list = await this.callBatch(
				chunk,
				isHaltOnError
			);
			
			counter += chunk.length;
			if(!!progress)
			{
				progress(
					total > 0
					? Math.round(100 * counter / total)
					: 100
				);
			}
			
			yield list;

			start = end;
			if(start >= total)
			{
				break;
			}

		} while(true);
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
	 * Returns Http client for requests
	 */
	getHttpClient(): Http
	{
		if(
			!this.isInit
			|| !(this.#http instanceof Http)
		)
		{
			throw new Error(`B24Frame not init`);
		}
		
		return this.#http;
	}
	
	/**
	 * Returns settings for http connection
	 * @private
	 */
	#getHttpOptions(): null|{}
	{
		return null;
	}
	
	
	/**
	 * Generates Promise.reject() if the object is not initialized
	 * @private
	 *
	 *
	 */
	// @ts-ignore
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