import { type IB24 } from '../core/abstractB24'
import { LoadDataType } from '../types/characteristics'
import type { GenderString } from '../types/common'
import type {
	TypeApp,
	TypeB24Form,
	TypeEnumAppStatus,
	TypeLicense,
	TypePayment,
	TypeUser
} from '../types/characteristics'

export class CharacteristicsManager
{
	private _b24: IB24
	private _isInit: boolean = false
	
	private _user: TypeUser|null = null
	private _app: TypeApp|null = null
	private _payment: TypePayment|null = null
	private _license: TypeLicense|null = null
	
	constructor(b24: IB24)
	{
		this._b24 = b24
	}
	
	// region loadData ////
	async loadData(
		dataTypes: string[] = [
			LoadDataType.App,
			LoadDataType.Profile
		]
	): Promise<void>
	{
		const batchMethods: Record<string, {method: string}> = {
			[LoadDataType.App]: {method: 'app.info'},
			[LoadDataType.Profile]: {method: 'profile'},
		}
		
		const batchRequest = dataTypes.reduce((acc, type) =>
		{
			if(batchMethods[type])
			{
				acc[`get_${type}`] = batchMethods[type]
			}
			
			return acc
			
		}, {} as Record<string, {method: string}>)
		
		try
		{
			const response = await this._b24.callBatch(batchRequest)
			const data = response.getData()
			
			if(data[`get_${LoadDataType.App}`])
			{
				this._app = this.parseAppData(data[`get_${LoadDataType.App}`])
				this._payment = this.parsePaymentData(data[`get_${LoadDataType.App}`])
				this._license = this.parseLicenseData(data[`get_${LoadDataType.App}`])
			}
			
			if(data[`get_${LoadDataType.Profile}`])
			{
				this._user = this.parseUserData(data[`get_${LoadDataType.Profile}`])
			}
			
			this._isInit = true
		}
		catch(error)
		{
			console.error('Error loading data:', error)
			throw new Error('Failed to load data')
		}
	}
	
	private parseUserData(profileData: any): TypeUser
	{
		return {
			id: Number(profileData.ID),
			isAdmin: profileData.ADMIN === true,
			lastName: profileData?.LAST_NAME || '',
			name: profileData?.NAME || '',
			gender: (profileData?.PERSONAL_GENDER || '') as GenderString,
			photo: profileData?.PERSONAL_PHOTO || '',
			TimeZone: profileData?.TIME_ZONE || '',
			TimeZoneOffset: profileData?.TIME_ZONE_OFFSET,
		}
	}
	
	private parseAppData(appData: any): TypeApp
	{
		return {
			id: parseInt(appData.ID),
			code: appData.CODE,
			version: parseInt(appData.VERSION),
			status: appData.STATUS as TypeEnumAppStatus,
			isInstalled: appData.INSTALLED as boolean,
		}
	}
	
	private parsePaymentData(appData: any): TypePayment
	{
		return {
			isExpired: appData.PAYMENT_EXPIRED === 'Y',
			days: parseInt(appData.DAYS || '0'),
		}
	}
	
	private parseLicenseData(appData: any): TypeLicense
	{
		return {
			languageId: appData.LANGUAGE_ID,
			license: appData.LICENSE,
			licensePrevious: appData.LICENSE_PREVIOUS,
			licenseType: appData.LICENSE_TYPE,
			licenseFamily: appData.LICENSE_FAMILY,
			isSelfHosted: appData.LICENSE.includes('selfhosted'),
		}
	}
	// endregion ////
	
	// region Get ////
	get isInit(): boolean
	{
		return this._isInit;
	}
	
	get forB24Form(): TypeB24Form
	{
		this.ensureInitialized()
		return {
			app_code: this._app?.code,
			app_status: this._app?.status as string,
			payment_expired: this._payment?.isExpired ? 'Y' : 'N',
			days: this._payment?.days,
			b24_plan: this._license?.license,
			c_name: this._user?.name,
			c_last_name: this._user?.lastName,
			hostname: this.hostName,
		} as TypeB24Form
	}
	
	get userInfo(): TypeUser
	{
		this.ensureInitialized()
		return this._user as TypeUser
	}
	
	/**
	 * Get the account address BX24 ( https://name.bitrix24.com )
	 */
	get hostName(): string
	{
		return this._b24.getTargetOrigin()
	}
	
	get appInfo(): TypeApp
	{
		this.ensureInitialized()
		return this._app as TypeApp
	}
	
	get paymentInfo(): TypePayment
	{
		this.ensureInitialized()
		return this._payment as TypePayment
	}
	
	get licenseInfo(): TypeLicense
	{
		this.ensureInitialized()
		return this._license as TypeLicense
	}
	// endregion ////
	
	// region Tools ////
	private ensureInitialized(): void
	{
		if(!this._isInit)
		{
			throw new Error('CharacteristicsManager not initialized')
		}
	}
	// endregion ////
}