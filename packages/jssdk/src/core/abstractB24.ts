import { LoggerBrowser, LoggerType } from "../logger/browser"
import { Result } from "./result"
import Http from "./http/controller"
import { AjaxResult } from "./http/ajaxResult"
import type { ListPayload } from "../types/payloads"

export interface IB24
{
	/**
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-init.html
	 */
	readonly isInit: boolean;
	init(): Promise<void>;
	destroy(): void;
	
	setLogger(logger: LoggerBrowser): void;
	getLogger(): LoggerBrowser;
	
	/**
	 * Get the account address BX24 ( https://name.bitrix24.com )
	 */
	getTargetOrigin(): string;
	
	/**
	 * Get the account address BX24 ( https://name.bitrix24.com/rest )
	 */
	getTargetOriginWithPath(): string;
	
	/**
	 * Calls a REST service method with the specified parameters
	 *
	 * @param {string} method
	 * @param {object} params
	 * @param {number} start
	 *
	 * @return {Promise}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-method.html
	 */
	callMethod(method: string, params?: object, start?: number): Promise<AjaxResult>;
	
	/**
	 * Calls a REST service list method with the specified parameters
	 *
	 * @param  {string} method Query method
	 * @param  {object} params Request parameters
	 * @param {null|Function} progress Processing steps
	 * @param {string} customKeyForResult Custom field indicating that the result will be a grouping key
	 * @return {Promise}
	 */
	callListMethod(
		method: string,
		params?: object,
		progress?: Function | null,
		customKeyForResult?: string | null
	): Promise<Result>;
	
	/**
	 * Calls a REST service list method with the specified parameters and returns a generator object.
	 * Implements the fast algorithm described in {@see https://apidocs.bitrix24.com/api-reference/performance/huge-data.html}
	 *
	 * @param {string} method Query method
	 * @param {object} params Request parameters
	 * @param {string} idKey Entity ID field name ('ID' || 'id')
	 * @param {string} customKeyForResult Custom field indicating that the result will be a grouping key
	 *
	 * @return {AsyncGenerator} Generator
	 */
	fetchListMethod(
		method: string,
		params?: any,
		idKey?: string,
		customKeyForResult?: string | null
	): AsyncGenerator<any[]>;
	
	/**
	 * Calls a batch request with a maximum number of commands of no more than 50
	 *
	 * @param  {array|object} calls Request packet
	 * calls = [[method,params],[method,params]];
	 * calls = [{method:method,params:params},[method,params]];
	 * calls = {call_id:[method,params],...};
	 * @param  {boolean} isHaltOnError Abort package execution when an error occurs
	 *
	 * @return {Promise} Promise
	 *
	 * @see https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-batch.html
	 */
	callBatch(calls: Array<any> | object, isHaltOnError?: boolean): Promise<Result>;
	
	/**
	 * Returns Http client for requests
	 */
	getHttpClient(): Http;
}

export abstract class AbstractB24
	implements IB24
{
	static readonly batchSize = 50;
	
	protected _isInit: boolean = false;
	protected _http: null|Http = null;
	protected _logger: null|LoggerBrowser = null;
	
	// region Init ////
	protected constructor()
	{
		this._isInit = false;
	}
	
	/**
	 * @inheritDoc
	 */
	get isInit(): boolean
	{
		return this._isInit;
	}
	
	async init(): Promise<void>
	{
		this._isInit = true;
		return Promise.resolve();
	}
	
	destroy()
	{
	
	}
	
	setLogger(logger: LoggerBrowser): void
	{
		this._logger = logger
		this.getHttpClient().setLogger(this.getLogger());
	}
	
	getLogger(): LoggerBrowser
	{
		if(null === this._logger)
		{
			this._logger = LoggerBrowser.build(
				`NullLogger`
			)
			
			this._logger.setConfig({
				[LoggerType.desktop]: false,
				[LoggerType.log]: false,
				[LoggerType.info]: false,
				[LoggerType.warn]: false,
				[LoggerType.error]: true,
				[LoggerType.trace]: false,
			})
		}
		
		return this._logger;
	}
	// endregion ////
	
	// region Core ////
	/**
	 * @inheritDoc
	 */
	abstract getTargetOrigin(): string
	
	/**
	 * @inheritDoc
	 */
	abstract getTargetOriginWithPath(): string
	
	/**
	 * @inheritDoc
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
	 * @inheritDoc
	 */
	async callListMethod(
		method: string,
		params: object = {},
		progress: null|Function = null,
		customKeyForResult: null|string = null
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
			let list: any[] = []
			
			let resultData = undefined;
			if(null !== customKeyForResult)
			{
				resultData = (response.getData() as ListPayload<any>).result[customKeyForResult] as [];
			}
			else
			{
				resultData = (response.getData() as ListPayload<any>).result as [];
			}
			
			list = list.concat(resultData)
			if(response.isMore())
			{
				let responseLoop: false|AjaxResult = response;
				while(true)
				{
					responseLoop = await responseLoop.getNext(this.getHttpClient())
					
					if(responseLoop === false)
					{
						break
					}
					
					let resultData = undefined;
					if(null !== customKeyForResult)
					{
						resultData = (responseLoop.getData() as ListPayload<any>).result[customKeyForResult] as [];
					}
					else
					{
						resultData = (responseLoop.getData() as ListPayload<any>).result as [];
					}
					
					list = list.concat(resultData)
					
					if(!!progress)
					{
						let total = responseLoop.getTotal()
						progress(total > 0 ? Math.round(100 * list.length / total) : 100)
					}
				}
			}
			
			result.setData(list)
			if(!!progress)
			{
				progress(100);
			}
			
			return Promise.resolve(result)
		});
	}
	
	/**
	 * @inheritDoc
	 */
	async *fetchListMethod(
		method: string,
		params: any = {},
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
			
			if(data.length < AbstractB24.batchSize)
			{
				break;
			}
			
			const value =  data[ data.length - 1 ];
			if(
				value
				&& idKey in value
			)
			{
				params.filter[ moreIdKey ] = value[ idKey ];
			}
			
		} while(true);
	}
	
	/**
	 * @inheritDoc
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
	// endregion ////
	
	// region Tools ////
	/**
	 * @inheritDoc
	 */
	getHttpClient(): Http
	{
		if(
			!this.isInit
			|| !(this._http instanceof Http)
		)
		{
			throw new Error(`Http not init`);
		}
		
		return this._http;
	}
	
	/**
	 * Returns settings for http connection
	 * @private
	 */
	protected _getHttpOptions(): null|{}
	{
		return null;
	}

	/**
	 * Generates an object not initialized error
	 * @private
	 */
	protected _ensureInitialized(): void
	{
		if(!this._isInit)
		{
			throw new Error('B24 not initialized');
		}
	}
	// endregion ////
}