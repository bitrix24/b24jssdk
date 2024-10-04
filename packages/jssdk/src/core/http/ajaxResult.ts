import { Result, type IResult } from "../result";
import { AjaxError } from "./ajaxError";
import { default as Http } from "./controller";

import type { NumberString } from "../../types/common";
import type { GetPayload, Payload } from "../../types/payloads";

export type AjaxQuery = {
	method: string,
	params: {},
	start: number
}

export type AjaxResultParams = {
	error?: string|{error: string, error_description: string};
	error_description?: string
	result: any;
	next?: NumberString,
	total?: NumberString,
}

/**
 * Result of request to Rest Api
 */
export class AjaxResult
	extends Result
	implements IResult
{
	private _status: number;
	private _query: AjaxQuery;
	protected override _data: AjaxResultParams;
	
	constructor(
		answer: AjaxResultParams,
		query: AjaxQuery,
		status: number
	)
	{
		super();
		
		this._data = answer;
		this._query = structuredClone(query);
		this._status = status;
		
		if(typeof this._data.error !== 'undefined')
		{
			let error = (
				typeof this._data.error === 'string'
				? this._data
				: this._data.error
			);
			
			this.addError(new AjaxError({
				status: this._status,
				answerError: {
					error: (error.error as string) || '',
					errorDescription: error.error_description || ''
				}
			}));
		}
	}
	
	// @ts-ignore
	override setData(data: any): Result
	{
		throw new Error('AjaxResult not support setData()');
	}
	
	override getData(): Payload<unknown>
	{
		return this._data as GetPayload<unknown>;
	}
	
	isMore():boolean
	{
		return !isNaN(this._data?.next as any);
	}
	
	getTotal(): number
	{
		return parseInt(this._data?.total as any);
	}
	
	getStatus(): number
	{
		return this._status;
	}
	
	getQuery(): AjaxQuery
	{
		return this._query;
	}
	
	async getNext(http: Http): Promise<false|AjaxResult>
	{
		if(
			this.isMore()
			&& this.isSuccess
		)
		{
			this._query.start = parseInt(this._data?.next as any);
			
			return http.call(
				this._query.method,
				this._query.params,
				this._query.start,
			);
		}
		
		return Promise.resolve(false);
	}
}