import { AbstractHelper } from './abstractHelper'
import { StatusDescriptions, type TypeApp } from '../types/characteristics'

export class AppManager
	extends AbstractHelper
{
	protected override _data: null|TypeApp = null
	
	/**
	 * @inheritDoc
	 */
	initData(data: TypeApp): void
	{
		this._data = data
	}
	
	get data(): TypeApp
	{
		if(null === this._data)
		{
			throw new Error('AppManager.data not initialized')
		}
		
		return this._data
	}
	
	get statusCode(): string
	{
		return StatusDescriptions[this.data.status as keyof typeof StatusDescriptions] || 'Unknown status'
	}
}