import type { BoolString, GenderString, ISODate, NumberString } from './common'

/**
 * User fields for scope:user_brief
 * @link https://dev.1c-bitrix.ru/rest_help/users/index.php
 */
export type UserBrief = {
	readonly [key: string]: string | boolean | null | readonly number[]
	readonly ID: NumberString
	readonly XML_ID: string | null
	readonly ACTIVE: boolean
	readonly NAME: string | null
	readonly LAST_NAME: string | null
	readonly SECOND_NAME: string | null
	readonly TITLE: string | null
	readonly IS_ONLINE: BoolString
	readonly TIME_ZONE: string | null
	readonly TIME_ZONE_OFFSET: NumberString | null
	readonly TIMESTAMP_X: string
	readonly DATE_REGISTER: ISODate

	readonly PERSONAL_PROFESSION: string | null
	readonly PERSONAL_GENDER: GenderString
	readonly PERSONAL_BIRTHDAY: string | null
	readonly PERSONAL_PHOTO: string | null
	readonly PERSONAL_CITY: string | null
	readonly PERSONAL_STATE: string | null
	readonly PERSONAL_COUNTRY: string | null

	readonly WORK_POSITION: string | null
	readonly WORK_CITY: string | null
	readonly WORK_STATE: string | null
	readonly WORK_COUNTRY: string | null

	readonly LAST_ACTIVITY_DATE: string
	readonly UF_EMPLOYMENT_DATE: ISODate | string
	readonly UF_TIMEMAN: string | null
	readonly UF_SKILLS: string | null
	readonly UF_INTERESTS: string | null
	readonly UF_DEPARTMENT: readonly number[]

	readonly UF_PHONE_INNER: NumberString | null
}

/**
 * User fields for scope:user_basic
 */
export type UserBasic = UserBrief & {
	readonly EMAIL: string | null
	readonly PERSONAL_WWW: string | null
	readonly PERSONAL_ICQ: string | null
	readonly PERSONAL_PHONE: string | null
	readonly PERSONAL_FAX: string | null
	readonly PERSONAL_MOBILE: string | null
	readonly PERSONAL_PAGER: string | null
	readonly PERSONAL_STREET: string | null

	readonly PERSONAL_ZIP: string | null

	readonly WORK_COMPANY: string | null

	readonly WORK_PHONE: string | null
	readonly UF_SKILLS: string | null
	readonly UF_WEB_SITES: string | null
	readonly UF_XING: string | null
	readonly UF_LINKEDIN: string | null
	readonly UF_FACEBOOK: string | null
	readonly UF_TWITTER: string | null
	readonly UF_SKYPE: string | null
	readonly UF_DISTRICT: string | null
	readonly USER_TYPE: 'employee'
}
