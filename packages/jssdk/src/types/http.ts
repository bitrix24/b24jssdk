import type { LoggerInterface } from './logger'
import type { Result } from '../core/result'
import type { AjaxResult } from '../core/http/ajax-result'
import type { PayloadTime } from './payloads'
import type { RestrictionParams, RestrictionManagerStats } from './limiters'
import type { ApiVersion } from './b24'

/**
 * @todo fix docs
 */

export type TypeCallParams = {
  order?: Record<string, string>
  filter?: any
  select?: string[]
  params?: any // @see tasks.task.list
  start?: number
  [key: string]: any
}

// region Batch interface ////
/**
 * Options for batch calls
 */
export interface ICallBatchOptions {
  /**
   * Whether to stop execution on the first error
   * @default true
   */
  isHaltOnError?: boolean
  /**
   * Unique request identifier for tracking. Used for query deduplication and debugging.
   */
  requestId?: string
}

/**
 * Result of the batch call
 */
export interface ICallBatchResult<T = unknown> {
  result?: Map<string | number, AjaxResult<T>>
  time?: PayloadTime
}

export type CommandTuple<M extends string = string, P = undefined | TypeCallParams> = [M, P?]
export interface CommandObject<M extends string = string, P = undefined | TypeCallParams> { method: M, params?: P }
export type CommandUniversal<M extends string = string, P = undefined | TypeCallParams>
  = | CommandTuple<M, P>
    | CommandObject<M, P>

// 1. Array of arrays
export type BatchCommandsArrayUniversal<M extends string = string, P = undefined | TypeCallParams> = CommandTuple<M, P>[]

// 2. Array of objects
export type BatchCommandsObjectUniversal<M extends string = string, P = undefined | TypeCallParams> = CommandObject<M, P>[]

// 3. Object with named commands
export type BatchNamedCommandsUniversal<
  K extends string | number | symbol = string,
  M extends string = string,
  P = undefined | TypeCallParams
> = Record<K, CommandObject<M, P> | CommandTuple<M, P>>

// 4. Universal
export type BatchCommandsUniversal<M extends string = string, P = undefined | TypeCallParams> = CommandUniversal<M, P>[]
// endregion ////

/**
 * Interface for Request id generator
 */
export interface IRequestIdGenerator {
  getRequestId(): string
  getHeaderFieldName(): string
  getQueryStringParameterName(): string
  getQueryStringSdkParameterName(): string
}

/**
 * Interface for HTTP client
 */
export type TypeHttp = {
  apiVersion: ApiVersion
  setLogger(logger: LoggerInterface): void
  getLogger(): LoggerInterface

  /**
   * Executing batch queries
   */
  batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>>

  /**
   * Calling the RestApi function
   * @param method - REST API method name
   * @param params - Parameters for the method.
   * @param requestId - Request id
   * @returns Promise with AjaxResult
   */
  call<T = unknown>(
    method: string,
    params: TypeCallParams,
    requestId?: string
  ): Promise<AjaxResult<T>>

  /**
   * Sets the restriction parameters
   */
  setRestrictionManagerParams(params: RestrictionParams): Promise<void>

  /**
   * Returns the current constraint settings
   */
  getRestrictionManagerParams(): RestrictionParams

  /**
   * Returns job statistics
   */
  getStats(): RestrictionManagerStats & {
    adaptiveDelayAvg: number
    errorCounts: Record<string, number>
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    totalDuration: number
    byMethod: Map<string, { count: number, totalDuration: number }>
    lastErrors: { method: string, error: string, timestamp: number }[]
  }

  /**
   * Resets limiters and statistics
   */
  reset(): Promise<void>

  setLogTag(logTag?: string): void
  clearLogTag(): void

  /**
   * On|Off warning about client-side query execution
   * @param {boolean} value
   * @param {string} message
   */
  setClientSideWarning(value: boolean, message: string): void
}
