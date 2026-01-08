import { LoggerBrowser, LoggerType } from '../../logger/browser'
import RequestIdGenerator from './request-id-generator'
import { ParamsFactory } from './limiters/params-factory'
import { RestrictionManager } from './limiters/manager'
import { Result } from '../result'
import { AjaxError } from './ajax-error'
import { AjaxResult } from './ajax-result'
import { versionManager } from './version-manager'
import { Type } from '../../tools/type'
import { ApiVersion } from '../../types/b24'
import type { TypeCallParams, TypeHttp, ICallBatchOptions, BatchCommandsArrayUniversal, BatchCommandsObjectUniversal, BatchNamedCommandsUniversal, CommandObject, CommandTuple, ICallBatchResult } from '../../types/http'
import type { RestrictionManagerStats, RestrictionParams } from '../../types/limiters'
import type { AjaxResultParams } from './ajax-result'
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
const MAX_BATCH_COMMANDS = 50

/**
 * Class for working with RestApi requests via http
 * @todo docs
 *
 * @link https://bitrix24.github.io/b24jssdk/
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

  #metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalDuration: 0,
    byMethod: new Map<string, { count: number, totalDuration: number }>(),
    lastErrors: [] as Array<{ method: string, error: string, timestamp: number }>
  }

  constructor(
    authActions: AuthActions,
    options?: null | object,
    restrictionParams?: Partial<RestrictionParams>
  ) {
    const defaultHeaders = {
      // 'X-Sdk': '__SDK_USER_AGENT__-v-__SDK_VERSION__'
    }

    this.#authActions = authActions
    this.#requestIdGenerator = new RequestIdGenerator()

    this.#clientAxios = axios.create({
      baseURL: this.#authActions.getTargetOriginWithPath(),
      headers: {
        ...defaultHeaders,
        ...(options ? (options as any).headers : {})
      },
      timeout: 30_000,
      timeoutErrorMessage: 'Request timeout exceeded',
      ...(options && { ...options, headers: undefined })
    })

    /**
     * Basic parameters of restrictions
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

  // region RestrictionManager ////
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
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    totalDuration: number
    byMethod: Map<string, { count: number, totalDuration: number }>
    lastErrors: { method: string, error: string, timestamp: number }[]
  } {
    return {
      ...this.#restrictionManager.getStats(),
      totalRequests: this.#metrics.totalDuration,
      successfulRequests: this.#metrics.successfulRequests,
      failedRequests: this.#metrics.failedRequests,
      totalDuration: this.#metrics.totalDuration,
      byMethod: this.#metrics.byMethod,
      lastErrors: this.#metrics.lastErrors
    }
  }

  /**
   * @inheritDoc
   */
  async reset(): Promise<void> {
    this.#metrics.totalDuration = 0
    this.#metrics.successfulRequests = 0
    this.#metrics.failedRequests = 0
    this.#metrics.totalDuration = 0
    this.#metrics.byMethod.clear()
    this.#metrics.lastErrors = []

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

  #updateMetrics(
    method: string,
    isSuccess: boolean,
    duration: number,
    error?: unknown
  ): void {
    this.#metrics.totalRequests++

    if (isSuccess) {
      this.#metrics.successfulRequests++
    } else {
      this.#metrics.failedRequests++

      if (error instanceof AjaxError) {
        this.#metrics.lastErrors.push({
          method,
          error: error.message,
          timestamp: Date.now()
        })

        if (this.#metrics.lastErrors.length > 100) {
          this.#metrics.lastErrors = this.#metrics.lastErrors.slice(-100)
        }
      }
    }

    // Metrics by Method
    if (!this.#metrics.byMethod.has(method)) {
      this.#metrics.byMethod.set(method, { count: 0, totalDuration: 0 })
    }

    const methodMetrics = this.#metrics.byMethod.get(method)!
    methodMetrics.count++
    methodMetrics.totalDuration += duration
  }

  // region Actions Call ////
  // region batch ////
  #validateBatchCommands(
    requestId: string,
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  ): void {
    const count = Array.isArray(calls) ? calls.length : Object.keys(calls).length

    if (count > MAX_BATCH_COMMANDS) {
      throw new AjaxError({
        code: 'JSSDK_BATCH_TOO_LARGE',
        description: `Batch too large: ${count} commands (max: ${MAX_BATCH_COMMANDS})`,
        status: 400,
        requestInfo: { method: 'batch', params: { cmd: calls }, requestId },
        originalError: null
      })
    }

    if (count === 0) {
      throw new AjaxError({
        code: 'JSSDK_BATCH_EMPTY',
        description: 'Batch must contain at least one command',
        status: 400,
        requestInfo: { method: 'batch', params: { cmd: calls }, requestId },
        originalError: null
      })
    }
  }

  async batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const opts = {
      isHaltOnError: true,
      ...options
    }

    const requestId = opts.requestId ?? this.#requestIdGenerator.getRequestId()

    this.#logBatchStart(requestId, calls, opts)

    this.#validateBatchCommands(requestId, calls)

    if (Array.isArray(calls)) {
      return this.#batchAsArray(requestId, calls, opts)
    }

    return this.#batchAsObject(requestId, calls, opts)
  }

  async #batchAsObject<T = unknown>(
    requestId: string,
    calls: BatchNamedCommandsUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const cmd = this.#prepareBatchCommandsObject(calls)
    if (Object.keys(cmd).length === 0) {
      return Promise.resolve(new Result())
    }

    const response = await this.call<BatchPayload<T>>(
      'batch',
      { halt: options.isHaltOnError ? 1 : 0, cmd },
      requestId
    )

    const opts = {
      isHaltOnError: !!options.isHaltOnError,
      requestId,
      isObjectMode: true
    }

    return this.#processBatchResponse<T>(cmd, response, opts)
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
    requestId: string,
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const cmd = this.#prepareBatchCommandsArray(calls)
    if (cmd.length === 0) {
      return Promise.resolve(new Result())
    }

    const response = await this.call<BatchPayload<T>>(
      'batch',
      { halt: options.isHaltOnError ? 1 : 0, cmd },
      requestId
    )

    const opts = {
      isHaltOnError: !!options.isHaltOnError,
      requestId,
      isObjectMode: false
    }

    return this.#processBatchResponse<T>(cmd, response, opts)
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

  // Helper methods for preparing batch commands
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

  // The main method for processing the batch response
  async #processBatchResponse<T>(
    cmd: Record<string, string> | string[],
    response: AjaxResult<BatchPayload<T>>,
    options: Required<ICallBatchOptions> & { isObjectMode: boolean }
  ): Promise<Result<ICallBatchResult<T>>> {
    const responseData = response.getData()

    const responseResult = responseData.result
    const responseTime = responseData.time

    const responseHelper = {
      requestId: response.getQuery().requestId,
      status: response.getStatus()
    }

    const results = await this.#processBatchItems<T>(cmd, responseHelper, responseResult)

    return this.#handleBatchResults<T>(results, responseTime, options)
  }

  // Processing batch elements
  async #processBatchItems<T>(
    cmd: Record<string, string> | string[],
    responseHelper: { requestId: string, status: number },
    responseResult: BatchPayloadResult<T>
  ): Promise<Map<string | number, AjaxResult<T>>> {
    const results = new Map<string | number, AjaxResult<T>>()

    // Processing all commands
    const entries = Array.isArray(cmd)
      ? cmd.entries()
      : Object.entries(cmd)

    for (const [index, row] of entries) {
      await this.#processBatchItem<T>(row, index, responseHelper, responseResult as BatchResponseData<T>, results)
    }

    return results
  }

  // Process each response element
  async #processBatchItem<T>(
    row: string,
    index: string | number,
    responseHelper: { requestId: string, status: number },
    responseResult: BatchResponseData<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void> {
    const resultData = this.#getBatchResultByIndex(responseResult.result, index)
    const resultError = this.#getBatchResultByIndex(responseResult.result_error, index)

    if (
      typeof resultData !== 'undefined'
      || typeof resultError !== 'undefined'
    ) {
      const [methodName, queryString] = row.split('?')

      // Update operating statistics for each method in the batch
      const resultTime = this.#getBatchResultByIndex(responseResult.result_time, index)
      if (typeof resultTime !== 'undefined') {
        await this.#restrictionManager.updateStats(responseHelper.requestId, `batch::${methodName}`, resultTime)
      }

      const result = new AjaxResult<T>({
        answer: {
          result: (resultData ?? {}) as T,
          error: resultError,
          total: this.#getBatchResultByIndex(responseResult.result_total, index),
          next: this.#getBatchResultByIndex(responseResult.result_next, index),
          time: resultTime!
        },
        query: {
          method: methodName,
          params: qs.parse(queryString || ''),
          requestId: responseHelper.requestId
        },
        status: responseHelper.status
      })

      results.set(index, result)
    }
  }

  #getBatchResultByIndex<T>(
    data: T[] | Record<string | number, T> | undefined,
    index: string | number
  ): T | undefined {
    if (!data) return undefined

    if (Array.isArray(data)) {
      return data[index as number]
    }

    return (data as Record<string | number, T>)[index]
  }

  // Processing batch results
  #handleBatchResults<T>(
    results: Map<string | number, AjaxResult<T>>,
    responseTime: PayloadTime | undefined,
    options: Required<ICallBatchOptions> & { isObjectMode: boolean }
  ): Result<ICallBatchResult<T>> {
    const result = new Result<ICallBatchResult<T>>()
    const dataResult = new Map<string | number, AjaxResult<T>>()

    let errorsCnt = 0

    for (const [index, data] of results) {
      if (data.getStatus() !== 200 || !data.isSuccess) {
        const error = this.#createErrorFromAjaxResult(data)

        /*
         * This should contain code similar to #isOperatingLimitError with a check for
         * the error 'Method is blocked due to operation time limit.'
         * However, `batch` is executed without retries, so there will be an immediate error.
         */

        if (!options.isHaltOnError && !data.isSuccess) {
          this.#logBatchSubCallFailed(
            options.requestId,
            index,
            data.getQuery().method,
            error.code,
            error.status,
            error.message
          )
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

    // Log the results
    this.#logBatchCompletion(options.requestId, results.size, errorsCnt)

    result.setData({
      result: dataResult,
      time: responseTime
    })

    return result
  }

  // initError
  #createErrorFromAjaxResult(data: AjaxResult): AjaxError {
    if (data.hasError('base-error')) {
      return data.errors.get('base-error') as AjaxError
    }

    return new AjaxError({
      code: 'JSSDK_BATCH_SUB_ERROR',
      description: data.getErrorMessages().join('; '),
      status: data.getStatus(),
      requestInfo: { ...data.getQuery() },
      originalError: data.getErrors().next().value
    })
  }
  // endregion ////

  #validateParams(requestId: string, method: string, params: TypeCallParams): void {
    // Checking for cyclic references (especially important when logging)
    try {
      JSON.stringify(params)
    } catch (error) {
      throw new AjaxError({
        code: 'JSSDK_INVALID_PARAMS',
        description: 'Parameters contain circular references',
        status: 400,
        requestInfo: { method, params, requestId },
        originalError: error
      })
    }

    // Size check (It is especially important for batch)
    // const paramsSize = JSON.stringify(params).length
    // if (paramsSize > 1024 * 1024) { // 1MB
    //   throw new AjaxError({
    //     code: 'JSSDK_PARAMS_TOO_LARGE',
    //     description: `Parameters too large: ${(paramsSize / 1024 / 1024).toFixed(2)}MB`,
    //     status: 400,
    //     requestInfo: { method, params, requestId },
    //     originalError: null
    //   })
    // }
  }

  /**
   * Calling the RestApi function
   * @param method - REST API method name
   * @param params - Parameters for the method.
   * @param requestId - Request id
   * @returns Promise with AjaxResult
   */
  async call<T = unknown>(
    method: string,
    params: TypeCallParams,
    requestId?: string
  ): Promise<AjaxResult<T>> {
    requestId = requestId ?? this.#requestIdGenerator.getRequestId()
    const maxRetries = this.#restrictionManager.getParams().maxRetries!

    this.#validateParams(requestId, method, params)
    this.#logRequest(requestId, method, params)

    let lastError: AjaxError | null = null
    const startTime = Date.now()

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.#logAttempt(requestId, method, attempt + 1, maxRetries)

        // Apply operating limits via the manager
        await this.#restrictionManager.applyOperatingLimits(requestId, method, params)

        // 3. We execute the request taking into account authorization, rate limit, and update operating statistics.
        const result = await this.#executeSingleCall<T>(requestId, method, params)
        const duration = Date.now() - startTime

        // 6. Updating statistics
        this.#restrictionManager.resetErrors(method)
        this.#updateMetrics(method, true, duration)

        // Log the results
        this.#logSuccessfulRequest(requestId, method, duration)
        return result
      } catch (error: unknown) {
        lastError = this.#convertToAjaxError(requestId, error, method, params)
        const duration = Date.now() - startTime

        this.#restrictionManager.incrementError(method)
        this.#updateMetrics(method, false, duration, error)

        // Log the results
        this.#logFailedRequest(requestId, method, attempt + 1, maxRetries, lastError)

        if (attempt < maxRetries) {
          const waitTime = await this.#restrictionManager.handleError(requestId, method, params, error, attempt)
          if (waitTime > 0) {
            this.#restrictionManager.incrementStats('limitHits')

            this.#logAttemptRetryWaiteDelay(requestId, method, waitTime, attempt + 1, maxRetries)
            await this.#restrictionManager.waiteDelay(waitTime)

            this.#restrictionManager.incrementStats('retries')
          }

          continue
        }

        // Throw an exception - there will be no more attempts
        this.#logAllAttemptsExhausted(requestId, method, attempt + 1, maxRetries)
        throw error
      }
    }

    throw new AjaxError({
      code: 'JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED',
      description: 'All attempts exhausted',
      status: lastError?.status || 500,
      requestInfo: { method, params, requestId },
      originalError: lastError?.originalError || null
    })
  }

  #convertToAjaxError(
    requestId: string,
    error: unknown,
    method: string,
    params: TypeCallParams
  ): AjaxError {
    if (error instanceof AjaxError) {
      return error
    }

    if (error instanceof AxiosError) {
      return this.#convertAxiosErrorToAjaxError(requestId, error, method, params)
    }

    return this.#convertUnknownErrorToAjaxError(requestId, error, method, params)
  }

  #convertAxiosErrorToAjaxError(
    requestId: string,
    error: AxiosError,
    method: string,
    params: TypeCallParams
  ): AjaxError {
    let errorCode = String(error.code || 'JSSDK_AXIOS_ERROR')
    let errorDescription = error.message
    const status = error.response?.status || 0

    // Handling network errors
    if (errorCode === 'ERR_NETWORK') {
      return new AjaxError({
        code: 'NETWORK_ERROR',
        description: 'Network connection failed',
        status: 0,
        requestInfo: { method, params, requestId },
        originalError: error
      })
    }

    // Handling timeout
    if (errorCode === 'ECONNABORTED' || error.message.includes('timeout')) {
      return new AjaxError({
        code: 'REQUEST_TIMEOUT',
        description: 'Request timeout exceeded',
        status: 408,
        requestInfo: { method, params, requestId },
        originalError: error
      })
    }

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
      requestInfo: { method, params, requestId },
      originalError: error
    })
  }

  #convertUnknownErrorToAjaxError(
    requestId: string,
    error: unknown,
    method: string,
    params: TypeCallParams
  ): AjaxError {
    return new AjaxError({
      code: 'JSSDK_UNKNOWN_ERROR',
      description: error instanceof Error ? error.message : String(error),
      status: 0,
      requestInfo: { method, params, requestId },
      originalError: error
    })
  }

  // region Execute Single Call ////
  /**
   * Performs a single call with
   * - 401 error handling
   * - rate limit check
   * - updating operating statistics
   */
  async #executeSingleCall<T = unknown>(
    requestId: string,
    method: string,
    params: TypeCallParams
  ): Promise<AjaxResult<T>> {
    const authData = await this.#ensureAuth(requestId)

    this.#checkClientSideWarning(requestId)

    const response = await this.#makeRequestWithAuthRetry<T>(requestId, method, params, authData)

    // Create and return the result
    return this.#createAjaxResultFromResponse<T>(response, requestId, method, params)
  }

  // Get/update authorization
  async #ensureAuth(requestId: string): Promise<AuthData> {
    let authData = this.#authActions.getAuthData()
    if (authData === false) {
      this.#logRefreshingAuthToken(requestId)
      authData = await this.#authActions.refreshAuth()
    }
    return authData
  }

  // Execute the request with 401 error handling
  async #makeRequestWithAuthRetry<T>(
    requestId: string,
    method: string,
    params: TypeCallParams,
    authData: AuthData
  ): Promise<AjaxResponse<T>> {
    try {
      // 4. Apply the rate limit through the manager
      await this.#restrictionManager.checkRateLimit(requestId, method)

      return await this.#makeAxiosRequest<T>(requestId, method, params, authData)
    } catch (error) {
      // If this is an authorization error (401), then we try to update the token and repeat
      if (this.#isAuthError(error)) {
        this.#logAuthErrorDetected(requestId)
        this.#logRefreshingAuthToken(requestId)

        const refreshedAuthData = await this.#authActions.refreshAuth()

        // 4. Apply the rate limit through the manager
        await this.#restrictionManager.checkRateLimit(requestId, method)

        return await this.#makeAxiosRequest<T>(requestId, method, params, refreshedAuthData)
      }

      throw error
    }
  }

  async #makeAxiosRequest<T>(
    requestId: string,
    method: string,
    params: TypeCallParams,
    authData: AuthData
  ): Promise<AjaxResponse<T>> {
    const response = await this.#clientAxios.post<AjaxResultParams<T>>(
      this.#prepareMethod(requestId, method),
      this.#prepareParams(authData, params)
    )

    return {
      status: response.status,
      payload: response.data
    }
  }

  #isAuthError(error: unknown): boolean {
    if (!(error instanceof AjaxError)) {
      return false
    }

    return (
      error.status === 401
      && ['expired_token', 'invalid_token'].includes(error.code)
    )
  }

  async #createAjaxResultFromResponse<T>(
    response: AjaxResponse<T>,
    requestId: string,
    method: string,
    params: TypeCallParams
  ): Promise<AjaxResult<T>> {
    const result = new AjaxResult<T>({
      answer: response.payload,
      query: { method, params, requestId },
      status: response.status
    })

    // 5. Update operating statistics
    if (response.payload?.time) {
      await this.#restrictionManager.updateStats(requestId, method, response.payload.time)
    }

    return result
  }
  // endregion ////
  // endregion ////

  // region Prepare ////
  /**
   * Makes the function name safe and adds JSON format
   */
  #prepareMethod(
    requestId: string,
    method: string
  ): string {
    let baseUrl = this.#authActions.getTargetOriginWithPath()
    if (
      this.#authActions.apiVersion === ApiVersion.v3
      && !versionManager.isSupport(this.#authActions.apiVersion, method)
    ) {
      baseUrl = baseUrl.replace('/rest/api', '/rest')
    }

    // not use `.json` (in ver2 def json, in ver3 only json)
    const methodUrl = `/${encodeURIComponent(method)}`

    /**
     * @memo For task methods, skip telemetry
     * @see https://apidocs.bitrix24.com/settings/how-to-call-rest-api/data-encoding.html#order-of-parameters
     */
    if (method.includes('task.')) {
      return `${baseUrl}${methodUrl}`
    }

    const queryParams = new URLSearchParams({
      [this.#requestIdGenerator.getQueryStringParameterName()]: requestId,
      [this.#requestIdGenerator.getQueryStringSdkParameterName()]: '__SDK_VERSION__',
      [this.#requestIdGenerator.getQueryStringSdkTypeParameterName()]: '__SDK_USER_AGENT__'
    })
    return `${baseUrl}${methodUrl}?${queryParams.toString()}`
  }

  /**
   * Processes function parameters and adds authorization
   */
  #prepareParams(
    authData: AuthData,
    params: TypeCallParams
  ): TypePrepareParams {
    const result: TypePrepareParams = { ...params }

    if (this.#logTag.length > 0) {
      result.logTag = this.#logTag
    }

    /** @memo we skip auth for hook */
    if (authData.refresh_token !== 'hook') {
      result.auth = authData.access_token
    }

    if (result?.data && 'start' in result.data) {
      const { start, ...dataWithoutStart } = result.data
      result.data = dataWithoutStart
    }

    return result
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

  #logRequest(requestId: string, method: string, params: TypeCallParams): void {
    this.getLogger().log(`http request starting`, {
      requestId,
      method,
      params: this.#sanitizeParams(params),
      timestamp: Date.now()
    })
  }

  #logAttempt(requestId: string, method: string, attempt: number, maxRetries: number): void {
    this.getLogger().info(`http request attempt`, {
      requestId,
      method,
      attempt: {
        current: attempt,
        max: maxRetries
      }
    })
  }

  #logRefreshingAuthToken(requestId: string): void {
    this.getLogger().info(`http refreshing auth token`, { requestId })
  }

  #logAuthErrorDetected(requestId: string): void {
    this.getLogger().info(`http auth error detected`, { requestId })
  }

  #logSuccessfulRequest(requestId: string, method: string, duration: number): void {
    this.getLogger().log(`http request successful`, {
      requestId,
      method,
      duration: {
        ms: duration,
        sec: (duration / 1000).toFixed(2)
      }
    })
  }

  #logFailedRequest(
    requestId: string,
    method: string,
    attempt: number,
    maxRetries: number,
    error: AjaxError
  ): void {
    this.getLogger().log(`http request failed`, {
      requestId,
      method,
      attempt: {
        current: attempt,
        max: maxRetries
      },
      error: {
        code: error.code,
        message: error.message,
        status: error.status
      }
    })
  }

  #logAttemptRetryWaiteDelay(
    requestId: string,
    method: string,
    wait: number,
    attempt: number,
    maxRetries: number
  ): void {
    this.getLogger().log(
      `http wait ${(wait / 1000).toFixed(2)} sec.`,
      {
        requestId,
        method,
        wait: wait,
        attempt: {
          current: attempt,
          max: maxRetries
        }
      }
    )
  }

  #logAllAttemptsExhausted(requestId: string, method: string, attempt: number, maxRetries: number): void {
    this.getLogger().error(`http all retry attempts exhausted`, {
      requestId,
      method,
      attempt: {
        current: attempt,
        max: maxRetries
      }
    })
  }

  #logBatchStart(
    requestId: string,
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options: ICallBatchOptions
  ): void {
    const callCount = Array.isArray(calls)
      ? calls.length
      : Object.keys(calls).length

    this.getLogger().log(`http batch request starting `, {
      requestId,
      callCount,
      isHaltOnError: options.isHaltOnError,
      timestamp: Date.now()
    })
  }

  #logBatchCompletion(requestId: string, total: number, errors: number): void {
    this.getLogger().log(`http batch request completed`, {
      requestId,
      totalCalls: total,
      successful: total - errors,
      failed: errors,
      successRate: ((total - errors) / total * 100).toFixed(1) + '%'
    })
  }

  #logBatchSubCallFailed(requestId: string, index: string | number, method: string, code: string, status: number, errorMessage: string): void {
    this.getLogger().log(`http batch sub-call failed`, {
      requestId,
      index,
      method,
      error: {
        code: code,
        message: errorMessage,
        status
      }
    })
  }

  // Check client-side warnings
  #checkClientSideWarning(requestId: string): void {
    if (
      this.#isClientSideWarning
      && !this.isServerSide()
      && Type.isStringFilled(this.#clientSideWarningMessage)
    ) {
      this.getLogger().warn(this.#clientSideWarningMessage, { requestId })
    }
  }
  // endregion ////
}
