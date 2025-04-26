import type { BoolString, ISODate } from '../common'

export interface CrmItemDelivery {
  id: number
  accountNumber: string
  deducted: BoolString
  dateDeducted?: ISODate
  deliveryId: number
  deliveryName: string
  priceDelivery: number
}
