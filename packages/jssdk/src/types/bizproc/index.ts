/**
 * Data Types and Object Structure in the REST API bizproc
 * @todo add docs
 */
import { EnumCrmEntityTypeId } from '../crm'

export enum EnumBizprocDocumentType {
  undefined = 'undefined',
  lead = 'CCrmDocumentLead',
  deal = 'CCrmDocumentDeal',
  contact = 'CCrmDocumentContact',
  company = 'CCrmDocumentCompany',
  /**
   * @todo test this
   */
  oldInvoice = 'CCrmDocumentSmartInvoice',
  quote = 'CCrmDocumentSmartQuote',
  order = 'CCrmDocumentSmartOrder'
}

/**
 * @todo test this
 */
export function convertBizprocDocumentTypeToCrmEntityTypeId(documentType: EnumBizprocDocumentType): EnumCrmEntityTypeId {
  switch (documentType) {
    case EnumBizprocDocumentType.lead:
      return EnumCrmEntityTypeId.lead
    case EnumBizprocDocumentType.deal:
      return EnumCrmEntityTypeId.deal
    case EnumBizprocDocumentType.contact:
      return EnumCrmEntityTypeId.contact
    case EnumBizprocDocumentType.company:
      return EnumCrmEntityTypeId.company
    case EnumBizprocDocumentType.oldInvoice:
      return EnumCrmEntityTypeId.oldInvoice
    case EnumBizprocDocumentType.quote:
      return EnumCrmEntityTypeId.quote
    case EnumBizprocDocumentType.order:
      return EnumCrmEntityTypeId.order
  }

  return EnumCrmEntityTypeId.undefined
}
