import type { LoggerBrowser } from '../logger/browser'
import type { AjaxResult } from '../core/http/ajax-result'
import type { Result } from '../core/result'
import type {
  TypeHttp,
  ICallBatchOptions,
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  TypeCallParams
} from './http'
import type { AuthActions } from './auth'
import type { PayloadTime } from './payloads'

/**
 * @todo fix docs
 */

/**
 * Options for batch calls
 */
export interface IB24BatchOptions extends ICallBatchOptions {
  /**
   * Whether to return an AjaxResult object instead of data
   * @default false
   */
  returnAjaxResult?: boolean

  /**
   * Whether to return execution time information
   * @default false
   */
  returnTime?: boolean
}

export type TypeB24 = {
  /**
   * @see {https://bitrix24.github.io/b24jssdk/docs/hook/ Js SDK documentation}
   * @see {https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-functions/bx24-init.html Bitrix24 REST API documentation}
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
   * Calls the Bitrix24 REST API method.
   *
   * @param {string} method - REST API method name (eg: `crm.item.get`).
   * @param {TypeCallParams} [params] - Parameters for calling the method.
   * @param {string} [requestId] - Unique request identifier for tracking.
   *     Used for query deduplication and debugging.
   *
   * @returns {Promise<AjaxResult<T>>} A promise that resolves to the result of an API call.
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
   * Fast data retrieval without counting the total number of records.
   * An optimized version of `callListMethod` that doesn't perform queries
   * to determine the total number of elements (which can be resource-intensive with large data sets).
   *
   * @param {string} method - The name of the REST API method that returns a list of data
   *     (for example: `crm.item.list`, `tasks.task.list`).
   * @param {Omit<TypeCallParams, 'start'>} [params] - Request parameters, excluding the `start` parameter,
   *     since the method is designed to obtain all data in one call.
   *     - Note: Use `filter`, `order`, and `select` to control the selection.
   * @param {string} [idKey='ID'] - The name of the field containing the unique identifier of the element.
   *     Default is 'ID' (uppercase). Alternatively, it can be 'id' (lowercase).
   *     or another field, depending on the API data structure.
   * @param {string | null} [customKeyForResult] - A custom key indicating that the result will be
   *     grouped by this field. If null or omitted, a flat array is returned.
   *     Example: `items` to group a list of CRM items.
   * @param {string} [requestId] - Unique request identifier for tracking.
   *     Used for query deduplication and debugging.
   *
   * @returns {Promise<Result<T[]>>} A promise that resolves to the result of an API call.
   */
  callFastListMethod<T = unknown>(
    method: string,
    params?: Omit<TypeCallParams, 'start'>,
    idKey?: string,
    customKeyForResult?: string | null,
    requestId?: string
  ): Promise<Result<T[]>>

  /**
   * Calls a REST service list method and returns an async generator for efficient large data retrieval.
   * Implements the fast algorithm for iterating over large datasets without loading all data into memory at once.
   *
   * @param {string} method - The REST API method name that returns a list (e.g., `crm.item.list`, `tasks.task.list`).
   * @param {Omit<TypeCallParams, 'start'>} [params] - Request parameters, excluding the `start` parameter,
   *     since the method is designed to obtain all data in one call.
   *     - Note: Use `filter`, `order`, and `select` to control the selection.
   * @param {string} [idKey='ID'] - The name of the field containing the unique identifier of the element.
   *     Default is 'ID' (uppercase). Alternatively, it can be 'id' (lowercase).
   *     or another field, depending on the API data structure.
   * @param {string | null} [customKeyForResult] - A custom key indicating that the result will be
   *     grouped by this field. If null or omitted, a flat array is returned.
   *     Example: `items` to group a list of CRM items.
   * @param {string} [requestId] - Unique request identifier for tracking.
   *     Used for query deduplication and debugging.
   *
   * @returns {AsyncGenerator<T[]>} An async generator that yields chunks of data as arrays of type `T`.
   *     Each iteration returns the next page/batch of results until all data is fetched.
   */
  fetchListMethod<T = unknown>(
    method: string,
    params?: Omit<TypeCallParams, 'start'>,
    idKey?: string,
    customKeyForResult?: string | null,
    requestId?: string
  ): AsyncGenerator<T[]>

  callBatch(
    // @deprecated Use the method `callBatch` with the options object
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    isHaltOnError?: boolean,
    returnAjaxResult?: boolean,
    returnTime?: boolean
  ): Promise<Result>

  /**
   * Executes a batch request to the Bitrix24 REST API with a maximum number of commands of no more than 50.
   * Allows you to execute multiple requests in a single API call, significantly improving performance.
   *
   * @param {BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal} calls - Commands to execute in a batch.
   *     Supports several formats:
   *     1. Array of tuples: `[['method1', params1], ['method2', params2], ...]`
   *     2. Array of objects: `[{method: 'method1', params: params1}, {method: 'method2', params: params2}, ...]`
   *     3. An object with named commands: `{cmd1: {method: 'method1', params: params1}, cmd2: ['method2', params2], ...}`
   * @param {IB24BatchOptions} [options] - Additional options for executing a batch request.
   *     - `isHaltOnError?: boolean` - Whether to stop execution on the first error (default: true)
   *     - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging (default: undefined)
   *     - `returnAjaxResult?: boolean` - Whether to return an AjaxResult object instead of data (default: false)
   *     - `returnTime?: boolean` - Whether to return execution time information (default: false)
   *
   * @returns {Promise<Result<{ result: Record<string | number, AjaxResult<T>> | AjaxResult<T>[], time?: PayloadTime }> | Result<Record<string | number, AjaxResult<T>> | AjaxResult<T>[]> | Result<T>>}
   *     A promise that is resolved by the result of executing a batch request:
   *     - On success: a `Result` object with the command execution results
   *     - The structure of the results depends on the format of the `calls` input data:
   *          - For an array of commands, an array of results in the same order
   *          - For named commands, an object with keys corresponding to the command names
   *     - May contain a `time` field with execution time information
   */
  callBatch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: IB24BatchOptions
  ): Promise<Result<{ result: Record<string | number, AjaxResult<T>> | AjaxResult<T>[], time?: PayloadTime }> | Result<Record<string | number, AjaxResult<T>> | AjaxResult<T>[]> | Result<T>>

  callBatchByChunk(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    // @deprecated Use the method `callBatchByChunk` with the options object
    isHaltOnError: boolean
  ): Promise<Result>

  /**
   * Executes a batch request with automatic chunking for any number of commands.
   * Unlike `callBatch`, which is limited to 50 commands, this method automatically splits
   * a large set of commands into multiple batches and executes them sequentially.
   *
   * @param {BatchCommandsArrayUniversal | BatchCommandsObjectUniversal} calls - Commands to execute.
   *     Supports two formats:
   *     1. Array of tuples: `[['method1', params1], ['method2', params2], ...]`
   *     2. Array of objects: `[{method: 'method1', params: params1}, {method: 'method2', params: params2}, ...]`
   *     - Note: Named commands are not supported as they are difficult to process when chunking.
   * @param {ICallBatchOptions} [options] - Additional options for executing a batch request.
   *     - `isHaltOnError?: boolean` - Whether to stop execution on the first error (default: true)
   *     - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging (default: undefined)
   *
   * @returns {Promise<Result<T[]>>} A promise that is resolved by the result of executing all commands.
   */
  callBatchByChunk<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<T[]>>

  /**
   * Returns Http client for requests
   */
  getHttpClient(): TypeHttp

  /**
   * Set Http client for requests
   */
  setHttpClient(client: TypeHttp): void

  /**
   * Checks the availability of the Bitrix24 REST API.
   * Performs a simple request to the API to verify the service is operational and that the required access rights are present.
   *
   * @param {string} [requestId] - Unique request identifier for tracking.
   *   Used for query deduplication and debugging.
   *
   * @returns {Promise<boolean>} Promise that resolves to a Boolean value:
   *   - `true`: the API is available and responding
   *   - `false`: the API is unavailable, an error occurred, or the required access rights are missing
   */
  healthCheck(requestId?: string): Promise<boolean>

  /**
   * Measures the response speed of the Bitrix24 REST API.
   * Performs a test request and returns the response time in milliseconds.
   * Useful for performance monitoring and diagnosing latency issues.
   *
   * @param {string} [requestId] - Unique request identifier for tracking.
   * Used for query deduplication and debugging.
   *
   * @returns {Promise<number>} Promise that resolves to a response time in milliseconds:
   * - Positive number: time from sending the request to receiving the response
   * - In case of an error or timeout: `-1`
   */
  ping(requestId?: string): Promise<number>
}
