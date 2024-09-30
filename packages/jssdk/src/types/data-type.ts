/**
 * Data types
 * @link https://apidocs.bitrix24.ru/api-reference/data-types.html
 * @link https://dev.1c-bitrix.ru/rest_help/crm/dynamic/methodscrmitem/crm_item_fields.php
 */
export enum DataType
{
	undefined = 'undefined',
	any = 'any',
	integer = 'integer',
	boolean = 'boolean',
	double = 'double',
	date = 'date',
	datetime = 'datetime',
	string = 'string',
	text = 'text',
	file = 'file',
	array = 'array',
	object = 'object',
	user = 'user',
	location = 'location',
	crmCategory = 'crm_category',
	crmStatus = 'crm_status',
	crmCurrency = 'crm_currency',
}
