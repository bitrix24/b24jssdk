import { LoggerBrowser, LoggerType } from '../logger/browser'
import { Result } from './result'
import { Type } from './../tools/type'
import type { AjaxResult } from './http/ajax-result'
import type { TypeB24, IB24BatchOptions } from '../types/b24'
import type { TypeHttp, BatchCommandsUniversal, BatchCommandsArrayUniversal, BatchCommandsObjectUniversal, BatchNamedCommandsUniversal, ICallBatchOptions, TypeCallParams } from '../types/http'
import type { ListPayload, PayloadTime } from '../types/payloads'
import type { AuthActions } from '../types/auth'

/**
 * @todo docs
 * @todo test all example
 */
export abstract class AbstractB24 implements TypeB24 {
  static readonly batchSize = 50

  protected _isInit: boolean = false
  protected _http: null | TypeHttp = null
  protected _logger: null | LoggerBrowser = null

  // region Init ////
  protected constructor() {
    this._isInit = false
  }

  /**
   * @inheritDoc
   */
  get isInit(): boolean {
    return this._isInit
  }

  async init(): Promise<void> {
    this._isInit = true
    return
  }

  destroy(): void {}

  public setLogger(logger: LoggerBrowser): void {
    this._logger = logger
    this.getHttpClient().setLogger(this.getLogger())
  }

  public getLogger(): LoggerBrowser {
    if (null === this._logger) {
      this._logger = LoggerBrowser.build(`NullLogger`)

      this._logger.setConfig({
        [LoggerType.desktop]: false,
        [LoggerType.log]: false,
        [LoggerType.info]: false,
        [LoggerType.warn]: false,
        [LoggerType.error]: true,
        [LoggerType.trace]: false
      })
    }

    return this._logger
  }
  // endregion ////

  // region Core ////
  abstract get auth(): AuthActions

  /**
   * @inheritDoc
   */
  abstract getTargetOrigin(): string

  /**
   * @inheritDoc
   */
  abstract getTargetOriginWithPath(): string

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
  callMethod<T = unknown>(
    method: string,
    params?: TypeCallParams,
    requestId?: string
  ): Promise<AjaxResult<T>> {
    params = params || {}
    return this.getHttpClient().call<T>(method, params, requestId)
  }

  /**
   * @deprecate: use callFastListMethod()
   * @todo test start
   */
  async callListMethod(
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
    return this.callMethod(method, sendParams).then(async (response) => {
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
          responseLoop = await responseLoop.getNext(this.getHttpClient())

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
   */
  async callFastListMethod<T = unknown>(
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
      this.getLogger().log({ method, requestParams })
      const response: AjaxResult<T> = await this.callMethod<T>(method, requestParams, requestId)

      if (!response.isSuccess) {
        this.getLogger().error(response.getErrorMessages())
        result.addErrors([...response.getErrors()])
        isContinue = false
        break
      }

      let resultData: T[] = []
      if (null === customKeyForResult) {
        resultData = response.getData().result as T[]
      } else {
        resultData = response.getData().result[customKeyForResult] as T[]
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
   */
  async* fetchListMethod<T = unknown>(
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
      this.getLogger().log({ method, requestParams })
      const response: AjaxResult<T> = await this.callMethod<T>(method, requestParams, requestId)

      if (!response.isSuccess) {
        this.getLogger().error(response.getErrorMessages())
        throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
      }

      let resultData: T[] = []
      if (null === customKeyForResult) {
        resultData = response.getData().result as T[]
      } else {
        resultData = response.getData().result[customKeyForResult] as T[]
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
   * @todo test results
   */
  async callBatch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    optionsOrIsHaltOnError?: IB24BatchOptions | boolean,
    returnAjaxResult?: boolean,
    returnTime?: boolean
  ): Promise<Result<{ result: Record<string | number, AjaxResult<T>> | AjaxResult<T>[], time?: PayloadTime }> | Result<Record<string | number, AjaxResult<T>> | AjaxResult<T>[]> | Result<T>> {
    let options: IB24BatchOptions
    if (typeof optionsOrIsHaltOnError === 'boolean' || optionsOrIsHaltOnError === undefined) {
      options = {
        isHaltOnError: optionsOrIsHaltOnError ?? true,
        returnAjaxResult: returnAjaxResult ?? false,
        returnTime: returnTime ?? false
      }
    } else {
      options = optionsOrIsHaltOnError
    }

    const response = await this.getHttpClient().batch<T>(calls, options)

    if (options.returnTime) {
      if (Array.isArray(calls)) {
        const result = new Result<{
          result: AjaxResult<T>[]
          time?: PayloadTime
        }>()
        if (!response.isSuccess) {
          this.getLogger().error(response.getErrorMessages())
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
        this.getLogger().error(response.getErrorMessages())
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
          this.getLogger().error(response.getErrorMessages())
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
        this.getLogger().error(response.getErrorMessages())
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
        this.getLogger().error(response.getErrorMessages())
        result.addErrors([...response.getErrors()])
      }

      if (Array.isArray(calls)) {
        const dataResult = []
        for (const [_index, data] of response.getData()!.result!) {
          dataResult.push(data.getData().result)
        }

        return result.setData(dataResult as T)
      }

      const dataResult: Record<string, any> = {}
      for (const [index, data] of response.getData()!.result!) {
        dataResult[index] = data.getData().result
      }
      return result.setData(dataResult as T)
    }
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
  async callBatchByChunk<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    optionsOrIsHaltOnError?: ICallBatchOptions | boolean
  ): Promise<Result<T[]>> {
    let options: IB24BatchOptions
    if (typeof optionsOrIsHaltOnError === 'boolean' || optionsOrIsHaltOnError === undefined) {
      options = {
        isHaltOnError: optionsOrIsHaltOnError ?? true
      }
    } else {
      options = optionsOrIsHaltOnError
    }

    const result = new Result<T[]>()

    const dataResult: T[] = []
    const chunks = this.chunkArray(calls as BatchCommandsUniversal, AbstractB24.batchSize) as BatchCommandsArrayUniversal[] | BatchCommandsObjectUniversal[]

    for (const chunkRequest of chunks) {
      const response = await this.getHttpClient().batch<T[]>(chunkRequest, options)
      if (!response.isSuccess) {
        this.getLogger().error(response.getErrorMessages())
        result.addErrors([...response.getErrors()])
      }

      for (const [_index, data] of response.getData()!.result!) {
        dataResult.push(data.getData().result)
      }
    }

    return result.setData(dataResult)
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
   */
  async healthCheck(requestId?: string): Promise<boolean> {
    try {
      const response = await this.callMethod('server.time', {}, requestId)
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
   */
  async ping(requestId?: string): Promise<number> {
    const startTime = Date.now()

    try {
      await this.callMethod('server.time', {}, requestId)
      return Date.now() - startTime
    } catch {
      return -1
    }
  }
  // endregion ////

  // region Tools ////
  chunkArray<T = unknown>(array: Array<T>, chunkSize: number = 50): T[][] {
    const result: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      const chunk = array.slice(i, i + chunkSize)
      result.push(chunk)
    }
    return result
  }

  /**
   * @inheritDoc
   */
  getHttpClient(): TypeHttp {
    if (!this.isInit || null === this._http) {
      throw new Error(`Http not init`)
    }

    return this._http
  }

  /**
   * @inheritDoc
   */
  setHttpClient(client: TypeHttp): void {
    this._http = client
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
      throw new Error('B24 not initialized')
    }
  }
  // endregion ////
}
