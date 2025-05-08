/**
 * Data Types and Object Structure in the REST API bizproc activity and robot
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-activity/index.html
 * @link https://apidocs.bitrix24.com/api-reference/bizproc/bizproc-robot/index.html
 *
 * @todo add docs
 */
import type { BoolString } from '../../common'
import type { HandlerAuthParams } from '../../handler'

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
  auth: HandlerAuthParams
}
