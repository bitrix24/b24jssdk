/**
 * Data Types and Object Structure in the REST API bizproc activity and robot
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-activity/index.html
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-robot/index.html
 *
 * @todo add docs
 */
import type { BoolString } from '../../common'
import type { HandlerAuthParams } from '../../handler'
import type { B24LangList } from '../../../core/language/list'

export interface ActivityHandlerParams {
  event_token: string
  workflow_id: string
  code: string
  document_id: string[]
  document_type: string[]
  properties?: Record<string, string>
  use_subscription: BoolString
  timeout_duration: string
  ts: string
  [key: string]: any
  auth: HandlerAuthParams
}

export type ActivityPropertyType = 'bool' | 'date' | 'datetime' | 'double' | 'int' | 'select' | 'string' | 'text' | 'user'

export interface ActivityProperty {
  Name: string | Partial<Record<B24LangList, string>>
  Description?: string | Record<string, string>
  Type: ActivityPropertyType
  Options?: Record<string | number, string>
  Required?: BoolString
  Multiple?: BoolString
  Default?: any
}

export interface ActivityConfig {
  CODE: string
  HANDLER: string
  NAME: string | Partial<Record<B24LangList, string>>
  DESCRIPTION?: string | Partial<Record<B24LangList, string>>
  DOCUMENT_TYPE?: [string, string, string]
  PROPERTIES?: Record<string, ActivityProperty>
  RETURN_PROPERTIES?: Record<string, ActivityProperty>
  FILTER?: {
    INCLUDE?: Array<string | string[]>
    EXCLUDE?: Array<string | string[]>
  }
  USE_PLACEMENT?: BoolString
  PLACEMENT_HANDLER?: string
  USE_SUBSCRIPTION?: BoolString
  AUTH_USER_ID?: number
}

export interface ActivityOrRobotConfig extends Omit<ActivityConfig, 'HANDLER' | 'PLACEMENT_HANDLER' | 'NAME'> {
  type: 'activity' | 'robot'
  NAME?: ActivityConfig['NAME']
  HANDLER?: ActivityConfig['HANDLER']
  PLACEMENT_HANDLER?: ActivityConfig['PLACEMENT_HANDLER']
}
