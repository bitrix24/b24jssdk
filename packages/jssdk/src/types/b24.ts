import { LoggerBrowser } from '../logger/browser'
import { AjaxResult } from '../core/http/ajaxResult'
import { Result } from '../core/result'
import type { TypeHttp } from './http'
import type {AuthActions} from "./auth";

export type TypeB24 = {
	/**
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-init.html
	 */
	readonly isInit: boolean;
	init(): Promise<void>;
	destroy(): void;
	
	getLogger(): LoggerBrowser;
	setLogger(logger: LoggerBrowser): void;
	
	get auth(): AuthActions
	
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
	 * @param {null|((progress: number) => void)} progress Processing steps
	 * @param {string} customKeyForResult Custom field indicating that the result will be a grouping key
	 * @return {Promise}
	 */
	callListMethod(
		method: string,
		params?: object,
		progress?: null|((progress: number) => void),
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
	 * calls = [[method,params],[method,params]]
	 * calls = [{method:method,params:params},[method,params]]
	 * calls = {call_id:[method,params],...}
	 * @param  {boolean} isHaltOnError Abort package execution when an error occurs
	 *
	 * @return {Promise} Promise
	 *
	 * @see https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-batch.html
	 */
	callBatch(calls: Array<any> | object, isHaltOnError?: boolean): Promise<Result>;
	
	/**
	 * Calls a batch request with any number of commands
	 *
	 * @param  {array} calls Request packet
	 * calls = [[method,params],[method,params]]
	 * @param  {boolean} isHaltOnError Abort package execution when an error occurs
	 *
	 * @return {Promise} Promise
	 *
	 * @see https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-batch.html
	 */
	callBatchByChunk(calls: Array<any>, isHaltOnError: boolean): Promise<Result>;
	
	/**
	 * Returns Http client for requests
	 */
	getHttpClient(): TypeHttp;
}