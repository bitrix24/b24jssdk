import type { LoggerBrowser } from '../logger/browser'
import type { Result } from '../core/result'
import type { AjaxResult } from '../core/http/ajax-result'

export type TypeHttp = {
  setLogger(logger: LoggerBrowser): void
  getLogger(): LoggerBrowser

  batch(calls: any[] | object, isHaltOnError: boolean, returnAjaxResult: boolean): Promise<Result>

  call(method: string, params: object, start: number): Promise<AjaxResult>

  setRestrictionManagerParams(params: TypeRestrictionManagerParams): void

  getRestrictionManagerParams(): TypeRestrictionManagerParams

  setLogTag(logTag?: string): void
  clearLogTag(): void

  /**
   * On|Off warning about client-side query execution
   * @param {boolean} value
   * @param {string} message
   */
  setClientSideWarning(value: boolean, message: string): void
}

export interface IRequestIdGenerator {
  getRequestId(): string
  getHeaderFieldName(): string
  getQueryStringParameterName(): string
  getQueryStringSdkParameterName(): string
}

export type TypeRestrictionManagerParams = {
  sleep: number
  speed: number
  amount: number
}

export const RestrictionManagerParamsBase = {
  sleep: 1_000,
  speed: 0.001,
  amount: 30
} as TypeRestrictionManagerParams

/**
 * @todo Need test
 */
export const RestrictionManagerParamsForEnterprise = {
  sleep: 600,
  speed: 0.01,
  amount: 30 * 5
} as TypeRestrictionManagerParams
