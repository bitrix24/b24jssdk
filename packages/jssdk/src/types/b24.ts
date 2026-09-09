/**
 * Core types for the Bitrix24 REST API client: API version enumeration, batch call options,
 * and the main B24 client interface exposing HTTP, auth, tools, and actions managers.
 *
 * @module
 */
import type { LoggerInterface } from './logger'
import type { AjaxResult } from '../core/http/ajax-result'
import type { Result } from '../core/result'
import type { TypeHttp, ICallBatchOptions } from './http'
import type { AuthActions } from './auth'
import type { RestrictionParams } from './limiters'
import type { ActionsManager } from '../core/actions/manager'
import type { ToolsManager } from '../core/tools/manager'

export enum ApiVersion {
  v3 = 'v3',
  v2 = 'v2'
}

/**
 * Options for batch calls
 */
export interface IB24BatchOptions extends ICallBatchOptions {
  /**
   * Api Version
   * If the option is empty, then automatic detection is performed using the specified methods.
   */
  apiVersion?: ApiVersion

  /**
   * Whether to return an AjaxResult object instead of data
   * @default false
   */
  returnAjaxResult?: boolean
}

/**
 * The four shapes a batch answers with, named. `T` is **one command's payload**
 * in all of them.
 *
 * Which one you get is decided by two things you pass in: whether `calls` was a
 * record of named commands or an array, and whether `options.returnAjaxResult`
 * was set. Nothing on the returned value says which — the discriminator is the
 * input — so {@link CallBatchResult} below cannot be narrowed by a type guard.
 * That is why `batch.make` carries overloads: they pick the right member from
 * the arguments, which is the only place the answer exists.
 *
 * Measured, all four (#518):
 *
 * | `calls` | `returnAjaxResult` | `getData()` |
 * | --- | --- | --- |
 * | named record | absent / `false` | `{ [name]: payload }` |
 * | named record | `true`            | `{ [name]: AjaxResult }` |
 * | array         | absent / `false` | `payload[]` |
 * | array         | `true`            | `AjaxResult[]` |
 */
export type BatchResultByName<T> = Result<Record<string, T>>
/** @see BatchResultByName */
export type BatchResultByIndex<T> = Result<T[]>
/** @see BatchResultByName */
export type BatchResultByNameDetailed<T> = Result<Record<string | number, AjaxResult<T>>>
/** @see BatchResultByName */
export type BatchResultByIndexDetailed<T> = Result<AjaxResult<T>[]>

/**
 * The union of every batch shape — what the implementation signature returns,
 * and what a caller sees when `returnAjaxResult` is a `boolean` the compiler
 * cannot read as a literal. Prefer the overloads; reach for this only when the
 * flag is genuinely dynamic.
 */
export type CallBatchResult<T>
  = BatchResultByNameDetailed<T>
    | BatchResultByIndexDetailed<T>
    | BatchResultByName<T>
    | BatchResultByIndex<T>
    | Result<T>

export type TypeB24 = {
  /**
   * @see {https://bitrix24.github.io/b24jssdk/docs/hook/ Js SDK documentation}
   * @see {https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-functions/bx24-init.html Bitrix24 REST API documentation}
   */
  readonly isInit: boolean
  init(): Promise<void>
  destroy(): void

  getLogger(): LoggerInterface
  setLogger(logger: LoggerInterface): void

  /**
   * Returns the AuthActions interface for handling authorization.
   */
  get auth(): AuthActions

  /**
   * Returns the ActionsManager interface for working with Bitrix24 methods. Dependent on the REST API version.
   */
  get actions(): ActionsManager

  /**
   * Returns the ToolsManager interface for access to Bitrix24 utilities independent of the REST API version.
   */
  get tools(): ToolsManager

  /**
   * Sets the restriction parameters
   */
  setRestrictionManagerParams(params: RestrictionParams): Promise<void>

  /**
   * Get the account address Bitrix24 ( `https://your_domain.bitrix24.com` )
   */
  getTargetOrigin(): string

  /**
   * Get the account address Bitrix24 with path
   *  - `restApi:v3` `https://your_domain.bitrix24.com/rest/api/`
   *  - `restApi:v2` `https://your_domain.bitrix24.com/rest/`
   */
  getTargetOriginWithPath(): Map<ApiVersion, string>

  /**
   * Returns the HTTP client to perform the request.
   */
  getHttpClient(version: ApiVersion): TypeHttp

  /**
   * Set HTTP client
   */
  setHttpClient(version: ApiVersion, client: TypeHttp): void
}
