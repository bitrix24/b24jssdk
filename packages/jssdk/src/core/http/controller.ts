import { LoggerBrowser } from "../../logger/browser";
import { default as RestrictionManager } from "./restrictionManager";
import { Result } from "../result";
import { AjaxError } from "./ajaxError";
import { AjaxResult } from "./ajaxResult";

import type {
	AjaxQuery,
	AjaxResultParams
} from "./ajaxResult";

import type {
	AuthActions,
	AuthData,
	AuthError,
	BatchPayload,
} from "../../types";


import axios, { type AxiosInstance, AxiosError } from 'axios';
import qs from 'qs';

type AjaxResponse = {
	status: number,
	payload: AjaxResultParams
}

/**
 * Class for working with RestApi requests via http
 *
 * @link https://dev.1c-bitrix.ru/rest_help/
 */
export default class Http
{
	#clientAxios: AxiosInstance;
	#authActions: AuthActions;
	#restrictionManager: RestrictionManager;
	private logger: LoggerBrowser;
	
	constructor(
		baseURL: string,
		authActions: AuthActions,
		options?: null|{}
	)
	{
		this.logger = LoggerBrowser.build('b24frame:http');
		
		this.#clientAxios = axios.create({
			baseURL: baseURL,
			headers: {},
			...options ?? {}
		});
		
		this.#authActions = authActions;
		this.#restrictionManager = new RestrictionManager();
	}
	
	isString(item: any): boolean
	{
		return item === ''
			? true
			: (item
				? (
					typeof (item) == "string"
					|| item instanceof String
				)
				: false
			);
	}
	
	async batch(
		calls: any[]|object,
		isHaltOnError: boolean = true
	): Promise<Result>
	{
		const isArrayMode = Array.isArray(calls);
		let cmd: any = isArrayMode ? [] : {};
		let cnt = 0;
		
		const processRow = (row: any, index: string|number) => {
			let method = null;
			let params = null;
			
			if(Array.isArray(row))
			{
				method = row[0];
				params = row[1];
			}
			else if(!!row.method)
			{
				method = row.method;
				params = row.params;
			}
			
			if(!!method)
			{
				cnt++;
				
				let data = method + '?' + qs.stringify(params);
				if(isArrayMode || Array.isArray(cmd))
				{
					cmd.push(data);
				}
				else
				{
					cmd[index] = data;
				}
			}
		};
		
		if(isArrayMode)
		{
			calls.forEach((item, index) => processRow(item, index));
		}
		else
		{
			Object.entries(calls).forEach(([index, item]) => processRow(item, index));
		}
		
		if(cnt < 1)
		{
			return Promise.resolve(new Result());
		}
		
		return this.call(
			'batch',
			{
				halt: isHaltOnError ? 1 : 0,
				cmd: cmd
			}
		)
		.then((response: AjaxResult) => {
			
			const responseResult = (response.getData() as BatchPayload<unknown>).result;
			const results: any = isArrayMode ? [] : {};
			
			const processResponse = (row: string, index: string|number) => {
				
				if(
					// @ts-ignore
					typeof responseResult.result[index] !== 'undefined'
					// @ts-ignore
					|| typeof responseResult.result_error[index] !== 'undefined'
				)
				{
					let q = row.split('?');
					
					let data = new AjaxResult(
						{
							// @ts-ignore
							result: typeof responseResult.result[index] !== 'undefined'
								// @ts-ignore
								? responseResult.result[index]
								: {},
							// @ts-ignore
							error: responseResult?.result_error[index] || undefined,
							// @ts-ignore
							total: responseResult.result_total[index],
							// @ts-ignore
							next: responseResult.result_next[index]
						},
						{
							method: q[0] || '',
							params: qs.parse(q[1] || ''),
							start: 0
						} as AjaxQuery,
						response.getStatus(),
					);
					
					if(isArrayMode || Array.isArray(results))
					{
						results.push(data);
					}
					else
					{
						results[index] = data;
					}
				}
			};
		
			if(Array.isArray(cmd))
			{
				cmd.forEach((item, index) => processResponse(item, index));
			}
			else
			{
				Object.entries(cmd).forEach(([index, item]) => processResponse(
					item as string,
					index
				));
			}
			
			let dataResult;
			
			const initError = (result: AjaxResult): AjaxError => {
				return new AjaxError({
						status: 0,
						answerError: {
							error: result.getErrorMessages().join('; '),
							errorDescription: `batch ${result.getQuery().method}: ${qs.stringify(result.getQuery().params, {encode: false})}`,
						},
						cause: result.getErrors().next().value
					}
				);
			};

			const result = new Result();
			
			if(isArrayMode || Array.isArray(results))
			{
				dataResult = [];

				for(let data of (results as AjaxResult[]))
				{
					if (data.getStatus() !== 200 || !data.isSuccess)
					{
						const error = initError(data);
						
						if (!isHaltOnError && !data.isSuccess)
						{
							result.addError(error)
							continue;
						}
						
						return Promise.reject(error);
					}
					
					dataResult.push(data.getData().result);
				}
			}
			else
			{
				dataResult = {};

				for(let key of Object.keys(results))
				{
					let data: AjaxResult = results[key];

					if (data.getStatus() !== 200 || !data.isSuccess)
					{
						const error = initError(data);
						
						if (!isHaltOnError && !data.isSuccess)
						{
							result.addError(error)
							continue;
						}

						return Promise.reject(error);
					}

					// @ts-ignore
					dataResult[key] = data.getData().result;
				}
			}
			
			result.setData(dataResult);
			
			return Promise.resolve(result);
		});
	}
	
	/**
	 * Calling the RestApi function
	 *
	 * If we get a problem with authorization, we make 1 attempt to update the access token
	 *
	 * @param method
	 * @param params
	 * @param start
	 */
	async call(
		method: string,
		params: {},
		start: number = 0
	): Promise<AjaxResult>
	{
		let authData = this.#authActions.getAuthData();
		if(authData === false)
		{
			authData = await this.#authActions.refreshAuth();
		}
		
		await this.#restrictionManager.check();
		
		return this.#clientAxios.post(
			this.#prepareMethod(method),
			this.#prepareParams(authData, params, start),
		)
		.then(
			(response: { data: AjaxResultParams; status: any; }): Promise<AjaxResponse> => {
				const payload = response.data as AjaxResultParams;
				return Promise.resolve({
					status: response.status,
					payload: payload
				} as AjaxResponse);
			},
			async (problem: AxiosError) =>
			{
				/**
				 * Is response status === 401 -> refresh Auth
				 */
				if(
					problem instanceof AxiosError
					&& problem.response
					&& problem.response.status === 401
				)
				{
					let response;
					response = (problem.response.data as AuthError);
					
					if(
						[
							'expired_token',
							'invalid_token'
						].includes(response.error)
					)
					{
						this.logger.info(`refreshAuth >> ${response.error} >>>`);
						
						authData = await this.#authActions.refreshAuth();
						await this.#restrictionManager.check();
						
						return this.#clientAxios.post(
							this.#prepareMethod(method),
							this.#prepareParams(authData, params, start),
						)
						.then(async(response: { data: AjaxResultParams; status: any; }): Promise<AjaxResponse> =>
						{
							const payload = response.data as AjaxResultParams;
							return Promise.resolve({
								status: response.status,
								payload: payload
							} as AjaxResponse);
						});
					}
				}
				return Promise.reject(problem);
			}

		)
		.then((response: AjaxResponse): Promise<AjaxResult> => {
			const result = new AjaxResult(
				response.payload,
				{
					method,
					params,
					start
				} as AjaxQuery,
				response.status,
			);
			
			return Promise.resolve(result);
		});
	}
	
	/**
	 * Processes function parameters and adds authorization
	 *
	 * @param authData
	 * @param params
	 * @param start
	 *
	 * @private
	 */
	#prepareParams(
		authData: AuthData,
		params: any,
		start: number = 0
	): object
	{
		let result = Object.assign({}, params);
		
		if(!!result.data)
		{
			if(!!result.data.start)
			{
				delete result.data.start;
			}
		}
		
		/**
		 * @memo we skip auth for hook
		 */
		if(authData.refresh_token !== 'hook')
		{
			result.auth = authData.access_token;
		}
		
		result.start = start;
		
		return result;
	}
	
	/**
	 * Makes the function name safe and adds json format
	 *
	 * @param method
	 * @private
	 */
	#prepareMethod(method: string): string
	{
		return `${encodeURIComponent(method)}.json`;
	}
}