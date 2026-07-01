import type { BoolString } from '@bitrix24/b24jssdk'

export interface CrmCompany {
  id: number
  title: string
}

export interface CrmContact {
  id: number
  name?: string
  lastName?: string
}

export interface FmField {
  valueType: string
  value: string
  typeId: string
}

export interface ContactFields {
  name: string
  lastName: string
  assignedById: number
  open: BoolString
  typeId: string
  sourceId: string
  post: string
  fm: FmField[]
}

export interface CompanyFields {
  title: string
  assignedById: number
  open: BoolString
  typeId: string
  sourceId: string
  fm: FmField[]
}

export interface CrmItemAddResult {
  item: {
    id: number
  }
}

export interface CatalogProduct {
  id: number
  name: string
  measure?: number
  vatId?: number
}

export interface CatalogCatalogItem {
  iblockId: number | string | null
  productIblockId: number | string | null
}

export interface CatalogVatItem {
  id: number
  rate: number
}

export interface CatalogMeasureItem {
  id: number
}

export interface CatalogPriceType {
  id: number
}

export interface CrmCurrency {
  CURRENCY: string
}

export interface DealStage {
  STATUS_ID: string
  /** Deprecated legacy semantics ('S' = won, 'F' = lost). Prefer `EXTRA.SEMANTICS`. */
  SEMANTICS: string | null
  /** Canonical stage semantics: `EXTRA.SEMANTICS` is 'success' | 'failure' | 'process' | 'apology' | null. */
  EXTRA?: { SEMANTICS?: string | null }
}

export interface CrmSource {
  STATUS_ID: string
}
