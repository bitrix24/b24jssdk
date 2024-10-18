import { AbstractHelper } from './abstractHelper'
import type { TypeLicense } from '../types/characteristics'
import { RestrictionManagerParamsForEnterprise } from '../types/http'

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
		
		this.makeRestrictionManagerParams()
	}
	
	get data(): TypeLicense
	{
		if(null === this._data)
		{
			throw new Error('LicenseManager.data not initialized')
		}
		
		return this._data
	}
	
	/**
	 * Set RestrictionManager params by license
	 * @link https://apidocs.bitrix24.com/api-reference/common/system/app-info.html
	 */
	makeRestrictionManagerParams(): void
	{
		if(!this.data?.license)
		{
			return
		}
		
		if(this.data.license.includes('ent'))
		{
			this.getLogger().log(
				`LICENSE ${this.data.license} => up restriction manager params`, RestrictionManagerParamsForEnterprise
			)
			
			this._b24.getHttpClient().setRestrictionManagerParams(
				RestrictionManagerParamsForEnterprise
			)
		}
	}
}