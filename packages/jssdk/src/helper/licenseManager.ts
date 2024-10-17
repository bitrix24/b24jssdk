import { AbstractHelper } from './abstractHelper'
import type { TypeLicense } from '../types/characteristics'

export class LicenseManager
	extends AbstractHelper
{
	protected override _data: null|TypeLicense = null
	
	/**
	 * @inheritDoc
	 */
	override async initData(data: TypeLicense): Promise<void>
	{
		this._data = data
	}
	
	get data(): TypeLicense
	{
		if(null === this._data)
		{
			throw new Error('LicenseManager.data not initialized')
		}
		
		return this._data
	}
}