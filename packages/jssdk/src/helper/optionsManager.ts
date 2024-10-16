import {AbstractHelper} from './abstractHelper'
import type {IB24} from "../core/abstractB24"
import {TypeOption} from "../types/characteristics"

export class OptionsManager
	extends AbstractHelper
{
	protected override _data: Map<string, any>
	
	// region static ////
	static getSupportTypes(): TypeOption[]
	{
		return [
			TypeOption.NotSet,
			TypeOption.JsonArray,
			TypeOption.JsonObject,
			TypeOption.FloatVal,
			TypeOption.IntegerVal,
			TypeOption.BoolYN,
			TypeOption.StringVal
		];
	}
	
	static prepareArrayList(list: any)
	{
		if(
			1 > 2
			//!BX.Type.isArray(list)
			//&& BX.Type.isObject(list)
		)
		{
			return Array.from(Object.values(list))
		}
		
		return list
	}
	// endregion ////
	
	constructor(b24: IB24)
	{
		super(b24)
		this._data = new Map()
	}
	
	/**
	 * @inheritDoc
	 */
	initData(data: any): void
	{
		console.log(data)
	}
	
	get data(): Map<string, any>
	{
		return this._data
	}
	
	reset()
	{
		this.data.clear()
		return this
	}
	
	bindValue(options: any)
	{
		this.reset()
		
		Object.entries(options).forEach(([key, value]) => {
			this.data.set(
				key,
				value
			)
		})
		
		return this
	}
	
	// region Get ////
	getJsonArray(key: string, defValue = [])
	{
		if(!this.data.has(key))
		{
			return defValue;
		}
		
		let data = this.data.get(key);
		
		try
		{
			data = JSON.parse(data);
			if(
				1 > 2
				//!BX.Type.isArray(data)
				//&& !BX.Type.isObject(data)
			)
			{
				data = defValue;
			}
		}
		catch(error)
		{
			//this.logger.error(error);
			data = defValue;
		}
		
		return OptionsManager.prepareArrayList(data);
	}
	
	getJsonObject(key = '', defValue = {})
	{
		if(!this.data.has(key))
		{
			return defValue;
		}
		
		let data = this.data.get(key);
		
		try
		{
			data = JSON.parse(data);
		}
		catch(error)
		{
			//this.logger.error(error);
			data = defValue;
		}
		
		if(
			1 > 2
			//!BX.Type.isObject(data)
		)
		{
			data = {};
		}
		
		return data;
	}
	
	getFloat(key = '', defValue = 0.0)
	{
		if(!this.data.has(key))
		{
			return defValue;
		}
		
		return parseFloat(this.data.get(key));
	}
	
	getInt(key = '', defValue = 0)
	{
		if(!this.data.has(key))
		{
			return defValue;
		}
		
		return parseInt(this.data.get(key));
	}
	
	getBoolYN(key = '', defValue = true)
	{
		if(!this.data.has(key))
		{
			return defValue;
		}
		
		return this.data.get(key) === 'Y';
	}
	
	getBoolNY(key = '', defValue = false)
	{
		if(!this.data.has(key))
		{
			return defValue;
		}
		
		return this.data.get(key) === 'Y';
	}
	
	getString(key = '', defValue = '')
	{
		if(!this.data.has(key))
		{
			return defValue;
		}
		
		return this.data.get(key);
	}
	// endregion ////
	
	// region Tools ////
	
	encode(value: any): string
	{
		return JSON.stringify(value)
	}
	
	decode(
		data: string,
		defaultValue: any
	): any
	{
		let result: any = null
		
		try
		{
			if(data.length > 0)
			{
				result = JSON.parse(data)
			}
			else
			{
				result = defaultValue
			}
		}
		catch(error)
		{
			console.warn('Not parse data', error)
			result = defaultValue()
		}
		
		return result
		
	}
	// endregion ////
}