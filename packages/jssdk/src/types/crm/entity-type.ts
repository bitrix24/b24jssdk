/**
 * CRM Entity Types
 * @link https://dev.1c-bitrix.ru/rest_help/crm/constants.php
 */
export enum EnumCrmEntityType {
	undefined = 'UNDEFINED',
	lead = 'CRM_LEAD',
	deal = 'CRM_DEAL',
	contact = 'CRM_CONTACT',
	company = 'CRM_COMPANY',
	oldInvoice = 'CRM_INVOICE',
	invoice = 'CRM_SMART_INVOICE',
	quote = 'CRM_QUOTE',
	requisite = 'CRM_REQUISITE',
}

export enum EnumCrmEntityTypeId {
	undefined = 0,
	lead = 1,
	deal = 2,
	contact = 3,
	company = 4,
	oldInvoice = 5,
	invoice = 31,
	quote = 7,
	requisite = 8,
}
