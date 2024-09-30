export interface IResult
{
	isSuccess: boolean,
	setData: (data: any) => IResult,
	getData: () => any,
	addError: (error: Error|string) => IResult,
	getErrors: () => IterableIterator<Error>,
	getErrorMessages: () => string[],
}

/**
 * To work with the result
 * Similar to \Bitrix\Main\Result
 * @link https://dev.1c-bitrix.ru/api_d7/bitrix/main/result/index.php
 */
export class Result
	implements IResult
{
	private _errorCollection: Set<Error>;
	protected _data: any;
	
	constructor()
	{
		this._errorCollection = new Set();
		this._data = null;
	}
	
	get isSuccess(): boolean
	{
		return this._errorCollection.size < 1;
	}
	
	setData(data: any): Result
	{
		this._data = data;
		
		return this;
	}
	
	getData(): any
	{
		return this._data;
	}
	
	addError(error: Error|string): Result
	{
		if(error instanceof Error)
		{
			this._errorCollection.add(error);
		}
		else
		{
			this._errorCollection.add(new Error(error.toString()));
		}
		
		return this;
	}
	
	getErrors(): IterableIterator<Error>
	{
		return this._errorCollection.values();
	}
	
	getErrorMessages(): string[]
	{
		return Array.from(this.getErrors())
			.map((error: Error) => error.message);
	}
}