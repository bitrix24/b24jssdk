import type { BoolString, ISODate } from '../common'

export interface CrmItemPayment {
  id: number
  accountNumber: string
  paid: BoolString
  datePaid?: ISODate
  empPaidId?: number
  sum: number
  currency: string
  paySystemId: number
  paySystemName: string
}
