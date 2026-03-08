import type { ISODate } from '@bitrix24/b24jssdk'

export interface TaskFields {
  title: string
  description: string
  creatorId: number
  responsibleId: number
  deadline: ISODate
  priority: string
  status: string
}

export interface TaskAddResult {
  item: {
    id: number
  }
}
