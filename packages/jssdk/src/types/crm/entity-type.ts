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
  order = 'ORDER'
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
  order = 14
}

export enum EnumCrmEntityTypeShort {
  undefined = '?',
  lead = 'L',
  deal = 'D',
  contact = 'C',
  company = 'CO',
  oldInvoice = 'I',
  invoice = 'SI',
  quote = 'Q',
  requisite = 'RQ',
  order = 'O'
}

/**
 * @todo add docs
 */
export function getEnumCrmEntityTypeShort(id: EnumCrmEntityTypeId): EnumCrmEntityTypeShort {
  const key = EnumCrmEntityTypeId[id] as keyof typeof EnumCrmEntityTypeShort
  return EnumCrmEntityTypeShort[key] || EnumCrmEntityTypeShort.undefined
}
