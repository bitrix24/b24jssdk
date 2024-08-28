/**
 * CRM Smart Process Entity Field Type
 * @link https://dev.1c-bitrix.ru/rest_help/crm/dynamic/methodscrmitem/crm_item_fields.php
 */
export type CrmItemField = {
	isDynamic: boolean,
	isImmutable: boolean,
	isMultiple: boolean,
	isReadOnly: boolean,
	isRequired: boolean,
	title: string
	type: string
	upperName: string
}