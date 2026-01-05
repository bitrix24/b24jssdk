import type { LoggerBrowser } from '../logger/browser'
import type { AjaxResult } from '../core/http/ajax-result'
import type { Result } from '../core/result'
import type {
  TypeHttp,
  ICallBatchOptions,
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  ICallBatchResult,
  TypeCallParams
} from './http'
import type { AuthActions } from './auth'

/**
 * @todo перевод
 * @todo fix docs
 */

/**
 * Опции для batch вызова
 */
export interface IB24BatchOptions extends ICallBatchOptions {
  /**
   * Возвращать ли объект AjaxResult вместо данных
   * @default false
   */
  returnAjaxResult?: boolean

  /**
   * Возвращать ли информацию о времени выполнения
   * @default false
   */
  returnTime?: boolean
}

export type TypeB24 = {
  /**
   * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-init.html
   */
  readonly isInit: boolean
  init(): Promise<void>
  destroy(): void

  getLogger(): LoggerBrowser
  setLogger(logger: LoggerBrowser): void

  get auth(): AuthActions

  /**
   * Get the account address BX24 ( https://name.bitrix24.com )
   */
  getTargetOrigin(): string

  /**
   * Get the account address BX24 ( https://name.bitrix24.com/rest )
   */
  getTargetOriginWithPath(): string

  /**
   * Calling the RestApi function
   * @param method - REST API method name
   * @param params - Parameters for the method.
   * @param requestId
   * @returns Promise with AjaxResult
   */
  callMethod<T = unknown>(
    method: string,
    params?: TypeCallParams,
    requestId?: string
  ): Promise<AjaxResult<T>>

  /**
   * @deprecate: use callFastListMethod()
   */
  callListMethod(
    method: string,
    params?: Omit<TypeCallParams, 'start'>,
    progress?: null | ((progress: number) => void),
    customKeyForResult?: string | null
  ): Promise<Result>

  /**
   * Use for quick data retrieval.
   * Similar to callListMethod, but does not count the total number
   *
   * @param  {string} method Query method
   * @param  {TypeCallParams} params Request parameters
   * @param {string} idKey Entity ID field name ('ID' || 'id')
   * @param {string} customKeyForResult Custom field indicating that the result will be a grouping key
   * @param {string} requestId
   * @return {Promise}
   */
  callFastListMethod<T = unknown>(
    method: string,
    params?: Omit<TypeCallParams, 'start'>,
    idKey?: string,
    customKeyForResult?: string | null,
    requestId?: string
  ): Promise<Result<T[]>>

  /**
   * Calls a REST service list method with the specified parameters and returns a generator object.
   * Implements the fast algorithm described in {@see https://apidocs.bitrix24.com/api-reference/performance/huge-data.html}
   *
   * @param {string} method Query method
   * @param {TypeCallParams} params Request parameters
   * @param {string} idKey Entity ID field name ('ID' || 'id')
   * @param {string} customKeyForResult Custom field indicating that the result will be a grouping key
   * @param requestId
   * @return {AsyncGenerator} Generator
   */
  fetchListMethod<T = unknown>(
    method: string,
    params?: Omit<TypeCallParams, 'start'>,
    idKey?: string,
    customKeyForResult?: string | null,
    requestId?: string
  ): AsyncGenerator<T[]>

  /**
   * Calls a batch request with a maximum number of commands of no more than 50
   * @see https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-batch.html
   */
  callBatch<T = any>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: IB24BatchOptions
  ): Promise<Result<ICallBatchResult<T>> | Result<Record<string | number, AjaxResult<T>> | AjaxResult<T>[]> | Result<T>>

  /**
   * @deprecated Use the method `callBatch` with the options object
   * @param  calls Request packet
   * @param  {boolean} isHaltOnError Abort package execution when an error occurs
   * @param  {boolean} returnAjaxResult then true return `AjaxResult[] | Record<string | number, AjaxResult>` in response
   * @param  {boolean} returnTime then true return `{time: PayloadTime, result: AjaxResult[] | Record<string | number, AjaxResult> }` in response
   * @return {Promise} Promise
   */
  callBatch(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    isHaltOnError?: boolean,
    returnAjaxResult?: boolean,
    returnTime?: boolean
  ): Promise<Result>

  /**
   * Calls a batch request with any number of commands
   * @see https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-batch.html
   */
  callBatchByChunk<T = any>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<T[]>>

  /**
   * @deprecated Use the method `callBatchByChunk` with the options object
   * @param  calls Request packet
   * @param  {boolean} isHaltOnError Abort package execution when an error occurs
   * @return {Promise} Promise
   */
  callBatchByChunk(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    isHaltOnError: boolean
  ): Promise<Result>

  /**
   * Returns Http client for requests
   */
  getHttpClient(): TypeHttp

  /**
   * Метод для проверки доступности
   */
  healthCheck(requestId?: string): Promise<boolean>

  /**
   * Метод для тестирования скорости ответа
   */
  ping(requestId?: string): Promise<number>
}
