import type { BoolString } from '@bitrix24/b24jssdk'

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
