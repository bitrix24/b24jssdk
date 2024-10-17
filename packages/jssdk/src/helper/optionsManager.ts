import {AbstractHelper} from './abstractHelper'
import type {IB24} from '../core/abstractB24'
import {TypeOption} from '../types/characteristics'
import Type from "../tools/type"

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
		]
	}
	
	static prepareArrayList(list: any): any[]
	{
		if(Type.isArray(list))
		{
			return list
		}
		
		if(Type.isObject(list))
		{
			return Array.from(Object.values(list))
		}
		
		return []
	}
	// endregion ////
	
	constructor(b24: IB24)
	{
		super(b24)
		
		this._data = new Map()
	}
	
	get data(): Map<string, any>
	{
		return this._data
	}
	
	reset()
	{
		this.data.clear()
	}
	
	/**
	 * @inheritDoc
	 */
	override async initData(data: any): Promise<void>
	{
		this.reset()
		
		if(Type.isObject(data))
		{
			Object.entries(data).forEach(([key, value]) => {
				this.data.set(
					key,
					value
				)
			})
		}
	}
	
	// region Get ////
	getJsonArray(key: string, defValue: any[] = []): any[]
	{
		if(!this.data.has(key))
		{
			return defValue
		}
		
		let data = this.data.get(key)
		
		try
		{
			data = JSON.parse(data)
			
			if(
				!Type.isArray(data)
				&& !Type.isObject(data)
			)
			{
				data = defValue
			}
		}
		catch(error)
		{
			this.getLogger().error(error)
			data = defValue
		}
		
		return OptionsManager.prepareArrayList(data)
	}
	
	getJsonObject(key: string, defValue: Object = {}): Object
	{
		if(!this.data.has(key))
		{
			return defValue
		}
		
		let data = this.data.get(key)
		
		try
		{
			data = JSON.parse(data)
		}
		catch(error)
		{
			this.getLogger().error(error)
			data = defValue
		}
		
		if(!Type.isObject(data))
		{
			data = defValue
		}
		
		return data
	}
	
	getFloat(key: string, defValue: number = 0.0): number
	{
		if(!this.data.has(key))
		{
			return defValue
		}
		
		return parseFloat(this.data.get(key))
	}
	
	getInt(key: string, defValue: number = 0): number
	{
		if(!this.data.has(key))
		{
			return defValue
		}
		
		return parseInt(this.data.get(key))
	}
	
	getBoolYN(key: string, defValue: boolean = true): boolean
	{
		if(!this.data.has(key))
		{
			return defValue
		}
		
		return this.data.get(key) === 'Y'
	}
	
	getBoolNY(key: string, defValue: boolean = false): boolean
	{
		if(!this.data.has(key))
		{
			return defValue
		}
		
		return this.data.get(key) === 'Y'
	}
	
	getString(key: string, defValue: string = ''): string
	{
		if(!this.data.has(key))
		{
			return defValue
		}
		
		return this.data.get(key).toString()
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
		try
		{
			if(data.length > 0)
			{
				return JSON.parse(data)
			}
			
			return defaultValue
		}
		catch(error)
		{
			this.getLogger().warn(error, data)
		}
		
		return defaultValue
	}
	// endregion ////
}