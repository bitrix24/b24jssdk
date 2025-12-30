import type { LoggerBrowser } from '../logger/browser'
import type { Result } from '../core/result'
import type { AjaxResult } from '../core/http/ajax-result'
import type { PayloadTime } from './payloads'
import type { RestrictionParams, RestrictionManagerStats } from './limiters'

/**
 * @todo перевод
 * @todo fix docs
 */

// region Batch interface ////
/**
 * Опции для batch вызова
 */
export interface ICallBatchOptions {
  /**
   * Останавливать ли выполнение при первой ошибке
   * @default true
   */
  isHaltOnError?: boolean
}

/**
 * Результат batch вызова
 */
export interface ICallBatchResult<T = unknown> {
  result?: AjaxResult<T>[] | Record<string | number, AjaxResult<T>>
  time?: PayloadTime
}

export type CommandUniversal<M extends string = string, P = unknown>
  = | CommandTuple<M, P>
    | CommandObject<M, P>

export type BatchCommandsUniversal<M extends string = string, P = unknown> = CommandUniversal<M, P>[]

// 1. Array of arrays
export type CommandTuple<M extends string = string, P = unknown> = [M, P]
export type BatchCommandsArrayUniversal<M extends string = string, P = unknown> = CommandTuple<M, P>[]

// 2. Array of objects
export interface CommandObject<M extends string = string, P = unknown> {
  method: M
  params?: P
}
export type BatchCommandsObjectUniversal<M extends string = string, P = unknown> = CommandObject<M, P>[]

// 3. Object with named commands
export type BatchNamedCommandsUniversal<
  K extends string | number | symbol = string,
  M extends string = string,
  P = unknown
> = Record<K, CommandObject<M, P> | CommandTuple<M, P>>
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
  setLogger(logger: LoggerBrowser): void
  getLogger(): LoggerBrowser

  /**
   * Executing batch queries
   */
  batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>>

  call<T = unknown>(
    method: string,
    params: object,
    start: number
  ): Promise<AjaxResult<T>>

  /**
   * Устанавливает параметры ограничений
   */
  setRestrictionManagerParams(params: RestrictionParams): Promise<void>

  /**
   * Возвращает текущие параметры ограничений
   */
  getRestrictionManagerParams(): RestrictionParams

  /**
   * Возвращает статистику работы
   */
  getStats(): RestrictionManagerStats & { adaptiveDelayAvg: number }

  /**
   * Сбрасывает лимитеры и статистику
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
