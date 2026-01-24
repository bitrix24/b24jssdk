import type { LoggerInterface } from './logger'
import type { AjaxResult } from '../core/http/ajax-result'
import type { Result } from '../core/result'
import type { TypeHttp, ICallBatchOptions } from './http'
import type { AuthActions } from './auth'
import type { RestrictionParams } from './limiters'
import type { ActionsManager } from '../core/actions/manager'
import type { ToolsManager } from '../core/tools/manager'

/**
 * @todo docs
 */

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

export type CallBatchResult<T>
  = Result<Record<string | number, AjaxResult<T>>>
    | Result<AjaxResult<T>[]>
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
   * Calls the Bitrix24 REST API method.
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link CallV3.make `b24.actions.v3.call.make(options)`}
   *   - for `restApi:v2` use {@link CallV2.make `b24.actions.v2.call.make(options)`}
   *
   * @removed 2.0.0
   */
  callMethod(method: string, params?: object, start?: number): Promise<AjaxResult>

  /**
   * Calls a Bitrix24 REST API list method to retrieve all data.
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link CallListV3.make `b24.actions.v3.callList.make(options)`}
   *   - for `restApi:v3` use {@link CallListV2.make `b24.actions.v2.callList.make(options)`}
   *
   * @removed 2.0.0
   */
  callListMethod(method: string, params?: object, progress?: null | ((progress: number) => void), customKeyForResult?: string | null): Promise<Result>

  /**
   * Calls a Bitrix24 REST API list method and returns an async generator.
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link FetchListV3.make `b24.actions.v3.fetchList.make(options)`}
   *   - for `restApi:v3` use {@link FetchListV2.make `b24.actions.v2.fetchList.make(options)`}
   *
   * @removed 2.0.0
   */
  fetchListMethod(method: string, params?: any, idKey?: string, customKeyForResult?: string | null): AsyncGenerator<any[]>

  /**
   * Executes a batch request to the Bitrix24 REST API
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link BatchV3.make `b24.actions.v3.batch.make(options)`}
   *   - for `restApi:v3` use {@link BatchV2.make `b24.actions.v2.batch.make(options)`}
   *
   * @removed 2.0.0
   */
  callBatch(calls: Array<any> | object, isHaltOnError?: boolean, returnAjaxResult?: boolean): Promise<Result>

  /**
   * Executes a batch request to the Bitrix24 REST API with automatic chunking for any number of commands.
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link BatchByChunkV3.make `b24.actions.v3.batchByChunk.make(options)`}
   *   - for `restApi:v3` use {@link BatchByChunkV2.make `b24.actions.v2.batchByChunk.make(options)`}
   *
   * @removed 2.0.0
   */
  callBatchByChunk(calls: Array<any>, isHaltOnError: boolean): Promise<Result>

  /**
   * Returns the HTTP client to perform the request.
   */
  getHttpClient(version: ApiVersion): TypeHttp

  /**
   * Set HTTP client
   */
  setHttpClient(version: ApiVersion, client: TypeHttp): void
}
