import type { LoggerInterface } from '../logger'
import type { AjaxResult } from './http/ajax-result'
import type { CallBatchResult, IB24BatchOptions, TypeB24 } from '../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchCommandsUniversal,
  BatchNamedCommandsUniversal, ICallBatchResult,
  TypeCallParams,
  TypeHttp
} from '../types/http'
import type { AuthActions } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import { LoggerFactory } from '../logger'
import { Result } from './result'
import { SdkError } from './sdk-error'
import { ApiVersion } from '../types/b24'
import { versionManager } from './version-manager'
import { ActionsManager } from './actions/manager'
import { ToolsManager } from './tools/manager'

/**
 * @todo docs
 * @todo test all example
 */
export abstract class AbstractB24 implements TypeB24 {
  static readonly batchSize = 50

  protected _isInit: boolean = false
  protected _httpV2: null | TypeHttp = null
  protected _httpV3: null | TypeHttp = null
  protected _logger: LoggerInterface

  protected _actionsManager: ActionsManager
  protected _toolsManager: ToolsManager

  // region Init ////
  protected constructor() {
    this._isInit = false
    this._logger = LoggerFactory.createNullLogger()

    this._actionsManager = new ActionsManager(this)
    this._toolsManager = new ToolsManager(this)
  }

  /**
   * @inheritDoc
   */
  get isInit(): boolean {
    return this._isInit
  }

  public async init(): Promise<void> {
    this._isInit = true
    return
  }

  public destroy(): void {}
  // endregion ////

  // region Core ////
  abstract get auth(): AuthActions

  get actions(): ActionsManager {
    this._ensureInitialized()
    return this._actionsManager
  }

  get tools(): ToolsManager {
    this._ensureInitialized()
    return this._toolsManager
  }

  /**
   * @inheritDoc
   */
  public abstract getTargetOrigin(): string

  /**
   * @inheritDoc
   */
  public abstract getTargetOriginWithPath(): Map<ApiVersion, string>

  /**
   * @inheritDoc
   *
   * @template T - The expected data type in the response (default is `unknown`).
   *
   * @example
   * // Simple call
   * const response = await b24.callMethod('crm.item.get', { entityTypeId: 3, id: 123 })
   * if (!response.isSuccess) {
   *   throw new Error(`Failed to fetch item: ${response.getErrorMessages().join('; ')}`)
   * }
   * console.log(response.getData().result.item.name)
   *
   * @example
   * // Call with type
   * interface CrmItem { id: number, name: string, lastName: string }
   * const response = await b24.callMethod<{ item: CrmItem[] }>('crm.item.get', { entityTypeId: 3, id: 123 })
   *
   * @example
   * // With request tracking
   * const response = await b24.callMethod('crm.item.list', { entityTypeId: 3 }, 'contact-list-123')
   *
   * @see {https://bitrix24.github.io/b24jssdk/docs/hook/methods/call-method/ Js SDK documentation}
   * @see {https://apidocs.bitrix24.com/sdk/bx24-js-sdk/how-to-call-rest-methods/bx24-call-method.html Bitrix24 REST API documentation}
   */
  public async callMethod<T = unknown>(
    method: string,
    params?: TypeCallParams,
    requestId?: string
  ): Promise<AjaxResult<T>> {
    params = params || {}

    const version = versionManager.automaticallyObtainApiVersion(method)
    const client = this.getHttpClient(version)

    return client.call<T>(method, params, requestId)
  }

  /**
   * @inheritDoc
   *
   * @template T - The data type returned by batch query commands (default is `unknown`)
   *
   * @example
   * // Batch query with an array of tuples
   * const response = await b24.callBatch([
   *   ['crm.item.get', { entityTypeId: 3, id: 1 }],
   *   ['crm.item.get', { entityTypeId: 3, id: 2 }],
   *   ['crm.item.get', { entityTypeId: 3, id: 3 }]
   * ], { isHaltOnError: true, returnAjaxResult: true })
   *
   * if (!response.isSuccess) {
   *   throw new Error(`Failed: ${response.getErrorMessages().join('; ')}`)
   * }
   *
   * const results = response.getData() // AjaxResult<T>[]
   * results.forEach((result, index) => {
   *   if (result.isSuccess) {
   *    console.log(`Contact ${index + 1}:`, result.getData()?.item)
   *   }
   * })
   *
   * @example
   * // Batch request with an array of objects
   * const response = await b24.callBatch([
   *   { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } },
   *   { method: 'crm.item.get', params: { entityTypeId: 3, id: 2 } }
   * ], { isHaltOnError: true, returnAjaxResult: true })
   *
   * @example
   * // Batch query with named commands
   * const response = await b24.callBatch({
   *   Contact: { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } },
   *   Deal: ['crm.item.get', { entityTypeId: 2, id: 2 }],
   *   Company: ['crm.item.get', { entityTypeId: 4, id: 3 }]
   * }, { isHaltOnError: true, returnAjaxResult: true })
   *
   * if (!response.isSuccess) {
   *   throw new Error(`Failed: ${response.getErrorMessages().join('; ')}`)
   * }
   *
   *  const results = response.getData() // Record<string, AjaxResult<T>>
   *  console.log('Contact:', results.Contact.getData()?.item)
   *  console.log('Deal:', results.Deal.getData()?.item)
   *  console.log('Company:', results.Company.getData()?.item)
   *
   * @example
   * // Batch request with types
   * interface Contact { id: number, name: string }
   * interface Deal { id: number, title: string }
   *
   * const response = await b24.callBatch<{ item: Contact } | { item: Deal }>({
   *   Contact: ['crm.item.get', { entityTypeId: 3, id: 1 }],
   *   Deal: ['crm.item.get', { entityTypeId: 2, id: 2 }]
   * }, { isHaltOnError: true, returnAjaxResult: false })
   *
   * @warning The maximum number of commands in one batch request is 50.
   *     If you need to execute more than 50 commands, you need to split them into several batches.
   * @note A batch request executes faster than sequential single calls,
   *     but if one command fails, the entire batch may fail
   *     (depending on API settings and options).
   *
   * @see {https://bitrix24.github.io/b24jssdk/docs/hook/call-batch/ Js SDK documentation}
   * @see {@link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/how-to-call-rest-methods/bx24-call-batch.html Bitrix24 batch query documentation}
   * @see {@link callMethod} To call arbitrary API methods
   *
   * @todo test examples
   * @todo test results
   */
  public async callBatch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    optionsOrIsHaltOnError?: IB24BatchOptions | boolean,
    returnAjaxResult?: boolean
  ): Promise<CallBatchResult<T>> {
    const options = this._normalizeBatchOptions(optionsOrIsHaltOnError, returnAjaxResult)
    options.apiVersion = options.apiVersion ?? versionManager.automaticallyObtainApiVersionForBatch(calls)

    const response = await this.getHttpClient(options.apiVersion).batch<T>(calls, options)

    return this._processBatchResponse<T>(response, calls, options)
  }

  public async callBatchV3<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: IB24BatchOptions
  ): Promise<CallBatchResult<T>> {
    const opts = this._normalizeBatchOptions(options)
    opts.apiVersion = ApiVersion.v3

    if (versionManager.automaticallyObtainApiVersionForBatch(calls) !== opts.apiVersion) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_API_V3_NOT_SUPPORT_METHOD_IN_BATCH',
        description: `Api:v3 not support method ${JSON.stringify(calls)}`,
        status: 500
      })
    }

    return this.callBatch<T>(calls, opts)
  }

  /**
   * @todo ! move to actions
   */
  public async callBatchV2<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: IB24BatchOptions
  ): Promise<CallBatchResult<T>> {
    const opts = this._normalizeBatchOptions(options)
    opts.apiVersion = ApiVersion.v2

    return this.callBatch<T>(calls, opts)
  }

  /**
   * @inheritDoc
   *
   * @template T - The data type returned by commands (default: `unknown`)
   *
   * @example
   * // Execute a large number of commands with automatic splitting
   * const commands = Array.from({ length: 150 }, (_, i) =>
   *   ['crm.item.get', { entityTypeId: 3, id: i + 1 }]
   * )
   *
   * const response = await b24.callBatchByChunk<Contact>(commands, { isHaltOnError: true, requestId: 'contact-list-123' })
   *
   * if (!response.isSuccess) {
   *   throw new Error(`Failed: ${response.getErrorMessages().join('; ')}`)
   * }
   *
   * const data = response.getData()
   * const contacts: Contact[] = []
   * data.forEach((chunkRow: { item: Contact }) => {
   *   contacts.push(chunkRow.item)
   * })
   * console.log(`Successfully retrieved ${contacts.length} contacts`)
   *
   * @tip For very large command sets, consider using server-side task queues instead of bulk batch requests.
   *
   * @see {https://bitrix24.github.io/b24jssdk/docs/hook/call-batch-by-chunk/ Js SDK documentation}
   * @see {@link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/how-to-call-rest-methods/bx24-call-batch.html Bitrix24 batch query documentation}
   * @see {@link callBatch} To execute batch queries of up to 50 commands
   */
  public async callBatchByChunk<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    optionsOrIsHaltOnError?: Omit<IB24BatchOptions, 'returnAjaxResult'> | boolean
  ): Promise<Result<T[]>> {
    const options = this._normalizeBatchOptions(optionsOrIsHaltOnError)
    options.returnAjaxResult = false
    options.apiVersion = options.apiVersion ?? versionManager.automaticallyObtainApiVersionForBatch(calls)

    const result = new Result<T[]>()

    const dataResult: T[] = []
    const chunks = this.chunkArray(calls as BatchCommandsUniversal, AbstractB24.batchSize) as BatchCommandsArrayUniversal[] | BatchCommandsObjectUniversal[]

    for (const chunkRequest of chunks) {
      const response = await this.getHttpClient(options.apiVersion).batch<T[]>(chunkRequest, options)
      if (!response.isSuccess) {
        this.getLogger().error('callBatchByChunk', {
          messages: response.getErrorMessages(),
          calls,
          options
        })
        this._addBatchErrorsIfAny(response, result)
      }

      for (const [_index, data] of response.getData()!.result!) {
        // @memo Add only success rows
        if (data.isSuccess) {
          dataResult.push(data.getData()!.result)
        }
      }
    }

    return result.setData(dataResult)
  }

  /**
   * @todo ! move to actions
   */
  public async callBatchByChunkV3<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options?: Omit<IB24BatchOptions, 'returnAjaxResult'>
  ): Promise<Result<T[]>> {
    const opts = this._normalizeBatchOptions(options)
    opts.returnAjaxResult = false
    opts.apiVersion = ApiVersion.v3

    return this.callBatchByChunk<T>(calls, opts)
  }

  /**
   * @todo ! move to actions
   */
  public async callBatchByChunkV2<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options?: Omit<IB24BatchOptions, 'returnAjaxResult'>
  ): Promise<Result<T[]>> {
    const opts = this._normalizeBatchOptions(options)
    opts.returnAjaxResult = false
    opts.apiVersion = ApiVersion.v2

    return this.callBatchByChunk<T>(calls, opts)
  }
  // endregion ////

  // region Tools ////
  protected _normalizeBatchOptions(
    optionsOrIsHaltOnError: IB24BatchOptions | boolean | undefined,
    returnAjaxResult?: boolean
  ): IB24BatchOptions {
    if (typeof optionsOrIsHaltOnError === 'boolean' || optionsOrIsHaltOnError === undefined) {
      return {
        isHaltOnError: optionsOrIsHaltOnError ?? true,
        returnAjaxResult: returnAjaxResult ?? false
      }
    }
    return optionsOrIsHaltOnError
  }

  protected _addBatchErrorsIfAny(
    response: Result<ICallBatchResult<any>>,
    result: Result
  ): void {
    if (!response.isSuccess) {
      for (const [index, error] of response.errors) {
        result.addError(error, index)
      }
    }
  }

  protected _processBatchResponse<T>(
    response: Result<ICallBatchResult<T>>,
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options: IB24BatchOptions
  ): CallBatchResult<T> {
    const isArrayCall = Array.isArray(calls)

    if (options.returnAjaxResult) {
      return this._createBatchResultWithAjax<T>(response, isArrayCall)
    } else {
      return this._createBatchResultSimple<T>(response, isArrayCall)
    }
  }

  // region BatchResultWithAjax ////
  protected _createBatchResultWithAjax<T>(
    response: Result<ICallBatchResult<T>>,
    isArrayCall: boolean
  ): CallBatchResult<T> {
    return isArrayCall
      ? this._createBatchArrayResult<T>(response)
      : this._createBatchObjectResult<T>(response)
  }

  protected _createBatchArrayResult<T>(response: Result<ICallBatchResult<T>>): Result<AjaxResult<T>[]> {
    const result = new Result<AjaxResult<T>[]>()
    this._addBatchErrorsIfAny(response, result)

    const dataResult: AjaxResult<T>[] = []
    for (const [_index, data] of response.getData()!.result!) {
      dataResult.push(data)
    }

    return result.setData(dataResult)
  }

  protected _createBatchObjectResult<T>(response: Result<ICallBatchResult<T>>): Result<Record<string | number, AjaxResult<T>>> {
    const result = new Result<Record<string | number, AjaxResult<T>>>()
    this._addBatchErrorsIfAny(response, result)

    const dataResult: Record<string | number, any> = {}
    for (const [index, data] of response.getData()!.result!) {
      dataResult[index] = data
    }

    return result.setData(dataResult)
  }
  // endregion ////

  // region BatchResultSimple ////
  protected _createBatchResultSimple<T>(
    response: Result<ICallBatchResult<T>>,
    isArrayCall: boolean
  ): CallBatchResult<T> {
    const result = new Result<T>()
    this._addBatchErrorsIfAny(response, result)
    return result.setData(
      this._extractBatchSimpleData<T>(response, isArrayCall)
    )
  }

  protected _extractBatchSimpleData<T>(
    response: Result<ICallBatchResult<T>>,
    isArrayCall: boolean
  ): T {
    if (isArrayCall) {
      const dataResult: any[] = []
      for (const [_index, data] of response.getData()!.result!) {
        // @memo Add only success rows
        if (data.isSuccess) {
          dataResult.push(data.getData()!.result)
        }
      }
      return dataResult as T
    } else {
      const dataResult: Record<string | number, any> = {}
      for (const [index, data] of response.getData()!.result!) {
        // @memo Add only success rows
        if (data.isSuccess) {
          dataResult[index] = data.getData()!.result
        }
      }
      return dataResult as T
    }
  }
  // endregion ////

  public chunkArray<T = unknown>(array: Array<T>, chunkSize: number = 50): T[][] {
    const result: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      const chunk = array.slice(i, i + chunkSize)
      result.push(chunk)
    }
    return result
  }

  /**
   * @inheritDoc
   *
   * @todo fix docs
   */
  public getHttpClient(version: ApiVersion): TypeHttp {
    this._ensureInitialized()

    switch (version) {
      case ApiVersion.v3:
        if (null === this._httpV3) {
          throw new SdkError({
            code: 'JSSDK_CORE_B24_HTTP_V3_NOT_INIT',
            description: `HttpV3 not init`,
            status: 500
          })
        }
        return this._httpV3
      case ApiVersion.v2:
        if (null === this._httpV2) {
          throw new SdkError({
            code: 'JSSDK_CORE_B24_HTTP_V2_NOT_INIT',
            description: `HttpV2 not init`,
            status: 500
          })
        }
        return this._httpV2
    }
    throw new SdkError({
      code: 'JSSDK_CORE_B24_API_WRONG',
      description: `Wrong Api Version ${version}`,
      status: 500
    })
  }

  /**
   * @inheritDoc
   *
   * @todo fix docs
   */
  public setHttpClient(version: ApiVersion, client: TypeHttp): void {
    switch (version) {
      case ApiVersion.v3:
        this._httpV3 = client
        return
      case ApiVersion.v2:
        this._httpV2 = client
        return
    }
    throw new SdkError({
      code: 'JSSDK_CORE_B24_API_WRONG',
      description: `Wrong Api Version ${version}`,
      status: 500
    })
  }

  public setLogger(logger: LoggerInterface): void {
    this._logger = logger

    this._actionsManager.setLogger(this._logger)
    this._toolsManager.setLogger(this._logger)

    versionManager.getAllApiVersions().forEach((version) => {
      this.getHttpClient(version).setLogger(this._logger)
    })
  }

  public getLogger(): LoggerInterface {
    return this._logger
  }

  public async setRestrictionManagerParams(params: RestrictionParams): Promise<void> {
    const promises = versionManager.getAllApiVersions().map(version =>
      this.getHttpClient(version).setRestrictionManagerParams(params)
    )

    await Promise.allSettled(promises)
  }

  /**
   * Returns settings for http connection
   * @protected
   */
  protected _getHttpOptions(): null | object {
    return null
  }

  /**
   * Generates an object not initialized error
   * @protected
   */
  protected _ensureInitialized(): void {
    if (!this._isInit) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_NOT_INIT',
        description: `B24 not initialized`,
        status: 500
      })
    }
  }
  // endregion ////
}
