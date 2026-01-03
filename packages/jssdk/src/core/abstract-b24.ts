import { LoggerBrowser, LoggerType } from '../logger/browser'
import { Result } from './result'
import type { AjaxResult } from './http/ajax-result'
import Type from './../tools/type'
import type { TypeB24, IB24BatchOptions } from '../types/b24'
import type {
  TypeHttp,
  BatchCommandsUniversal,
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  ICallBatchOptions,
  TypeCallParams
} from '../types/http'
import type { ListPayload, PayloadTime } from '../types/payloads'
import type { AuthActions } from '../types/auth'

/**
 * @todo перевод
 * @todo docs
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
   * Calling the RestApi function
   * @todo test start
   * @param method - REST API method name
   * @param params - Parameters for the method. If params.start exists,
   *                 it will be used unless explicit start parameter is provided.
   * @param start - Explicit start value (takes priority over params.start)
   * @returns Promise with AjaxResult
   * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-method.html
   * @example
   * // Using explicit start parameter
   * b24.callMethod('method', { filter: {...} }, 50) // Uses 50
   *
   * // Using start in params
   * b24.callMethod('method', { filter: {...}, start: 100 }) // Uses 100
   *
   * // Explicit start has priority
   * b24.callMethod('method', { filter: {...}, start: 100 } , 50) // Uses 50
   */
  callMethod<T = unknown>(
    method: string,
    params?: TypeCallParams,
    start?: number
  ): Promise<AjaxResult<T>> {
    return this.getHttpClient().call<T>(method, params || {}, start)
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

    return this.callMethod(method, params, 0).then(async (response) => {
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
   * @todo test start
   */
  async callFastListMethod<T = unknown>(
    method: string,
    params: Omit<TypeCallParams, 'start'> = {},
    idKey: string = 'ID',
    customKeyForResult: null | string = null
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
      const response: AjaxResult<T> = await this.callMethod<T>(method, requestParams) // , -1

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
   * @todo test start
   */
  async* fetchListMethod<T = unknown>(
    method: string,
    params: Omit<TypeCallParams, 'start'> = {},
    idKey: string = 'ID',
    customKeyForResult: null | string = null
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
      const response: AjaxResult<T> = await this.callMethod<T>(method, requestParams) // , -1

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
   */
  async callBatch<T = any>(
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
   */
  async callBatchByChunk<T = any>(
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
