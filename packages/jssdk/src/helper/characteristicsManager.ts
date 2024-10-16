import {LoggerBrowser, LoggerType} from '../logger/browser'
import { type IB24 } from '../core/abstractB24'
import { ProfileManager } from './profileManager'
import { AppManager } from './appManager'
import { PaymentManager } from './paymentManager'
import { LicenseManager } from './licenseManager'
import { CurrencyManager } from './currencyManager'
import { OptionsManager } from './optionsManager'
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

/**
 * A universal class that is used to manage the initial application data
 */
export class CharacteristicsManager
{
	private readonly _b24: IB24
	protected _logger: null|LoggerBrowser = null
	private _isInit: boolean = false
	
	private _profile: ProfileManager|null = null
	
	private _app: AppManager|null = null
	private _payment: PaymentManager|null = null
	private _license: LicenseManager|null = null
	
	private _currency: CurrencyManager|null = null
	private _appOptions: OptionsManager|null = null
	private _userOptions: OptionsManager|null = null
	
	constructor(b24: IB24)
	{
		this._b24 = b24
	}
	
	setLogger(logger: LoggerBrowser): void
	{
		this._logger = logger
		if(null !== this._profile)
		{
			this._profile.setLogger(this.getLogger())
		}
		
		if(null !== this._app)
		{
			this._app.setLogger(this.getLogger())
		}
		
		if(null !== this._payment)
		{
			this._payment.setLogger(this.getLogger())
		}
		
		if(null !== this._license)
		{
			this._license.setLogger(this.getLogger())
		}
		
		if(null !== this._currency)
		{
			this._currency.setLogger(this.getLogger())
		}
		
		if(null !== this._appOptions)
		{
			this._appOptions.setLogger(this.getLogger())
		}
		
		if(null !== this._userOptions)
		{
			this._userOptions.setLogger(this.getLogger())
		}
	}
	
	getLogger(): LoggerBrowser
	{
		if(null === this._logger)
		{
			this._logger = LoggerBrowser.build(`NullLogger`)
			this._logger.setConfig({
				[LoggerType.desktop]: false,
				[LoggerType.log]: false,
				[LoggerType.info]: false,
				[LoggerType.warn]: false,
				[LoggerType.error]: true,
				[LoggerType.trace]: false,
			})
		}
		
		return this._logger
	}
	
	// region loadData ////
	async loadData(
		dataTypes: LoadDataType[] = [
			LoadDataType.App,
			LoadDataType.Profile
		]
	): Promise<void>
	{
		const batchMethods: Record<string, {method: string}|{method: string}[]> = {
			[LoadDataType.App]: {method: 'app.info'},
			[LoadDataType.Profile]: {method: 'profile'},
			[LoadDataType.Currency]: [{method: 'crm.currency.base.get'}, {method: 'crm.currency.list'}],
			[LoadDataType.AppOptions]: {method: 'app.option.get'},
			[LoadDataType.UserOptions]: {method: 'user.option.get'},
		}
		
		const batchRequest = dataTypes.reduce((acc, type) =>
		{
			if(batchMethods[type])
			{
				if(Array.isArray(batchMethods[type]))
				{
					batchMethods[type].forEach((row, index) => {
						acc[`get_${type}_${index}`] = row
					})
				}
				else
				{
					acc[`get_${type}`] = batchMethods[type]
				}
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
				this._profile = this.parseUserData(data[`get_${LoadDataType.Profile}`])
			}
			
			if(
				data[`get_${LoadDataType.Currency}_0`]
				&& data[`get_${LoadDataType.Currency}_1`]
			)
			{
				this._currency = this.parseCurrencyData({
					currencyBase: data[`get_${LoadDataType.Currency}_0`],
					currencyList: data[`get_${LoadDataType.Currency}_1`]
				})
			}
			
			if(data[`get_${LoadDataType.AppOptions}`])
			{
				this._appOptions = this.parseOptionsData(data[`get_${LoadDataType.AppOptions}`])
			}
			
			if(data[`get_${LoadDataType.UserOptions}`])
			{
				this._userOptions = this.parseOptionsData(data[`get_${LoadDataType.UserOptions}`])
			}
			
			this._isInit = true
		}
		catch(error)
		{
			console.error('Error loading data:', error)
			throw new Error('Failed to load data')
		}
	}
	
	private parseUserData(profileData: any): ProfileManager
	{
		const manager = new ProfileManager(this._b24)
		manager.setLogger(this.getLogger())
		manager.initData({
			id: Number(profileData.ID),
			isAdmin: profileData.ADMIN === true,
			lastName: profileData?.LAST_NAME || '',
			name: profileData?.NAME || '',
			gender: (profileData?.PERSONAL_GENDER || '') as GenderString,
			photo: profileData?.PERSONAL_PHOTO || '',
			TimeZone: profileData?.TIME_ZONE || '',
			TimeZoneOffset: profileData?.TIME_ZONE_OFFSET,
		} as TypeUser)
		return manager
	}
	
	private parseAppData(appData: any): AppManager
	{
		const manager = new AppManager(this._b24)
		manager.setLogger(this.getLogger())
		manager.initData({
			id: parseInt(appData.ID),
			code: appData.CODE,
			version: parseInt(appData.VERSION),
			status: appData.STATUS as TypeEnumAppStatus,
			isInstalled: appData.INSTALLED as boolean,
		} as TypeApp)
		return manager
	}
	
	private parsePaymentData(appData: any): PaymentManager
	{
		const manager = new PaymentManager(this._b24)
		manager.setLogger(this.getLogger())
		manager.initData({
			isExpired: appData.PAYMENT_EXPIRED === 'Y',
			days: parseInt(appData.DAYS || '0'),
		} as TypePayment)
		return manager
	}
	
	private parseLicenseData(appData: any): LicenseManager
	{
		const manager = new LicenseManager(this._b24)
		manager.setLogger(this.getLogger())
		manager.initData({
			languageId: appData.LANGUAGE_ID,
			license: appData.LICENSE,
			licensePrevious: appData.LICENSE_PREVIOUS,
			licenseType: appData.LICENSE_TYPE,
			licenseFamily: appData.LICENSE_FAMILY,
			isSelfHosted: appData.LICENSE.includes('selfhosted')
		} as TypeLicense)
		return manager
	}
	
	private parseCurrencyData(currencyData: any): CurrencyManager
	{
		const manager = new CurrencyManager(this._b24)
		manager.setLogger(this.getLogger())
		manager.initData(currencyData)
		return manager
	}
	
	private parseOptionsData(optionsData: any): OptionsManager
	{
		const manager = new OptionsManager(this._b24)
		manager.setLogger(this.getLogger())
		manager.initData(optionsData)
		return manager
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
		
		if(null === this._profile)
		{
			throw new Error('CharacteristicsManager.profileInfo not initialized')
		}
		
		if(null === this._app)
		{
			throw new Error('CharacteristicsManager.appInfo not initialized')
		}
		
		return {
			app_code: this.appInfo.data.code,
			app_status: this.appInfo.data.status as string,
			payment_expired: this.paymentInfo.data.isExpired ? 'Y' : 'N',
			days: this.paymentInfo.data.days,
			b24_plan: this.licenseInfo.data.license,
			c_name: this.profileInfo.data.name,
			c_last_name: this.profileInfo.data.lastName,
			hostname: this.hostName,
		} as TypeB24Form
	}
	
	/**
	 * Get the account address BX24 ( https://name.bitrix24.com )
	 */
	get hostName(): string
	{
		return this._b24.getTargetOrigin()
	}
	
	get profileInfo(): ProfileManager
	{
		this.ensureInitialized()
		
		if(null === this._profile)
		{
			throw new Error('CharacteristicsManager.profileInfo not initialized')
		}
		
		return this._profile
	}
	
	get appInfo(): AppManager
	{
		this.ensureInitialized()
		
		if(null === this._app)
		{
			throw new Error('CharacteristicsManager.appInfo not initialized')
		}
		
		return this._app
	}
	
	get paymentInfo(): PaymentManager
	{
		this.ensureInitialized()
		
		if(null === this._payment)
		{
			throw new Error('CharacteristicsManager.paymentInfo not initialized')
		}
		
		return this._payment
	}
	
	get licenseInfo(): LicenseManager
	{
		this.ensureInitialized()
		
		if(null === this._license)
		{
			throw new Error('CharacteristicsManager.licenseInfo not initialized')
		}
		
		return this._license
	}
	
	get currency(): CurrencyManager
	{
		this.ensureInitialized()
		
		if(null === this._currency)
		{
			throw new Error('CharacteristicsManager.currency not initialized')
		}
		
		return this._currency
	}
	
	get appOptions(): OptionsManager
	{
		this.ensureInitialized()
		
		if(null === this._appOptions)
		{
			throw new Error('CharacteristicsManager.appOptions not initialized')
		}
		
		return this._appOptions
	}
	
	get userOptions(): OptionsManager
	{
		this.ensureInitialized()
		
		if(null === this._userOptions)
		{
			throw new Error('CharacteristicsManager.userOptions not initialized')
		}
		
		return this._userOptions
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