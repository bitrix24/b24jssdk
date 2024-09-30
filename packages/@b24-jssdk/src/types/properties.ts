import type {BoolString, GenderString} from "./common";

export type TypeUser = {
	readonly isAdmin: boolean;
	
	readonly lastName: null|string;
	readonly name: null|string;
	
	readonly gender: GenderString;
	
	readonly photo: null|string;
	
	readonly TimeZone: null|string;
	readonly TimeZoneOffset: null|number;
}

export const EnumAppStatus = {
	// free ////
	Free: 'F',
	
	// demo version ////
	Demo: 'D',
	
	// trial version (limited time) ////
	Trial: 'T',
	
	// paid application ////
	Paid: 'P',
	
	// local application ////
	Local: 'L',
	
	// subscription application ////
	Subscription: 'S',
} as const;

export type TypeEnumAppStatus = keyof typeof EnumAppStatus;

/**
 * @link https://dev.1c-bitrix.ru/rest_help/general/app_info.php
 */
export type TypeApp = {
	
	/**
	 * Local application identifier on the portal
	 */
	readonly id: number;
	
	/**
	 * application code
	 */
	readonly code: string;
	
	/**
	 * installed version of the application
	 */
	readonly version: number;
	
	/**
	 * application status
	 */
	readonly status: TypeEnumAppStatus;
	
	/**
	 * application installed flag
	 */
	readonly isInstalled: boolean;
}

/**
 * @link https://dev.1c-bitrix.ru/rest_help/general/app_info.php
 */
export type TypePayment = {
	/**
	 * flag indicating whether the paid period or trial period has expired
	 */
	readonly isExpired: boolean;
	
	/**
	 * number of days remaining until the end of the paid period or trial period
	 */
	readonly days: number;
}

/**
 * @link https://dev.1c-bitrix.ru/rest_help/general/app_info.php
 */
export type TypeLicense = {
	/**
	 * language code designation
	 */
	readonly languageId: null|string;
	/**
	 * tariff designation with indication of the region as a prefix
	 */
	readonly license: null|string;
	
	/**
	 * internal tariff designation without indication of region
	 */
	readonly licenseType: null|string;
	
	/**
	 * past meaning of license
	 */
	readonly licensePrevious: null|string;
	
	/**
	 * Tariff designation without specifying the region.
	 */
	readonly licenseFamily: null|string;
	
	/**
	 * flag indicating whether it is a box (true) or a cloud (false)
	 */
	readonly isSelfHosted: boolean;
	
}

export type TypeB24Form = {
	
	readonly app_code: string,
	readonly app_status: string,
	
	readonly payment_expired: BoolString,
	readonly days: number,
	/**
	 * B24 tariff plan identifier (if cloud)
	 */
	readonly b24_plan: string,
	readonly c_name: string,
	readonly c_last_name: string,
	readonly hostname: string
}