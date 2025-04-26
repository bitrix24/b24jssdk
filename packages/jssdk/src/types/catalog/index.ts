import type { BoolString, ISODate, TextType } from '../common'

/**
 * Data Types and Object Structure in the REST API Catalog
 * @link https://apidocs.bitrix24.com/api-reference/catalog/data-types.html
 */


export enum CatalogProductType {
  undefined = 0,
  product = 1,
  service = 7,
  sku = 3,
  skuEmpty = 6,
  offer = 4,
  offerEmpty = 5
}

export enum CatalogProductImageType {
  undefined = 'UNDEFINED',
  detail = 'DETAIL_PICTURE',
  preview = 'PREVIEW_PICTURE',
  morePhoto = 'MORE_PHOTO'
}

export enum CatalogRoundingRuleType {
  undefined = 0,
  mathematical = 1,
  roundingUp = 2,
  roundingDown = 4
}

export interface CatalogCatalog {
  id: number
  iblockId: number
  iblockTypeId: string | 'CRM_PRODUCT_CATALOG'
  lid: string
  name: string
  productIblockId?: number
  skuPropertyId?: number
  subscription?: BoolString
  vatId: number
}

interface BaseProduct {
  id: number
  iblockId: number
  sort: number
  name: string
  active: BoolString
  available: BoolString
  code: string
  xmlId: string
  barcodeMulti: BoolString
  bundle: BoolString
  canBuyZero?: BoolString
  type: number
  vatId: number
  vatIncluded: BoolString
  weight?: number
  height?: number
  length?: number
  width?: number
  createdBy: number
  modifiedBy: number
  dateActiveFrom?: ISODate
  dateActiveTo?: ISODate
  dateCreate: ISODate
  timestampX: ISODate
  iblockSectionId?: number
  measure?: number
  previewText?: string
  previewTextType?: TextType
  detailText?: string
  detailTextType?: TextType
  previewPicture?: object
  detailPicture?: object
  subscribe: 'Y' | 'N' | 'D'
  quantityTrace: 'Y' | 'N' | 'D'
  purchasingCurrency: string
  purchasingPrice: number
  quantity: number
  quantityReserved: number
  [key: string]: any
}

export interface CatalogProduct extends BaseProduct {
  type: CatalogProductType.product
}

export interface CatalogProductSku extends BaseProduct {
  type: CatalogProductType.sku | CatalogProductType.skuEmpty
}

export interface CatalogProductOffer extends BaseProduct {
  type: CatalogProductType.offer | CatalogProductType.offerEmpty
}

export interface CatalogProductService extends Omit<BaseProduct, 'quantityReserved' | 'quantity' | 'purchasingPrice' | 'purchasingCurrency' | 'quantityTrace' | 'subscribe' | 'weight' | 'height' | 'length' | 'width' | 'canBuyZero' | 'barcodeMulti'> {
  type: CatalogProductType.service
}

export interface CatalogSection {
  id: number
  xmlId: string
  code: string
  iblockId: number
  sort: number
  iblockSectionId: number
  name: string
  active: BoolString
  description: string
  descriptionType: TextType
}

export interface CatalogProductImage {
  id: number
  name: string
  productId: number
  type: CatalogProductImageType
  createTime?: ISODate
  downloadUrl?: string
  detailUrl?: string
}

export interface CatalogStore {
  id: number
  code: string
  xmlId: string
  sort: number
  address: string
  title: string
  active: BoolString
  description?: string
  gpsN: number
  gpsS: number
  imageId: object
  dateModify: ISODate
  dateCreate: ISODate
  userId: number
  modifiedBy: number
  phone: string
  email: string
  schedule: string
  issuingCenter: BoolString
}

export interface CatalogMeasure {
  id: number
  code: string
  isDefault: BoolString
  measureTitle: string
  symbol: string
  symbolIntl: string
  symbolLetterIntl: string
}

export interface CatalogRatio {
  id: number
  productId: number
  ratio: number
  isDefault: BoolString
}

export interface CatalogPriceType {
  id: number
  xmlId: string
  sort: number
  name: string
  base: BoolString
  createdBy: number
  modifiedBy: number
  dateCreate: ISODate
  timestampX: ISODate
}

export interface CatalogVat {
  id: number
  name: string
  active: BoolString
  rate: number
  sort: number
  timestampX: ISODate
}

export interface CatalogPriceTypeLang {
  id: number
  catalogGroupId: number
  name: string
  lang: string
}

export interface CatalogLanguage {
  lid: string
  name: string
  active: BoolString
}

export interface CatalogRoundingRule {
  id: number
  catalogGroupId: number
  price: number
  roundType: typeof CatalogRoundingRuleType[keyof typeof CatalogRoundingRuleType]
  roundPrecision: number
  createdBy: number
  modifiedBy: number
  dateCreate: ISODate
  dateModify: ISODate
}

export interface CatalogExtra {
  id: number
  name: string
  percentage: number
}
