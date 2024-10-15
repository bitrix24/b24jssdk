import { AbstractHelper } from './abstractHelper'
import type { TypeUser } from '../types/characteristics'

export class ProfileManager
	extends AbstractHelper
{
	protected override _data: null|TypeUser = null
	
	/**
	 * @inheritDoc
	 */
	initData(data: TypeUser): void
	{
		this._data = data
	}
	
	get data(): TypeUser
	{
		if(null === this._data)
		{
			throw new Error('ProfileManager.data not initialized')
		}
		
		return this._data
	}
}