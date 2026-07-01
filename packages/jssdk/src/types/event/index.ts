/**
 * Data Types and Object Structure in the REST API event handler.
 * Defines parameter shapes for incoming Bitrix24 event notifications, including
 * app-install events and auth payloads delivered to registered event handler endpoints.
 * @link https://apidocs.bitrix24.com/api-reference/events/index.html
 */
import type { BoolString } from '../common'
import type { HandlerAuthParams } from '../handler'

export interface EventHandlerParams {
  event: string
  event_handler_id: string
  ts: string
  [key: string]: any
  auth?: HandlerAuthParams
}

export interface EventOnAppInstallHandlerParams extends EventHandlerParams {
  data: {
    VERSION: string
    ACTIVE: BoolString
    INSTALLED: BoolString
    LANGUAGE_ID: string
  }
  auth: HandlerAuthParams
}

/**
 * @todo fix this application_token
 * @see https://apidocs.bitrix24.com/api-reference/events/safe-event-handlers.html
 */
export interface EventOnAppUnInstallHandlerParams {
  event: string
  event_handler_id: string
  ts: string
  [key: string]: any
  auth: {
    domain: string
    client_endpoint: string
    server_endpoint: string
    member_id: string
    application_token: string
  }
}
