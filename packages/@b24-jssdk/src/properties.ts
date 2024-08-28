import { AppFrame } from './frame';
import type {
	TypeApp,
	TypeB24Form,
	TypeEnumAppStatus,
	TypeLicense, TypePayment,
	TypeUser
} from "./types/properties";
import {B24Frame} from "./controller";
import type {GenderString} from "./types/common";

/**
 * Characteristics of B24 and the current user
 * @link https://dev.1c-bitrix.ru/rest_help/general/app_info.php
 */
export class PropertiesManager
{
	#appFrame: AppFrame;
	
	#isInit: boolean;
	
	#user: null|TypeUser = null;
	#app: null|TypeApp = null;
	#payment: null|TypePayment = null;
	#license: null|TypeLicense = null;
	
	constructor(
		appFrame: AppFrame
	)
	{
		this.#appFrame = appFrame;
		this.#isInit = false;
	}
	
	async loadData(b24: B24Frame): Promise<void>
	{
		return b24.callBatch({
			GetAppInfo: {method: 'app.info'},
			GetProfile: {method: 'profile'},
		})
		.then((response) => {
			
			let data = response.getData();
			
			this.#user = {
				isAdmin: data.GetProfile.ADMIN === true,
				
				lastName: data.GetProfile?.LAST_NAME || '',
				name: data.GetProfile?.NAME || '',
				
				gender: (data.GetProfile?.PERSONAL_GENDER || '') as GenderString,
				
				photo: data.GetProfile?.PERSONAL_PHOTO || '',
				
				TimeZone: data.GetProfile?.TIME_ZONE || '',
				TimeZoneOffset: data.GetProfile?.TIME_ZONE_OFFSET,
			} as TypeUser;
			
			this.#app = {
				id: parseInt(data.GetAppInfo.ID),
				code: data.GetAppInfo.CODE,
				version: parseInt(data.GetAppInfo.VERSION),
				status: data.GetAppInfo.STATUS as TypeEnumAppStatus,
				isInstalled: data.GetAppInfo.INSTALLED as boolean,
				isPaymentExpired: data.GetAppInfo.PAYMENT_EXPIRED === 'Y',
				paymentDays: parseInt(data.GetAppInfo.DAYS),
			} as TypeApp;
			
			this.#payment = {
				isExpired: data.GetAppInfo.PAYMENT_EXPIRED === 'Y',
				days: parseInt(data.GetAppInfo.DAYS || '0'),
			} as TypePayment;
			
			this.#license = {
				languageId: data.GetAppInfo.LANGUAGE_ID,
				license: data.GetAppInfo.LICENSE,
				licensePrevious: data.GetAppInfo.LICENSE_PREVIOUS,
				licenseType: data.GetAppInfo.LICENSE_TYPE,
				licenseFamily: data.GetAppInfo.LICENSE_FAMILY,
				isSelfHosted: data.GetAppInfo.LICENSE.includes('selfhosted')
			} as TypeLicense;
			
			this.#isInit = true;
			
			return Promise.resolve();
		});
	}
	
	/**
	 * Returns properties for B24.form
	 */
	get forB24Form(): TypeB24Form
	{
		if(
			!this.#isInit
		)
		{
			throw new Error('PropertiesManager not init');
		}
		
		return {
			app_code: this.#app?.code,
			app_status: this.#app?.status as string,
			payment_expired: this.#payment?.isExpired ? 'Y' : 'N',
			days: this.#payment?.days,
			b24_plan: this.#license?.license,
			c_name: this.#user?.name,
			c_last_name: this.#user?.lastName,
			hostname: this.hostName
		} as TypeB24Form;
	}
	
	get userInfo(): TypeUser
	{
		if(!this.#isInit)
		{
			throw new Error('PropertiesManager not init');
		}
		return this.#user as TypeUser;
	}
	
	get hostName(): string
	{
		if(!this.#isInit)
		{
			throw new Error('PropertiesManager not init');
		}
		return this.#appFrame.getTargetOrigin();
	}
	
	get appInfo(): TypeApp
	{
		if(!this.#isInit)
		{
			throw new Error('PropertiesManager not init');
		}
		return this.#app as TypeApp;
	}
	
	get paymentInfo(): TypePayment
	{
		if(!this.#isInit)
		{
			throw new Error('PropertiesManager not init');
		}
		return this.#payment as TypePayment;
	}
	
	get licenseInfo(): TypeLicense
	{
		if(!this.#isInit)
		{
			throw new Error('PropertiesManager not init');
		}
		return this.#license as TypeLicense;
	}
}