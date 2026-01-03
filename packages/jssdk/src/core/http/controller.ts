import { LoggerBrowser, LoggerType } from '../../logger/browser'
import RequestIdGenerator from './request-id-generator'
import { ParamsFactory } from './limiters/params-factory'
import { RestrictionManager } from './limiters/manager'
import { Result } from '../result'
import { AjaxError } from './ajax-error'
import { AjaxResult } from './ajax-result'
import Type from '../../tools/type'
import type { TypeCallParams, TypeHttp, ICallBatchOptions, BatchCommandsArrayUniversal, BatchCommandsObjectUniversal, BatchNamedCommandsUniversal, CommandObject, CommandTuple, ICallBatchResult } from '../../types/http'
import type { RestrictionManagerStats, RestrictionParams } from '../../types/limiters'
import type { AjaxQuery, AjaxResultParams } from './ajax-result'
import type { AuthActions, AuthData, TypeDescriptionError } from '../../types/auth'
import type { BatchPayload, BatchPayloadResult, PayloadTime } from '../../types/payloads'
import type { NumberString } from '../../types/common'
import axios, { type AxiosInstance, AxiosError } from 'axios'
import * as qs from 'qs-esm'

type AjaxResponse<T = unknown> = {
  status: number
  payload: AjaxResultParams<T>
}

type TypePrepareParams = TypeCallParams & {
  data?: Record<string, any>
  logTag?: string
  auth?: string
}

interface BatchResponseData<T = unknown> {
  readonly result?: T[] | Record<string | number, T>
  readonly result_error?: string[] | Record<string | number, string>
  readonly result_total?: NumberString[] | Record<string | number, NumberString>
  readonly result_next?: NumberString[] | Record<string | number, NumberString>
  readonly result_time?: PayloadTime[] | Record<string | number, PayloadTime>
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
     * Основные параметры ограничений
     */
    const params: RestrictionParams = {
      ...ParamsFactory.getDefault(),
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

  // region Log ////
  #sanitizeParams(params: TypeCallParams): Record<string, unknown> {
    const sanitized = { ...params }
    const sensitiveKeys = ['auth', 'password', 'token', 'secret', 'access_token', 'refresh_token']

    sensitiveKeys.forEach((key) => {
      if (key in sanitized && sanitized[key]) {
        sanitized[key] = '***REDACTED***'
      }
    })

    return sanitized
  }

  #logRequest(method: string, params: TypeCallParams, requestId: string): void {
    if (!this._logger) return

    this.getLogger().log(`[${requestId}] Starting HTTP request`, {
      method,
      params: this.#sanitizeParams(params),
      timestamp: Date.now()
    })
  }

  #logSuccessfulRequest(method: string, duration: number, requestId: string): void {
    if (!this._logger) return

    this.getLogger().log(`[${requestId}] HTTP request completed successfully`, {
      method,
      durationMs: duration,
      durationSec: (duration / 1000).toFixed(2)
    })
  }

  #logFailedRequest(method: string, attempt: number, error: AjaxError, requestId: string): void {
    if (!this._logger) return

    this.getLogger().log(`[${requestId}] HTTP request failed`, {
      method,
      attempt: attempt + 1,
      errorCode: error.code,
      errorMessage: error.message,
      status: error.status
    })
  }

  #logAllAttemptsExhausted(method: string, maxRetries: number, requestId: string): void {
    if (!this._logger) return

    this.getLogger().log(`[${requestId}] All retry attempts exhausted`, {
      method,
      maxRetries
    })
  }

  #logBatchStart(calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal, options: ICallBatchOptions): void {
    if (!this._logger) return

    const callCount = Array.isArray(calls)
      ? calls.length
      : Object.keys(calls).length

    this.getLogger().log('[batch request] starting ', {
      callCount,
      isHaltOnError: options.isHaltOnError,
      timestamp: Date.now()
    })
  }

  #logBatchCompletion(total: number, errors: number): void {
    if (!this._logger) return

    this.getLogger().log('[batch request] completed', {
      totalCalls: total,
      successful: total - errors,
      failed: errors,
      successRate: ((total - errors) / total * 100).toFixed(1) + '%'
    })
  }
  // endregion ////

  // region Actions Call ////
  // region batch ////
  async batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const opts = {
      isHaltOnError: true,
      ...options
    }

    this.#logBatchStart(calls, opts)

    if (Array.isArray(calls)) {
      return this.#batchAsArray(calls, opts)
    }

    return this.#batchAsObject(calls, opts)
  }

  async #batchAsObject<T = unknown>(
    calls: BatchNamedCommandsUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const cmd = this.#prepareBatchCommandsObject(calls)
    if (Object.keys(cmd).length === 0) {
      return Promise.resolve(new Result())
    }

    const response = await this.call<T>('batch', {
      halt: options.isHaltOnError ? 1 : 0,
      cmd
    })

    return this.#processBatchResponse<T>(
      cmd,
      response,
      {
        isHaltOnError: options.isHaltOnError,
        isObjectMode: true
      }
    )
  }

  #prepareBatchCommandsObject(calls: BatchNamedCommandsUniversal): Record<string, string> {
    const cmd: Record<string, string> = {}

    Object.entries(calls).forEach(([index, row]) => {
      const command = this.#parseBatchRow(row)
      if (command) {
        cmd[index] = this.#buildBatchCommandString(command.method, command.params)
      }
    })

    return cmd
  }

  async #batchAsArray<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const cmd = this.#prepareBatchCommandsArray(calls)
    if (cmd.length === 0) {
      return Promise.resolve(new Result())
    }

    const response = await this.call<T>('batch', {
      halt: options.isHaltOnError ? 1 : 0,
      cmd
    })

    return this.#processBatchResponse<T>(
      cmd,
      response,
      {
        isHaltOnError: options.isHaltOnError,
        isObjectMode: false
      }
    )
  }

  #prepareBatchCommandsArray(calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal): string[] {
    const cmd: string[] = []

    calls.forEach((row) => {
      const command = this.#parseBatchRow(row)
      if (command) {
        cmd.push(this.#buildBatchCommandString(command.method, command.params))
      }
    })

    return cmd
  }

  // Вспомогательные методы для подготовки команд batch
  #parseBatchRow(row: CommandObject<string, TypeCallParams | undefined> | CommandTuple<string, TypeCallParams | undefined>): {
    method: string
    params?: Record<string, unknown>
  } | null {
    if (row && typeof row === 'object') {
      if ('method' in row && typeof row.method === 'string') {
        return {
          method: row.method,
          params: row.params as Record<string, unknown> | undefined
        }
      }

      if (Array.isArray(row) && row.length > 0 && typeof row[0] === 'string') {
        return {
          method: row[0],
          params: row[1] as Record<string, unknown> | undefined
        }
      }
    }

    return null
  }

  #buildBatchCommandString(method: string, params?: Record<string, unknown>): string {
    return `${method}?${qs.stringify(params || {})}`
  }

  // Основной метод обработки ответа batch
  async #processBatchResponse<T>(
    cmd: Record<string, string> | string[],
    response: AjaxResult<T>,
    options: ICallBatchOptions & { isObjectMode?: boolean }
  ): Promise<Result<ICallBatchResult<T>>> {
    const responseData = response.getData() as BatchPayload<T>

    const responseResult = responseData.result
    const responseTime = responseData.time
    const results = await this.#processBatchItems<T>(cmd, response, responseResult)

    return this.#handleBatchResults<T>(results, responseTime, options)
  }

  // Обработка элементов batch
  async #processBatchItems<T>(
    cmd: Record<string, string> | string[],
    response: AjaxResult<T>,
    responseResult: BatchPayloadResult<T>
  ): Promise<Map<string | number, AjaxResult<T>>> {
    const results = new Map<string | number, AjaxResult<T>>()

    // Обработка всех команд
    const entries = Array.isArray(cmd)
      ? cmd.entries()
      : Object.entries(cmd)

    for (const [index, row] of entries) {
      await this.#processBatchItem<T>(row, index, response, responseResult as BatchResponseData<T>, results)
    }

    return results
  }

  // Обработка каждого элемента ответа (processResponse)
  async #processBatchItem<T>(
    row: string,
    index: string | number,
    response: AjaxResult<T>,
    responseResult: BatchResponseData<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void> {
    // region Tools ////
    function getResultByIndex<T>(
      rows: T[] | Record<string | number, T> | undefined,
      index: string | number
    ): T | undefined {
      if (!rows) return undefined

      if (Array.isArray(rows)) {
        return rows[index as number]
      } else {
        return rows[index]
      }
    }

    function getResultErrorByIndex(
      rows: string[] | Record<string | number, string> | undefined,
      index: string | number
    ): string | undefined {
      if (!rows) return undefined

      if (Array.isArray(rows)) {
        return rows[index as number]
      } else {
        return rows[index]
      }
    }

    function getResultTotalByIndex(
      rows: NumberString[] | Record<string | number, NumberString> | undefined,
      index: string | number
    ): NumberString | undefined {
      if (!rows) return undefined

      if (Array.isArray(rows)) {
        return rows[index as number]
      } else {
        return rows[index]
      }
    }

    function getResultNextByIndex(
      rows: NumberString[] | Record<string | number, NumberString> | undefined,
      index: string | number
    ): NumberString | undefined {
      if (!rows) return undefined

      if (Array.isArray(rows)) {
        return rows[index as number]
      } else {
        return rows[index]
      }
    }

    function getResultTimeByIndex(
      rows: PayloadTime[] | Record<string | number, PayloadTime> | undefined,
      index: string | number
    ): PayloadTime | undefined {
      if (!rows) return undefined

      if (Array.isArray(rows)) {
        return rows[index as number]
      } else {
        return rows[index]
      }
    }
    // endregion ///

    const resultData = getResultByIndex(responseResult.result, index)
    const resultError = getResultErrorByIndex(responseResult.result_error, index)

    if (
      typeof resultData !== 'undefined'
      || typeof resultError !== 'undefined'
    ) {
      const [methodName, queryString] = row.split('?')

      // Обновляем operating статистику для каждого метода в batch
      const timeData = getResultTimeByIndex(responseResult.result_time, index)
      if (typeof timeData !== 'undefined') {
        await this.#restrictionManager.updateStats(`batch::${methodName}`, timeData)
      }

      const result = new AjaxResult<T>({
        answer: {
          result: (resultData ?? {}) as T,
          error: resultError,
          total: getResultTotalByIndex(responseResult.result_total, index),
          next: getResultNextByIndex(responseResult.result_next, index),
          time: timeData!
        },
        query: {
          method: methodName,
          params: qs.parse(queryString || '')
        },
        status: response.getStatus()
      })

      results.set(index, result)
    }
  }

  // Обработка результатов batch
  #handleBatchResults<T>(
    results: Map<string | number, AjaxResult<T>>,
    responseTime: PayloadTime | undefined,
    options: ICallBatchOptions & { isObjectMode?: boolean }
  ): Result<ICallBatchResult<T>> {
    const result = new Result<ICallBatchResult<T>>()
    const dataResult = new Map<string | number, AjaxResult<T>>()

    let errorsCnt = 0

    for (const [index, data] of results) {
      if (data.getStatus() !== 200 || !data.isSuccess) {
        const error = this.#createErrorFromAjaxResult(data)

        /*
         * Тут должен быть код аналогичный #isOperatingLimitError с проверкой ошибки 'Method is blocked due to operation time limit.'
         * Однако `batch` исполняется без повторных попыток, по этой причине будет сразу ошибка
         */

        if (!options.isHaltOnError && !data.isSuccess) {
          if (options.isObjectMode) {
            result.addError(error, String(index))
          } else {
            result.addError(error)
          }

          errorsCnt++
          continue
        }

        // return Promise.reject(error)
        throw error
      }

      dataResult.set(index, data)
    }

    // Логируем результаты
    this.#logBatchCompletion(results.size, errorsCnt)

    result.setData({
      result: dataResult,
      time: responseTime
    })

    return result
  }

  // initError
  #createErrorFromAjaxResult(ajaxResult: AjaxResult): AjaxError {
    if (ajaxResult.hasError('base-error')) {
      return ajaxResult.errors.get('base-error') as AjaxError
    }

    return new AjaxError({
      code: '0',
      description: ajaxResult.getErrorMessages().join('; '),
      // @todo fox this ??
      status: 0, // ajaxResult.getStatus(),
      requestInfo: {
        method: ajaxResult.getQuery().method,
        params: ajaxResult.getQuery().params
      },
      originalError: ajaxResult.getErrors().next().value
    })
  }
  // endregion ////

  /**
   * Calling the RestApi function
   * @param method - REST API method name
   * @param params - Parameters for the method. If `params.start` exists,
   *                 it will be used unless explicit start parameter is provided.
   * @param start - Explicit start value (takes priority over `params.start`)
   * @returns Promise with AjaxResult
   * @example
   * // Using explicit start parameter
   * http.call('method', { filter: {...} }, 50) // Uses 50
   *
   * // Using start in params
   * http.call('method', { filter: {...}, start: 100 }) // Uses 100
   *
   * // Explicit start has priority
   * http.call('method', { filter: {...}, start: 100 } , 50) // Uses 50
   */
  async call<T = unknown>(
    method: string,
    params: TypeCallParams,
    start?: number
  ): Promise<AjaxResult<T>> {
    const requestId = this.#requestIdGenerator.getRequestId()
    const maxRetries = this.#restrictionManager.getParams().maxRetries!

    this.#logRequest(method, params, requestId)

    let lastError: AjaxError | null = null
    const startTime = Date.now()

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.getLogger().log(`Attempt ${attempt + 1}/${maxRetries} for ${method}`)

        // Применяем operating лимиты через менеджер
        await this.#restrictionManager.applyOperatingLimits(method, params)

        // 3. Выполняем запрос с учетом авторизации, rate limit, обновляем operating статистики
        const result = await this.#executeSingleCall<T>(
          requestId,
          method,
          params,
          start
        )
        const duration = Date.now() - startTime

        // 6. Обновляем статистику
        this.#restrictionManager.incrementStats('totalRequests')
        this.#restrictionManager.resetErrors(method)

        this.#logSuccessfulRequest(method, duration, requestId)

        return result
      } catch (error: unknown) {
        lastError = this.#convertToAjaxError(error, method, params)
        // const duration = Date.now() - startTime

        this.#restrictionManager.incrementStats('totalRequests')
        this.#restrictionManager.incrementError(method)

        this.#logFailedRequest(method, attempt, lastError, requestId)

        if (attempt < maxRetries) {
          const waitTime = await this.#restrictionManager.handleError(method, params, error, attempt)
          if (waitTime > 0) {
            this.#restrictionManager.incrementStats('limitHits')

            this.getLogger().warn(
              `[${requestId}] Ждем ${(waitTime / 1000).toFixed(2)} sec.`,
              `(попытка ${attempt + 1}/${maxRetries})`
            )
            await this.#restrictionManager.waiteDelay(waitTime)

            this.#restrictionManager.incrementStats('retries')
          }

          continue
        }

        // Выбрасываем исключение - больше попыток не будет
        this.#logAllAttemptsExhausted(method, maxRetries, requestId)
        throw error
      }
    }

    throw new AjaxError({
      code: 'JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED',
      description: 'All attempts exhausted',
      status: lastError?.status || 500,
      requestInfo: { method, params },
      originalError: lastError?.originalError || null
    })
  }

  #convertToAjaxError(error: unknown, method: string, params: object): AjaxError {
    if (error instanceof AjaxError) {
      return error
    }

    if (error instanceof AxiosError) {
      return this.#convertAxiosErrorToAjaxError(error, method, params)
    }

    return this.#convertUnknownErrorToAjaxError(error, method, params)
  }

  #convertAxiosErrorToAjaxError(error: AxiosError, method: string, params: object): AjaxError {
    let errorCode = String(error.code || 'JSSDK_AXIOS_ERROR')
    let errorDescription = error.message
    const status = error.response?.status || 0

    if (error.response?.data && typeof error.response.data === 'object') {
      const responseData = error.response.data as TypeDescriptionError
      if (responseData.error) {
        errorCode = responseData.error
        errorDescription = responseData.error_description || errorDescription
      }
    }

    return new AjaxError({
      code: errorCode,
      description: errorDescription,
      status,
      requestInfo: { method, params },
      originalError: error
    })
  }

  #convertUnknownErrorToAjaxError(error: unknown, method: string, params: object): AjaxError {
    return new AjaxError({
      code: 'JSSDK_UNKNOWN_ERROR',
      description: error instanceof Error ? error.message : String(error),
      status: 0,
      requestInfo: { method, params },
      originalError: error
    })
  }

  /**
   * Выполняет одиночный вызов с
   * - обработкой 401 ошибки
   * - проверкой rate limit
   * - обновляем operating статистики
   */
  async #executeSingleCall<T = unknown>(
    requestId: string,
    method: string,
    params: TypeCallParams,
    start?: number
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
        this.#prepareMethod(requestId, method),
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
                this.#prepareMethod(requestId, method),
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
            params // ,
            // start
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
  #prepareParams(
    authData: AuthData,
    params: TypeCallParams,
    start?: number
  ): TypePrepareParams {
    const result: TypePrepareParams = { ...params }

    if (this.#logTag.length > 0) {
      result.logTag = this.#logTag
    }

    // result[this.#requestIdGenerator.getQueryStringParameterName()] = this.#requestIdGenerator.getRequestId()
    // result[this.#requestIdGenerator.getQueryStringSdkParameterName()] = '__SDK_VERSION__'

    /** @memo we skip auth for hook */
    if (authData.refresh_token !== 'hook') {
      result.auth = authData.access_token
    }

    if (typeof start !== 'undefined') {
      const explicitStart = Number(start)
      result.start = Number.isNaN(explicitStart) || explicitStart < -1 ? -1 : explicitStart
    }

    if (result?.data && 'start' in result.data) {
      const { start, ...dataWithoutStart } = result.data
      result.data = dataWithoutStart
    }

    return result
  }

  /**
   * Makes the function name safe and adds JSON format
   */
  #prepareMethod(
    requestId: string,
    method: string
  ): string {
    const baseUrl = `${encodeURIComponent(method)}.json`

    /**
     * @memo For task methods, skip telemetry
     * @see https://apidocs.bitrix24.com/settings/how-to-call-rest-api/data-encoding.html#order-of-parameters
     */
    if (method.includes('task.')) {
      return `${baseUrl}`
    }

    const queryParams = new URLSearchParams({
      [this.#requestIdGenerator.getQueryStringParameterName()]: requestId,
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
