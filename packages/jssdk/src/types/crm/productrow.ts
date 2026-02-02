import type { BoolString } from '../common'
import type { EnumCrmEntityTypeShort } from './entity-type'
import type { CatalogProductType } from '../catalog'

export enum ProductRowDiscountTypeId {
  undefined = 0,
  absolute = 1,
  percentage = 2
}

export interface CrmItemProductRow {
  id: number
  ownerId: number
  ownerType: typeof EnumCrmEntityTypeShort[keyof typeof EnumCrmEntityTypeShort]
  productId: number
  productName: string
  sort: number
  price: number
  priceAccount: number
  priceExclusive: number
  priceNetto: number
  priceBrutto: number
  customized: BoolString
  quantity: number
  measureCode: string
  measureName: string
  taxRate: number | null
  taxIncluded: BoolString
  discountRate: number
  discountSum: number
  discountTypeId: typeof ProductRowDiscountTypeId[keyof typeof ProductRowDiscountTypeId]
  xmlId: string
  type: typeof CatalogProductType[keyof typeof CatalogProductType]
  storeId: number
}
