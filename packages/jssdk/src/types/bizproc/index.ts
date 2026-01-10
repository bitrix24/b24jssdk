/**
 * Data Types and Object Structure in the REST API bizproc
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-activity/bizproc-activity-add.html
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-robot/bizproc-robot-add.html
 * @todo add docs
 */
import { EnumCrmEntityTypeId } from '../crm'

/**
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-activity/bizproc-activity-add.html
 */
export enum EnumBitrix24Edition {
  undefined = 'undefined',
  b24 = 'b24',
  box = 'box'
}

export enum EnumBizprocBaseType {
  undefined = 'undefined',
  crm = 'crm',
  disk = 'disk',
  lists = 'lists'
}

/**
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-workflow-start.html
 */
export enum EnumBizprocDocumentType {
  undefined = 'undefined',
  lead = 'CCrmDocumentLead',
  company = 'CCrmDocumentCompany',
  contact = 'CCrmDocumentContact',
  deal = 'CCrmDocumentDeal',
  invoice = 'Bitrix\\Crm\\Integration\\BizProc\\Document\\SmartInvoice',
  quote = 'Bitrix\\Crm\\Integration\\BizProc\\Document\\Quote',
  order = 'Bitrix\\Crm\\Integration\\BizProc\\Document\\Order',
  dynamic = 'Bitrix\\Crm\\Integration\\BizProc\\Document\\Dynamic',
  disk = 'Bitrix\\Disk\\BizProcDocument',
  lists = 'BizprocDocument',
  listsList = 'Bitrix\\Lists\\BizprocDocumentLists'
}

export function convertBizprocDocumentTypeToCrmEntityTypeId(
  documentType: EnumBizprocDocumentType
): EnumCrmEntityTypeId {
  switch (documentType) {
    case EnumBizprocDocumentType.lead:
      return EnumCrmEntityTypeId.lead
    case EnumBizprocDocumentType.company:
      return EnumCrmEntityTypeId.company
    case EnumBizprocDocumentType.contact:
      return EnumCrmEntityTypeId.contact
    case EnumBizprocDocumentType.deal:
      return EnumCrmEntityTypeId.deal
    case EnumBizprocDocumentType.invoice:
      return EnumCrmEntityTypeId.invoice
    case EnumBizprocDocumentType.quote:
      return EnumCrmEntityTypeId.quote
    case EnumBizprocDocumentType.order:
      return EnumCrmEntityTypeId.order
  }

  return EnumCrmEntityTypeId.undefined
}

/**
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-activity/bizproc-activity-add.html
 */
export function getDocumentType(
  documentType: EnumBizprocDocumentType,
  entityId?: number
): string[] {
  let entityIdFormatted = ''
  let base: EnumBizprocBaseType = EnumBizprocBaseType.undefined
  switch (documentType) {
    case EnumBizprocDocumentType.lead:
      base = EnumBizprocBaseType.crm
      entityIdFormatted = 'LEAD'
      break
    case EnumBizprocDocumentType.company:
      base = EnumBizprocBaseType.crm
      entityIdFormatted = 'COMPANY'
      break
    case EnumBizprocDocumentType.contact:
      base = EnumBizprocBaseType.crm
      entityIdFormatted = 'CONTACT'
      break
    case EnumBizprocDocumentType.deal:
      base = EnumBizprocBaseType.crm
      entityIdFormatted = 'DEAL'
      break
    case EnumBizprocDocumentType.invoice:
      base = EnumBizprocBaseType.crm
      entityIdFormatted = 'SMART_INVOICE'
      break
    case EnumBizprocDocumentType.quote:
      base = EnumBizprocBaseType.crm
      entityIdFormatted = 'QUOTE'
      break
    case EnumBizprocDocumentType.order:
      base = EnumBizprocBaseType.crm
      entityIdFormatted = 'ORDER'
      break
    case EnumBizprocDocumentType.dynamic:
      base = EnumBizprocBaseType.crm
      entityIdFormatted = `DYNAMIC_${entityId || 0}`
      if ((entityId || 0) < 1) {
        throw new Error('Need set entityId')
      }
      break
    case EnumBizprocDocumentType.disk:
      base = EnumBizprocBaseType.disk
      entityIdFormatted = `STORAGE_${entityId || 0}`
      if ((entityId || 0) < 1) {
        throw new Error('Need set entityId')
      }
      break
    case EnumBizprocDocumentType.lists:
      base = EnumBizprocBaseType.lists
      entityIdFormatted = `iblock_${entityId || 0}`
      if ((entityId || 0) < 1) {
        throw new Error('Need set entityId')
      }
      break
    case EnumBizprocDocumentType.listsList:
      base = EnumBizprocBaseType.lists
      entityIdFormatted = `iblock_${entityId || 0}`
      if ((entityId || 0) < 1) {
        throw new Error('Need set entityId')
      }
      break
  }

  return [
    base,
    documentType,
    entityIdFormatted
  ]
}

/**
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-workflow-start.html
 */
export function getDocumentId(
  documentType: EnumBizprocDocumentType,
  id: number,
  dynamicId?: number
): string[] {
  let entityIdFormatted = ''
  const tmp = getDocumentType(documentType, 1)
  switch (documentType) {
    case EnumBizprocDocumentType.lead:
      entityIdFormatted = `LEAD_${id}`
      break
    case EnumBizprocDocumentType.company:
      entityIdFormatted = `COMPANY_${id}`
      break
    case EnumBizprocDocumentType.contact:
      entityIdFormatted = `CONTACT_${id}`
      break
    case EnumBizprocDocumentType.deal:
      entityIdFormatted = `DEAL_${id}`
      break
    case EnumBizprocDocumentType.invoice:
      entityIdFormatted = `SMART_INVOICE_${id}`
      break
    case EnumBizprocDocumentType.quote:
      entityIdFormatted = `QUOTE_${id}`
      break
    case EnumBizprocDocumentType.order:
      entityIdFormatted = `ORDER_${id}`
      break
    case EnumBizprocDocumentType.dynamic:
      entityIdFormatted = `DYNAMIC_${dynamicId || 0}_${id}`
      if ((dynamicId || 0) < 1) {
        throw new Error('Need set dynamicId')
      }
      break
    case EnumBizprocDocumentType.disk:
      entityIdFormatted = `${id}`
      break
    case EnumBizprocDocumentType.lists:
      entityIdFormatted = `${id}`
      break
    case EnumBizprocDocumentType.listsList:
      entityIdFormatted = `${id}`
      break
  }

  return [
    tmp[0],
    tmp[1],
    entityIdFormatted
  ]
}

/**
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-workflow-start.html
 */
export function getDocumentTypeForFilter(
  documentType: EnumBizprocDocumentType
): string[] {
  const result = getDocumentType(documentType, 1)

  return [
    result[0],
    result[1]
  ]
}
