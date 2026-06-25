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

/**
 * A single task as returned by `tasks.task.list` (v3).
 *
 * Note the field casing: `tasks.task.list` sorts / filters by the uppercase
 * `ID` but returns each task with a lowercase `id`. Only the fields read by the
 * `list tasks` command are typed here — extend as needed.
 */
export interface TaskListItem {
  id: string
  title: string
  status: string
  responsibleId: string
}
