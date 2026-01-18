import type { LoggerInterface } from '../logger'
import type { AjaxResult } from './http/ajax-result'
import type { CallBatchResult, IB24BatchOptions, TypeB24 } from '../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchCommandsUniversal,
  BatchNamedCommandsUniversal,
  TypeCallParams,
  TypeHttp
} from '../types/http'
import type { ListPayload, PayloadTime } from '../types/payloads'
import type { AuthActions, AuthData } from '../types/auth'
import type { AutoRefreshConfig, AutoRefreshStats } from '../types/auth-auto-refresh'
import type { RestrictionParams } from '../types/limiters'
import { AutoAuthRefresher } from './auto-auth-refresher'
import { LoggerFactory } from '../logger'
import { Result } from './result'
import { SdkError } from './sdk-error'
import { Type } from '../tools/type'
import { ApiVersion } from '../types/b24'
import { versionManager } from './version-manager'

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
  protected _autoAuthRefresher: AutoAuthRefresher | null = null

  // region Init ////
  protected constructor() {
    this._isInit = false
    this._logger = LoggerFactory.createNullLogger()
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

  public destroy(): void {
    this.destroyAuthRefresh()
  }
  // endregion ////

  // region Core ////
  abstract get auth(): AuthActions

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

  public async callV3<T = unknown>(method: string, params?: TypeCallParams, requestId?: string): Promise<AjaxResult<T>> {
    if (!versionManager.isSupport(ApiVersion.v3, method)) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_API_V3_NOT_SUPPORT_METHOD',
        description: `Api:v3 not support method ${method}`,
        status: 500
      })
    }

    params = params || {}
    return this.getHttpClient(ApiVersion.v3).call<T>(method, params, requestId)
  }

  public async callV2<T = unknown>(method: string, params?: TypeCallParams, requestId?: string): Promise<AjaxResult<T>> {
    if (versionManager.isSupport(ApiVersion.v3, method)) {
      LoggerFactory.forcedLog(
        this.getLogger(),
        'warning',
        `The method ${method} is available in API version 3. It's worth migrating to the new API.`,
        {
          method,
          requestId,
          code: 'JSSDK_AVAILABLE_API_VERSION_3'
        }
      )
    }

    if (!versionManager.isSupport(ApiVersion.v2, method)) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_API_V2_NOT_SUPPORT_METHOD',
        description: `Api:v2 not support method ${method}`,
        status: 500
      })
    }
    params = params || {}
    return this.getHttpClient(ApiVersion.v2).call<T>(method, params, requestId)
  }

  /**
   * @deprecate: use callFastListMethod()
   *
   * @memo support only ApiVersion.v2
   *
   * @todo test option `start`
   */
  public async callListMethod(
    method: string,
    params: Omit<TypeCallParams, 'start'> = {},
    progress: null | ((progress: number) => void) = null,
    customKeyForResult: null | string = null
  ): Promise<Result> {
    const result = new Result()

    if (Type.isFunction(progress) && null !== progress) {
      progress(0)
    }

    const sendParams: TypeCallParams = {
      ...params,
      start: 0
    }
    return this.callV2(method, sendParams).then(async (response) => {
      let list: any[] = []

      let resultData
      if (null === customKeyForResult) {
        resultData = (response.getData() as ListPayload<any>).result as []
      } else {
        resultData = (response.getData() as ListPayload<any>).result[
          customKeyForResult
        ] as []
      }

      list = [...list, ...resultData]
      if (response.isMore()) {
        let responseLoop: false | AjaxResult = response
        while (true) {
          responseLoop = await responseLoop.getNext(this.getHttpClient(ApiVersion.v2))

          if (responseLoop === false) {
            break
          }

          let resultData = undefined
          if (null === customKeyForResult) {
            resultData = (responseLoop.getData() as ListPayload<any>)
              .result as []
          } else {
            resultData = (responseLoop.getData() as ListPayload<any>).result[
              customKeyForResult
            ] as []
          }

          list = [...list, ...resultData]

          if (progress) {
            const total = responseLoop.getTotal()
            progress(total > 0 ? Math.round((100 * list.length) / total) : 100)
          }
        }
      }

      result.setData(list)
      if (progress) {
        progress(100)
      }

      return result
    })
  }

  /**
   * @inheritDoc
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   *
   * @example
   * // Get all contacts without counting the total number
   * const sixMonthAgo = new Date()
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const response = await b24.callFastListMethod(
   *   'crm.item.list',
   *   {
   *     entityTypeId: 3,
   *     filter: { '>=createdTime': sixMonthAgo }, // created at least 6 months ago
   *     select: ['id', 'name']
   *   },
   *   'id',
   *   'items',
   *   'contact-list-123'
   * )
   * if (!response.isSuccess) {
   *   throw new Error(`Failed to fetch items: ${response.getErrorMessages().join('; ')}`)
   * }
   * const list = response.getData()
   * console.log(`List: ${list?.length}`) // Number of contacts received
   *
   * @example
   * // Call with type
   * interface Task { id: number, title: string }
   * const response = await b24.callFastListMethod<Task>(
   *   'tasks.task.list',
   *   {
   *     filter: { REAL_STATUS: [2, 3] }, // Tasks in progress and pending execution
   *     select: ['ID', 'TITLE']
   *   },
   *   'id',
   *   'tasks' // The key under which the tasks are located in the response
   * )
   *
   * @see {@link callMethod} To call arbitrary API methods
   *
   * @warning This method does not support pagination.
   *
   * @see {https://bitrix24.github.io/b24jssdk/docs/hook/methods/call-fast-list-method/ Js SDK documentation}
   *
   * @todo test option `start` - pagination for ver3
   */
  public async callFastListMethod<T = unknown>(
    method: string,
    params: Omit<TypeCallParams, 'start'> = {},
    idKey: string = 'ID',
    customKeyForResult: null | string = null,
    requestId?: string
  ): Promise<Result<T[]>> {
    const result: Result<T[]> = new Result()

    const moreIdKey = `>${idKey}`
    const requestParams: TypeCallParams = {
      ...params,
      order: { ...(params['order'] || {}), [idKey]: 'ASC' },
      filter: { ...(params['filter'] || {}), [moreIdKey]: 0 },
      start: -1
    }

    let allItems: T[] = []
    let isContinue = true

    do {
      this.getLogger().debug('callFastListMethod', {
        method,
        requestId,
        requestParams
      })
      const response: AjaxResult<T> = await this.callMethod<T>(method, requestParams, requestId)

      if (!response.isSuccess) {
        this.getLogger().error('callFastListMethod', {
          method,
          requestId,
          messages: response.getErrorMessages()
        })
        result.addErrors([...response.getErrors()])
        isContinue = false
        break
      }
      const responseData = response.getData()
      if (!responseData) {
        isContinue = false
        break
      }

      let resultData: T[] = []
      if (null === customKeyForResult) {
        resultData = responseData.result as T[]
      } else {
        resultData = responseData.result[customKeyForResult] as T[]
      }

      if (resultData.length === 0) {
        isContinue = false
        break
      }

      allItems = [...allItems, ...resultData]

      if (resultData.length < AbstractB24.batchSize) {
        isContinue = false
        break
      }

      // Update the filter for the next iteration
      const lastItem = resultData[resultData.length - 1] as Record<string, any>
      if (
        lastItem
        && typeof lastItem[idKey] !== 'undefined'
      ) {
        requestParams.filter[moreIdKey] = Number.parseInt(lastItem[idKey])
      } else {
        isContinue = false
        break
      }
    } while (isContinue)

    return result.setData(allItems)
  }

  /**
   * @inheritDoc
   *
   * @template T - The type of items in the returned arrays (default is `unknown`).
   *
   * @example
   * // Iterate over all CRM contacts in chunks
   * interface CrmItem { id: number, name: string, lastName: string }
   * const sixMonthAgo = new Date()
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const generator = b24.fetchListMethod<CrmItem>(
   *   'crm.item.list',
   *   {
   *     entityTypeId: 3,
   *     filter: { '>createdTime': sixMonthAgo }, // created at least 6 months ago
   *     select: ['id', 'name', 'lastName']
   *   },
   *   'id',
   *   'items',
   *   'contact-list-123'
   * )
   *
   * for await (const chunk of generator) {
   *   console.log(`Processing ${chunk.length} contacts`)
   *   // Process chunk (e.g., save to database, analyze, etc.)
   * }
   *
   * @example
   * // Process tasks with custom type
   * interface Task { id: number; title: string }
   * const taskGenerator = b24.fetchListMethod<Task>(
   *   'tasks.task.list',
   *   { filter: { 'REAL_STATUS': 5 } }, // Completed tasks only
   *   'id'
   * )
   *
   * let totalTasks = 0
   * for await (const chunk of taskGenerator) {
   *   totalTasks += chunk.length
   *   // Process completed tasks
   * }
   * console.log(`Total completed tasks: ${totalTasks}`)
   *
   * @note The generator automatically handles pagination using the "fast algorithm"
   *     (iterating by ID ranges), which is more efficient than traditional offset-based pagination
   *     for large datasets.
   *
   * @see {@link https://apidocs.bitrix24.com/settings/performance/huge-data.html Bitrix24: Fast algorithm for large data}
   * @see {@link callFastListMethod} For single-call retrieval without pagination
   * @see {@link callMethod} To call arbitrary API methods
   * @see {https://bitrix24.github.io/b24jssdk/docs/hook/methods/fetch-list-method/ Js SDK documentation}
   *
   * @todo test option `start` - pagination for ver3
   */
  public async* fetchListMethod<T = unknown>(
    method: string,
    params: Omit<TypeCallParams, 'start'> = {},
    idKey: string = 'ID',
    customKeyForResult: null | string = null,
    requestId?: string
  ): AsyncGenerator<T[]> {
    const moreIdKey = `>${idKey}`

    const requestParams: TypeCallParams = {
      ...params,
      order: { ...(params['order'] || {}), [idKey]: 'ASC' },
      filter: { ...(params['filter'] || {}), [moreIdKey]: 0 },
      start: -1
    }

    let isContinue = true
    do {
      this.getLogger().debug('fetchListMethod', {
        method,
        requestId,
        requestParams
      })
      const response: AjaxResult<T> = await this.callMethod<T>(method, requestParams, requestId)

      if (!response.isSuccess) {
        this.getLogger().error('fetchListMethod', {
          method,
          requestId,
          messages: response.getErrorMessages()
        })

        throw new SdkError({
          code: 'JSSDK_CORE_B24_FETCH_LIST_METHOD',
          description: `API Error: ${response.getErrorMessages().join('; ')}`,
          status: 500
        })
      }
      const responseData = response.getData()
      if (!responseData) {
        isContinue = false
        break
      }

      let resultData: T[] = []
      if (null === customKeyForResult) {
        resultData = responseData.result as T[]
      } else {
        resultData = responseData.result[customKeyForResult] as T[]
      }

      if (resultData.length === 0) {
        isContinue = false
        break
      }

      yield resultData

      if (resultData.length < AbstractB24.batchSize) {
        isContinue = false
        break
      }

      // Update the filter for the next iteration
      const lastItem = resultData[resultData.length - 1] as Record<string, any>
      if (
        lastItem
        && typeof lastItem[idKey] !== 'undefined'
      ) {
        requestParams.filter[moreIdKey] = Number.parseInt(lastItem[idKey] as string)
      } else {
        isContinue = false
        break
      }
    } while (isContinue)
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
    let options: IB24BatchOptions
    if (typeof optionsOrIsHaltOnError === 'boolean' || optionsOrIsHaltOnError === undefined) {
      options = {
        isHaltOnError: optionsOrIsHaltOnError ?? true,
        returnAjaxResult: returnAjaxResult ?? false,
        returnTime: false
      }
    } else {
      options = optionsOrIsHaltOnError
    }

    options.apiVersion = options.apiVersion ?? versionManager.automaticallyObtainApiVersionForBatch(calls)

    const response = await this.getHttpClient(options.apiVersion).batch<T>(calls, options)
    // @todo fix this ////
    if (options.returnTime) {
      if (Array.isArray(calls)) {
        const result = new Result<{
          result: AjaxResult<T>[]
          time?: PayloadTime
        }>()
        if (!response.isSuccess) {
          this.getLogger().error('callBatch', {
            calls,
            options,
            messages: response.getErrorMessages()
          })
          result.addErrors([...response.getErrors()])
        }

        const dataResult: AjaxResult<T>[] = []

        for (const [_index, data] of response.getData()!.result!) {
          dataResult.push(data)
        }

        return result.setData({
          result: dataResult,
          time: response.getData()?.time
        })
      }

      const result = new Result<{
        result: Record<string | number, AjaxResult<T>>
        time?: PayloadTime
      }>()

      if (!response.isSuccess) {
        this.getLogger().error('callBatch', {
          calls,
          options,
          messages: response.getErrorMessages()
        })
        result.addErrors([...response.getErrors()])
      }

      const dataResult: Record<string | number, AjaxResult<T>> = {}

      for (const [index, data] of response.getData()!.result!) {
        dataResult[index] = data
      }

      return result.setData({
        result: dataResult,
        time: response.getData()?.time
      })
    } else if (options.returnAjaxResult) {
      if (Array.isArray(calls)) {
        const result = new Result<AjaxResult<T>[]>()
        if (!response.isSuccess) {
          this.getLogger().error('callBatch', {
            calls,
            options,
            messages: response.getErrorMessages()
          })
          result.addErrors([...response.getErrors()])
        }

        const dataResult: AjaxResult<T>[] = []

        for (const [_index, data] of response.getData()!.result!) {
          dataResult.push(data)
        }

        return result.setData(dataResult)
      }

      const result = new Result<Record<string | number, AjaxResult<T>>>()
      if (!response.isSuccess) {
        this.getLogger().error('callBatch', {
          calls,
          options,
          messages: response.getErrorMessages()
        })
        result.addErrors([...response.getErrors()])
      }

      const dataResult: Record<string | number, AjaxResult<T>> = {}

      for (const [index, data] of response.getData()!.result!) {
        dataResult[index] = data
      }
      return result.setData(dataResult)
    } else {
      const result = new Result<T>()
      if (!response.isSuccess) {
        this.getLogger().error('callBatch', {
          calls,
          options,
          messages: response.getErrorMessages()
        })
        result.addErrors([...response.getErrors()])
      }

      if (Array.isArray(calls)) {
        const dataResult = []
        for (const [_index, data] of response.getData()!.result!) {
          dataResult.push(data.getData()!.result)
        }

        return result.setData(dataResult as T)
      }

      const dataResult: Record<string, any> = {}
      for (const [index, data] of response.getData()!.result!) {
        dataResult[index] = data.getData()!.result
      }
      return result.setData(dataResult as T)
    }
  }

  public async callBatchV3<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: IB24BatchOptions
  ): Promise<CallBatchResult<T>> {
    let opts: IB24BatchOptions
    if (options === undefined) {
      opts = {
        isHaltOnError: true,
        returnAjaxResult: false,
        returnTime: false
      }
    } else {
      opts = options
    }

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

  public async callBatchV2<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: IB24BatchOptions
  ): Promise<CallBatchResult<T>> {
    let opts: IB24BatchOptions
    if (options === undefined) {
      opts = {
        isHaltOnError: true,
        returnAjaxResult: false,
        returnTime: false
      }
    } else {
      opts = options
    }

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
    optionsOrIsHaltOnError?: Omit<IB24BatchOptions, 'returnAjaxResult' | 'returnTime'> | boolean
  ): Promise<Result<T[]>> {
    let options: Omit<IB24BatchOptions, 'returnAjaxResult' | 'returnTime'>
    if (typeof optionsOrIsHaltOnError === 'boolean' || optionsOrIsHaltOnError === undefined) {
      options = {
        isHaltOnError: optionsOrIsHaltOnError ?? true
      }
    } else {
      options = optionsOrIsHaltOnError
    }

    options.apiVersion = options.apiVersion ?? versionManager.automaticallyObtainApiVersionForBatch(calls)

    const result = new Result<T[]>()

    const dataResult: T[] = []
    const chunks = this.chunkArray(calls as BatchCommandsUniversal, AbstractB24.batchSize) as BatchCommandsArrayUniversal[] | BatchCommandsObjectUniversal[]

    for (const chunkRequest of chunks) {
      const response = await this.getHttpClient(options.apiVersion).batch<T[]>(chunkRequest, options)
      if (!response.isSuccess) {
        this.getLogger().error('callBatchByChunk', {
          calls,
          options,
          messages: response.getErrorMessages()
        })
        result.addErrors([...response.getErrors()])
      }

      for (const [_index, data] of response.getData()!.result!) {
        dataResult.push(data.getData()!.result)
      }
    }

    return result.setData(dataResult)
  }

  public async callBatchByChunkV3<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options?: Omit<IB24BatchOptions, 'returnAjaxResult' | 'returnTime'>
  ): Promise<Result<T[]>> {
    let opts: Omit<IB24BatchOptions, 'returnAjaxResult' | 'returnTime'>
    if (options === undefined) {
      opts = {
        isHaltOnError: true
      }
    } else {
      opts = options
    }

    opts.apiVersion = ApiVersion.v3

    return this.callBatchByChunk<T>(calls, opts)
  }

  public async callBatchByChunkV2<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options?: Omit<IB24BatchOptions, 'returnAjaxResult' | 'returnTime'>
  ): Promise<Result<T[]>> {
    let opts: Omit<IB24BatchOptions, 'returnAjaxResult' | 'returnTime'>
    if (options === undefined) {
      opts = {
        isHaltOnError: true
      }
    } else {
      opts = options
    }

    opts.apiVersion = ApiVersion.v2

    return this.callBatchByChunk<T>(calls, opts)
  }
  // endregion ////

  // region Utility Methods ////
  /**
   * @inheritDoc
   *
   * @note The method uses a minimal API request (`server.time`) to check availability.
   *   Does not overload the server with large amounts of data.
   *
   * @see {@link ping} To measure API response speed
   *
   * @todo use apiVer3
   */
  public async healthCheck(requestId?: string): Promise<boolean> {
    try {
      const response = await this.callV2('server.time', {}, requestId)
      return response.isSuccess
    } catch {
      return false
    }
  }

  /**
   * @inheritDoc
   *
   * @note The method uses a minimal API request (`server.time`).
   *   Does not overload the server with large amounts of data.
   * @warning Response time may vary depending on server load, network conditions
   *     and API client settings (timeouts, retries).
   * @tip For consistent results, it is recommended to perform multiple measurements
   *     and use the median value.
   *
   * @see {@link healthCheck} To check API availability
   *
   * @todo use apiVer3
   */
  public async ping(requestId?: string): Promise<number> {
    const startTime = Date.now()

    try {
      await this.callV2('server.time', {}, requestId)
      return Date.now() - startTime
    } catch {
      return -1
    }
  }
  // endregion ////

  // region Tools ////
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

  // region Auth Auto Refresher ////
  /**
   * Sets up automatic renewal of authorization
   */
  public setupAuthRefresh(config?: AutoRefreshConfig, logger?: LoggerInterface): AutoAuthRefresher {
    // We stop the existing one
    if (this._autoAuthRefresher) {
      this._autoAuthRefresher.destroy()
    }

    // Let's create a new one
    this._autoAuthRefresher = new AutoAuthRefresher(
      this.auth,
      {
        onRefresh: (authData: AuthData) => {
          this.getLogger().notice('The token has been automatically updated', {
            domain: authData.domain,
            expires: authData.expires,
            expires_in: authData.expires_in
          })
        },
        onError: (error) => {
          this.getLogger().warning('Automatic token update error', { error })
        },
        ...config
      },
      logger || this.getLogger()
    )

    return this._autoAuthRefresher
  }

  /**
   * Starts automatic renewal of authorization
   */
  public startAuthRefresh(): void {
    if (!this._autoAuthRefresher) {
      this.setupAuthRefresh()
    }

    this._autoAuthRefresher!.start()
  }

  /**
   * Stops automatic renewal of authorization
   */
  public stopAuthRefresh(): void {
    if (this._autoAuthRefresher) {
      this._autoAuthRefresher.stop()
    }
  }

  /**
   * Returns authorization auto-renewal statistics
   */
  public getAuthRefreshStats(): AutoRefreshStats | null {
    return this._autoAuthRefresher?.stats || null
  }

  /**
   * Clears auto-renewal authorization resources
   */
  public destroyAuthRefresh(): void {
    if (this._autoAuthRefresher) {
      this._autoAuthRefresher.destroy()
      this._autoAuthRefresher = null
    }
  }
  // endregion ////
}
