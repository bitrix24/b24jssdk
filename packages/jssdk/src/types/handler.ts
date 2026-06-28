/**
 * Types for authentication and OAuth token data passed to Bitrix24 REST API event handlers.
 * `HandlerAuthParams` contains the full auth context provided with every incoming event request.
 */

export interface HandlerAuthParams {
  access_token: string
  expires: string
  expires_in: string
  scope: string
  domain: string
  server_endpoint: string
  status: string
  client_endpoint: string
  member_id: string
  user_id: string
  refresh_token: string
  application_token: string
}

export type PayloadOAuthToken = Pick<HandlerAuthParams, 'access_token' | 'refresh_token' | 'expires' | 'expires_in' | 'client_endpoint' | 'server_endpoint' | 'member_id' | 'status' | 'user_id'>
