import { LoggerBrowser, LoggerType } from '../../logger/browser'
import RequestIdGenerator from './request-id-generator'
import { RestrictionManager } from './limiters/manager'
import { Result } from '../result'
import { AjaxError } from './ajax-error'
import { AjaxResult } from './ajax-result'
import Type from '../../tools/type'
import type {
  TypeHttp,
  ICallBatchOptions,
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  ICallBatchResult
} from '../../types/http'
import type {
  RestrictionManagerStats,
  RestrictionParams
} from '../../types/limiters'
import type { AjaxQuery, AjaxResultParams } from './ajax-result'
import type {
  AuthActions,
  AuthData,
  TypeDescriptionError
} from '../../types/auth'
import type { BatchPayload, PayloadTime } from '../../types/payloads'
import axios, { type AxiosInstance, AxiosError } from 'axios'
import * as qs from 'qs-esm'

type AjaxResponse<T = unknown> = {
  status: number
  payload: AjaxResultParams<T>
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BITRIX24_OAUTH_SERVER_URL = 'https://oauth.bitrix.info'

/**
 * Class for working with RestApi requests via http
 * @todo перевод
 * @todo docs
 * @link https://dev.1c-bitrix.ru/rest_help/
 */
export default class Http implements TypeHttp {
  #clientAxios: AxiosInstance
  #authActions: AuthActions
  #requestIdGenerator: RequestIdGenerator
  #restrictionManager: RestrictionManager

  private _logger: null | LoggerBrowser = null

  #logTag: string = ''
  #isClientSideWarning: boolean = false
  #clientSideWarningMessage: string = ''

  constructor(
    baseURL: string,
    authActions: AuthActions,
    options?: null | object,
    restrictionParams?: Partial<RestrictionParams>
  ) {
    const defaultHeaders = {
      // 'X-Sdk': '__SDK_USER_AGENT__-v-__SDK_VERSION__'
    }

    this.#clientAxios = axios.create({
      baseURL: baseURL,
      headers: {
        ...defaultHeaders,
        ...(options ? (options as any).headers : {})
      },
      ...(options && { ...options, headers: undefined })
    })

    this.#authActions = authActions
    this.#requestIdGenerator = new RequestIdGenerator()

    /**
     * // fix-fix
     * Основные параметры ограничений
     * @see RestrictionParamsFactory.getDefault
     */
    const params: RestrictionParams = {
      rateLimit: { burstLimit: 50, drainRate: 2 },
      operatingLimit: { windowMs: 600_000, limitMs: 480_000, heavyPercent: 80 },
      adaptiveConfig: { enabled: true, thresholdPercent: 80, coefficient: 0.01, maxDelay: 7_000 },
      maxRetries: 3,
      retryDelay: 1_000,
      ...restrictionParams
    }

    this.#restrictionManager = new RestrictionManager(params)
  }

  // region Logger ////
  setLogger(logger: LoggerBrowser): void {
    this._logger = logger
    this.#restrictionManager.setLogger(this._logger)
  }

  getLogger(): LoggerBrowser {
    if (null === this._logger) {
      this._logger = LoggerBrowser.build(`NullLogger`)

      this._logger.setConfig({
        [LoggerType.desktop]: false,
        [LoggerType.log]: false,
        [LoggerType.info]: false,
        [LoggerType.warn]: true,
        [LoggerType.error]: true,
        [LoggerType.trace]: false
      })
    }

    return this._logger
  }
  // endregion ////

  // region RestrictionManager методы ////
  async setRestrictionManagerParams(params: RestrictionParams): Promise<void> {
    await this.#restrictionManager.setConfig(params)
  }

  getRestrictionManagerParams(): RestrictionParams {
    return this.#restrictionManager.getParams()
  }

  /**
   * @inheritDoc
   */
  getStats(): RestrictionManagerStats & {
    adaptiveDelayAvg: number
    errorCounts: Record<string, number>
  } {
    return this.#restrictionManager.getStats()
  }

  /**
   * @inheritDoc
   */
  async reset(): Promise<void> {
    return this.#restrictionManager.reset()
  }
  // endregion ////

  // region LogTag ////
  setLogTag(logTag: string): void {
    this.#logTag = logTag
  }

  clearLogTag(): void {
    this.#logTag = ''
  }
  // endregion ////

  // region Actions Call ////
  async batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    if (options === undefined) {
      options = {
        isHaltOnError: true
      }
    }

    if (Array.isArray(calls)) {
      return this.#batchAsArray(calls, options)
    }

    return this.#batchAsObject(calls, options)
  }

  async #batchAsObject<T = unknown>(
    calls: BatchNamedCommandsUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const { isHaltOnError = true } = options
    const cmd: any = {}
    let cnt = 0

    const processRow = (row: any, index: string | number) => {
      let method = null
      let params = null

      if (row.method) {
        method = row.method ?? null
        params = row?.params ?? null
      } else if (Array.isArray(row) && row.length > 0) {
        method = row[0] ?? null
        params = row[1] ?? null
      }

      if (method) {
        cnt++

        cmd[index] = method + '?' + qs.stringify(params)
      }
    }

    for (const [index, row] of Object.entries(calls)) {
      processRow(row, index)
    }

    if (cnt < 1) {
      return Promise.resolve(new Result())
    }

    return this.call('batch', {
      halt: isHaltOnError ? 1 : 0,
      cmd
    }).then(async (response: AjaxResult): Promise<Result<ICallBatchResult<T>>> => {
      const responseResult = (response.getData() as BatchPayload<unknown>).result
      const responseTime = (response.getData() as BatchPayload<unknown>).time
      const results: Record<string | number, AjaxResult<T>> = {}
      const dataResult: Record<string | number, AjaxResult<T>> = {}
      const result = new Result<{
        result?: Record<string | number, AjaxResult<T>>
        time?: PayloadTime
      }>()

      const processResponse = async (row: string, index: string | number) => {
        if (
          // @ts-expect-error this code work success
          typeof responseResult.result[index] !== 'undefined'
          // @ts-expect-error this code work success
          || typeof responseResult.result_error[index] !== 'undefined'
        ) {
          const q = row.split('?')
          const methodName = q[0] || ''

          // Обновляем operating статистику для каждого метода в batch
          // @ts-expect-error this code work success
          if (responseResult.result_time && responseResult.result_time[index]) {
            // @ts-expect-error this code work success
            const timeData = responseResult.result_time[index]
            await this.#restrictionManager.updateStats(`batch::${methodName}`, timeData)
          }

          results[index] = new AjaxResult({
            answer: {
              // @ts-expect-error this code work success
              result: Type.isUndefined(responseResult.result[index])
                ? {}
                // @ts-expect-error this code work success
                : responseResult.result[index],
              // @ts-expect-error this code work success
              error: responseResult?.result_error[index] || undefined,
              // @ts-expect-error this code work success
              total: responseResult.result_total[index],
              // @ts-expect-error this code work success
              next: responseResult.result_next[index],
              // @ts-expect-error this code work success
              time: responseResult.result_time[index]
            },
            query: {
              method: methodName,
              params: qs.parse(q[1] || ''),
              start: 0
            } as AjaxQuery,
            status: response.getStatus()
          })
        }
      }

      const initError = (result: AjaxResult): AjaxError => {
        if (result.hasError('base-error')) {
          return result.errors.get('base-error') as AjaxError
        }

        return new AjaxError({
          code: '0',
          description: result.getErrorMessages().join('; '),
          status: 0,
          requestInfo: {
            method: result.getQuery().method,
            params: result.getQuery().params
          },
          originalError: result.getErrors().next().value
        })
      }

      for (const [index, row] of Object.entries(cmd)) {
        await processResponse(row as string, index)
      }

      for (const key of Object.keys(results)) {
        const data = results[key]

        if (data.getStatus() !== 200 || !data.isSuccess) {
          const error = initError(data)

          /*
           * Тут должен быть код аналогичный #isOperatingLimitError с проверкой ошибки 'Method is blocked due to operation time limit.'
           * Однако `batch` исполняется без повторных попыток, по этой причине будет сразу ошибка
           */

          if (!isHaltOnError && !data.isSuccess) {
            result.addError(error, key)
            continue
          }

          return Promise.reject(error)
        }

        dataResult[key] = data
      }

      result.setData({
        result: dataResult,
        time: responseTime
      })

      return Promise.resolve(result)
    })
  }

  async #batchAsArray<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const { isHaltOnError = true } = options

    const cmd: string[] = []
    let cnt = 0

    const processRow = (row: any) => {
      let method = null
      let params = null

      if (row.method) {
        method = row.method ?? null
        params = row?.params ?? null
      } else if (Array.isArray(row) && row.length > 0) {
        method = row[0] ?? null
        params = row[1] ?? null
      }

      if (method) {
        cnt++

        const data = method + '?' + qs.stringify(params)
        cmd.push(data)
      }
    }

    for (const [_, row] of calls.entries()) {
      processRow(row)
    }

    if (cnt < 1) {
      return Promise.resolve(new Result())
    }

    return this.call('batch', {
      halt: isHaltOnError ? 1 : 0,
      cmd
    }).then(async (response: AjaxResult): Promise<Result<ICallBatchResult<T>>> => {
      const responseResult = (response.getData() as BatchPayload<unknown>).result
      const responseTime = (response.getData() as BatchPayload<unknown>).time
      const results: AjaxResult<T>[] = []
      const dataResult: AjaxResult<T>[] = []
      const result = new Result<{
        result?: AjaxResult<T>[]
        time?: PayloadTime
      }>()

      const processResponse = async (row: string, index: string | number) => {
        if (
          // @ts-expect-error this code work success
          typeof responseResult.result[index] !== 'undefined'
          // @ts-expect-error this code work success
          || typeof responseResult.result_error[index] !== 'undefined'
        ) {
          const q = row.split('?')
          const methodName = q[0] || ''

          // Обновляем operating статистику для каждого метода в batch
          // @ts-expect-error this code work success
          if (responseResult.result_time && responseResult.result_time[index]) {
            // @ts-expect-error this code work success
            const timeData = responseResult.result_time[index]
            await this.#restrictionManager.updateStats(`batch::${methodName}`, timeData)
          }

          const data = new AjaxResult({
            answer: {
              // @ts-expect-error this code work success
              result: Type.isUndefined(responseResult.result[index])
                ? {}
                // @ts-expect-error this code work success
                : responseResult.result[index],
              // @ts-expect-error this code work success
              error: responseResult?.result_error[index] || undefined,
              // @ts-expect-error this code work success
              total: responseResult.result_total[index],
              // @ts-expect-error this code work success
              next: responseResult.result_next[index],
              // @ts-expect-error this code work success
              time: responseResult.result_time[index]
            },
            query: {
              method: methodName,
              params: qs.parse(q[1] || ''),
              start: 0
            } as AjaxQuery,
            status: response.getStatus()
          })

          results.push(data)
        }
      }

      const initError = (result: AjaxResult): AjaxError => {
        if (result.hasError('base-error')) {
          return result.errors.get('base-error') as AjaxError
        }

        return new AjaxError({
          code: '0',
          description: result.getErrorMessages().join('; '),
          status: 0,
          requestInfo: {
            method: result.getQuery().method,
            params: result.getQuery().params
          },
          originalError: result.getErrors().next().value
        })
      }

      for (const [index, row] of cmd.entries()) {
        await processResponse(row, index)
      }

      for (const data of results) {
        if (data.getStatus() !== 200 || !data.isSuccess) {
          const error = initError(data)

          /*
           * Тут должен быть код аналогичный #isOperatingLimitError с проверкой ошибки 'Method is blocked due to operation time limit.'
           * Однако `batch` исполняется без повторных попыток, по этой причине будет сразу ошибка
           */

          if (!isHaltOnError && !data.isSuccess) {
            result.addError(error)
            continue
          }

          return Promise.reject(error)
        }

        dataResult.push(data)
      }

      result.setData({
        result: dataResult,
        time: responseTime
      })

      return Promise.resolve(result)
    })
  }

  /**
   * // fix
   * Calling the RestApi function with adaptive delays and rate limiting
   */
  async call<T = unknown>(
    method: string,
    params: object,
    start: number = 0
  ): Promise<AjaxResult<T>> {
    const maxRetries = this.#restrictionManager.getParams().maxRetries!

    // baseRetryDelay = this.#restrictionParams.retryDelay!

    let lastError = null
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Применяем operating лимиты через менеджер
        await this.#restrictionManager.applyOperatingLimits(method, params)

        // 3. Выполняем запрос с учетом авторизации, rate limit, обновляем operating статистики
        const result = await this.#executeSingleCall<T>(method, params, start)

        // 6. Обновляем статистику
        this.#restrictionManager.incrementStats('totalRequests')
        this.#restrictionManager.resetErrors(method)

        return result
      } catch (error: any) {
        lastError = error

        this.#restrictionManager.incrementStats('totalRequests')
        this.#restrictionManager.incrementError(method)

        if (attempt < maxRetries - 1) {
          const waitTime = await this.#restrictionManager.handleError(method, params, error, attempt)
          if (waitTime > 0) {
            this.#restrictionManager.incrementStats('limitHits')

            this.getLogger().warn(
              `Ждем ${(waitTime / 1000).toFixed(2)} sec.`,
              `(попытка ${attempt + 1}/${maxRetries})`
            )
            await this.#restrictionManager.waiteDelay(waitTime)

            this.#restrictionManager.incrementStats('retries')

            continue
          }
        }

        // Выбрасываем исключение - больше попыток не будет
        throw error
      }
    }

    throw new AjaxError({
      code: '[JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED]',
      description: 'Все поппытки исчерпаны',
      status: 500,
      requestInfo: {
        method,
        params
      },
      originalError: lastError
    })
  }

  /**
   * Выполняет одиночный вызов с
   * - обработкой 401 ошибки
   * - проверкой rate limit
   * - обновляем operating статистики
   */
  async #executeSingleCall<T = unknown>(
    method: string,
    params: object,
    start: number = 0
  ): Promise<AjaxResult<T>> {
    let authData = this.#authActions.getAuthData()
    if (authData === false) {
      authData = await this.#authActions.refreshAuth()
    }

    // 4. Применяем rate лимит через менеджер
    await this.#restrictionManager.checkRateLimit(method)

    if (
      this.#isClientSideWarning
      && !this.isServerSide()
      && Type.isStringFilled(this.#clientSideWarningMessage)
    ) {
      this.getLogger().warn(this.#clientSideWarningMessage)
    }

    return this.#clientAxios
      .post(
        this.#prepareMethod(method),
        this.#prepareParams(authData, params, start)
      )
      .then(
        (response: {
          data: AjaxResultParams
          status: any
        }): Promise<AjaxResponse<T>> => {
          const payload = response.data as AjaxResultParams<T>
          return Promise.resolve({
            status: response.status,
            payload
          } as AjaxResponse<T>)
        },
        async (_error: AxiosError) => {
          let answerError = {
            error: _error?.code || 0,
            errorDescription: _error?.message || ''
          }

          if (
            _error instanceof AxiosError
            && _error.response
            && _error.response.data
            && !Type.isUndefined((_error.response.data as TypeDescriptionError).error)
          ) {
            const response = _error.response.data as {
              error: string
              error_description: string
            } as TypeDescriptionError

            answerError = {
              error: response.error,
              errorDescription: response.error_description
            }
          }

          const problemError: AjaxError = new AjaxError({
            code: String(answerError.error),
            description: answerError.errorDescription,
            status: _error.response?.status || 0,
            requestInfo: {
              method: method,
              params: params
            },
            originalError: _error
          })

          /**
           * Is response status === 401 -> refresh Auth?
           */
          if (
            problemError.status === 401
            && ['expired_token', 'invalid_token'].includes(
              problemError.message
            )
          ) {
            this.getLogger().info('refreshAuth', problemError.message)

            authData = await this.#authActions.refreshAuth()

            // 4. Применяем rate лимит через менеджер
            await this.#restrictionManager.checkRateLimit(method)

            return this.#clientAxios
              .post(
                this.#prepareMethod(method),
                this.#prepareParams(authData, params, start)
              )
              .then(
                async (response: {
                  data: AjaxResultParams
                  status: any
                }): Promise<AjaxResponse<T>> => {
                  const payload = response.data as AjaxResultParams<T>
                  return Promise.resolve({
                    status: response.status,
                    payload
                  } as AjaxResponse<T>)
                },
                async (__error: AxiosError) => {
                  let answerError = {
                    error: __error?.code || 0,
                    errorDescription: __error?.message || ''
                  }

                  if (
                    __error instanceof AxiosError
                    && __error.response
                    && __error.response.data
                  ) {
                    const response = __error.response.data as {
                      error: string
                      error_description: string
                    } as TypeDescriptionError

                    answerError = {
                      error: response.error,
                      errorDescription: response.error_description
                    }
                  }

                  const problemError: AjaxError = new AjaxError({
                    code: String(answerError.error),
                    description: answerError.errorDescription,
                    status: _error.response?.status || 0,
                    requestInfo: {
                      method: method,
                      params: params
                    },
                    originalError: __error
                  })

                  return Promise.reject(problemError)
                }
              )
          }

          return Promise.reject(problemError)
        }
      )
      .then(async (response: AjaxResponse<T>): Promise<AjaxResult<T>> => {
        const result = new AjaxResult<T>({
          answer: response.payload,
          query: {
            method,
            params,
            start
          } as AjaxQuery,
          status: response.status
        })

        // 5. Обновляем operating статистику
        if (response.payload?.time) {
          await this.#restrictionManager.updateStats(method, response.payload.time)
        }

        return Promise.resolve(result)
      })
  }
  // endregion ////

  // region Prepare ////
  /**
   * Processes function parameters and adds authorization
   */
  #prepareParams(authData: AuthData, params: any, start: number = 0): object {
    const result = Object.assign({}, params)

    if (this.#logTag.length > 0) {
      result.logTag = this.#logTag
    }

    // result[this.#requestIdGenerator.getQueryStringParameterName()] = this.#requestIdGenerator.getRequestId()
    // result[this.#requestIdGenerator.getQueryStringSdkParameterName()] = '__SDK_VERSION__'

    if (!!result.data && !!result.data.start) {
      delete result.data.start
    }

    /**
     * @memo we skip auth for hook
     */
    if (authData.refresh_token !== 'hook') {
      result.auth = authData.access_token
    }

    result.start = start

    return result
  }

  /**
   * Makes the function name safe and adds JSON format
   */
  #prepareMethod(method: string): string {
    const baseUrl = `${encodeURIComponent(method)}.json`

    /**
     * @memo For task methods, skip telemetry
     * @see https://apidocs.bitrix24.com/settings/how-to-call-rest-api/data-encoding.html#order-of-parameters
     */
    if (method.includes('task.')) {
      return `${baseUrl}`
    }

    const queryParams = new URLSearchParams({
      [this.#requestIdGenerator.getQueryStringParameterName()]: this.#requestIdGenerator.getRequestId(),
      [this.#requestIdGenerator.getQueryStringSdkParameterName()]: '__SDK_VERSION__',
      [this.#requestIdGenerator.getQueryStringSdkTypeParameterName()]: '__SDK_USER_AGENT__'
    })
    return `${baseUrl}?${queryParams.toString()}`
  }

  /**
   * @inheritDoc
   */
  public setClientSideWarning(
    value: boolean,
    message: string
  ): void {
    this.#isClientSideWarning = value
    this.#clientSideWarningMessage = message
  }

  // endregion ////

  // region Tools ////
  /**
   * Tests whether the code is executed on the client side
   * @return {boolean}
   * @protected
   */
  protected isServerSide(): boolean {
    return typeof window === 'undefined'
  }

  // endregion ////
}
