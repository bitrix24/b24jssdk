import { LoggerBrowser, LoggerType } from '../logger/browser'
import { Result } from './result'
import type { AjaxResult } from './http/ajax-result'
import Type from './../tools/type'
import type { TypeB24 } from '../types/b24'
import type { TypeHttp } from '../types/http'
import type { ListPayload } from '../types/payloads'
import type { AuthActions } from '../types/auth'

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
   */
  callMethod<T = unknown>(
    method: string,
    params?: object,
    start?: number
  ): Promise<AjaxResult<T>> {
    return this.getHttpClient().call<T>(method, params || {}, start || 0)
  }

  /**
   * @deprecate: use callFastListMethod()
   * @inheritDoc
   */
  async callListMethod(
    method: string,
    params: object = {},
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
   */
  async callFastListMethod<T = unknown>(
    method: string,
    params: {
      order?: any
      filter?: any
      [key: string]: any
    } = {},
    idKey: string = 'ID',
    customKeyForResult: null | string = null
  ): Promise<Result<T[]>> {
    const result: Result<T[]> = new Result()

    const moreIdKey = `>${idKey}`
    const requestParams = {
      ...params,
      order: { ...(params.order || {}), [idKey]: 'ASC' },
      filter: { ...(params.filter || {}), [moreIdKey]: 0 },
      start: -1
    }

    let allItems: T[] = []
    let isContinue = true

    do {
      this.getLogger().log({ method, requestParams })
      const response: AjaxResult<T> = await this.callMethod<T>(method, requestParams, -1)

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
   */
  async* fetchListMethod<T = unknown>(
    method: string,
    params: {
      order?: any
      filter?: any
      [key: string]: any
    } = {},
    idKey: string = 'ID',
    customKeyForResult: null | string = null
  ): AsyncGenerator<T[]> {
    const moreIdKey = `>${idKey}`

    const requestParams = {
      ...params,
      order: { ...(params.order || {}), [idKey]: 'ASC' },
      filter: { ...(params.filter || {}), [moreIdKey]: 0 },
      start: -1
    }

    let isContinue = true
    do {
      this.getLogger().log({ method, requestParams })
      const response: AjaxResult<T> = await this.callMethod<T>(method, requestParams, -1)

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
  async callBatch(
    calls: Array<any> | Record<string, any>,
    isHaltOnError: boolean = true,
    returnAjaxResult: boolean = false
  ): Promise<Result> {
    return this.getHttpClient().batch(calls, isHaltOnError, returnAjaxResult)
  }

  chunkArray<T>(array: T[], chunkSize: number = 50): T[][] {
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
  async callBatchByChunk(
    calls: Array<any>,
    isHaltOnError: boolean = true
  ): Promise<Result> {
    const result = new Result()

    const data = []
    const chunks = this.chunkArray(calls, AbstractB24.batchSize)

    for (const chunkRequest of chunks) {
      const response = await this.callBatch(chunkRequest, isHaltOnError)
      data.push(...response.getData())
    }

    return result.setData(data)
  }
  // endregion ////

  // region Tools ////
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
