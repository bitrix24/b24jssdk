import type { LoggerInterface } from '../../logger'
import type {
  TypeCallParams,
  TypeHttp,
  ICallBatchOptions,
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  CommandObject,
  CommandTuple,
  ICallBatchResult,
  BatchCommandV3
} from '../../types/http'
import type { RestrictionManagerStats, RestrictionParams } from '../../types/limiters'
import type { AjaxResultParams } from './ajax-result'
import type { AuthActions, AuthData, TypeDescriptionError, TypeDescriptionErrorV3 } from '../../types/auth'
import type { BatchPayload, BatchPayloadResult, PayloadTime } from '../../types/payloads'
import type { NumberString } from '../../types/common'
import type { AxiosInstance } from 'axios'
import axios, { AxiosError } from 'axios'
import * as qs from 'qs-esm'
import { LoggerFactory } from '../../logger'
import { RequestIdGenerator } from './request-id-generator'
import { ParamsFactory } from './limiters/params-factory'
import { RestrictionManager } from './limiters/manager'
import { Result } from '../result'
import { AjaxError } from './ajax-error'
import { AjaxResult } from './ajax-result'
import { Type } from '../../tools/type'
import { Environment, getEnvironment } from '../../tools/environment'
import { ApiVersion } from '../../types/b24'

export type AjaxResponse<T = unknown> = {
  status: number
  payload: AjaxResultParams<T>
}

export type TypePrepareParams = TypeCallParams & {
  data?: Record<string, any>
  logTag?: string
  auth?: string
}

export interface BatchResponseData<T = unknown> {
  readonly result?: T[] | Record<string | number, T>
  readonly result_error?: string[] | Record<string | number, string>
  readonly result_total?: NumberString[] | Record<string | number, NumberString>
  readonly result_next?: NumberString[] | Record<string | number, NumberString>
  readonly result_time?: PayloadTime[] | Record<string | number, PayloadTime>
}

const MAX_BATCH_COMMANDS = 50

/**
 * Abstract Class for working with RestApi requests via http
 *
 * @link https://bitrix24.github.io/b24jssdk/
 *
 * @todo docs
 */
export abstract class AbstractHttp implements TypeHttp {
  protected _clientAxios: AxiosInstance
  protected _authActions: AuthActions
  protected _requestIdGenerator: RequestIdGenerator
  protected _restrictionManager: RestrictionManager

  protected _logger: LoggerInterface

  protected _logTag: string = ''
  protected _isClientSideWarning: boolean = false
  protected _clientSideWarningMessage: string = ''

  protected _version: ApiVersion

  protected _metrics = {
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
    this._version = ApiVersion.v1

    this._logger = LoggerFactory.createNullLogger()

    const defaultHeaders = {
      // 'X-Sdk'
      'User-Agent': '__SDK_USER_AGENT__/__SDK_VERSION__'
    }

    this._authActions = authActions
    this._requestIdGenerator = new RequestIdGenerator()

    this._clientAxios = axios.create({
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

    this._restrictionManager = new RestrictionManager(params)
  }

  get apiVersion(): ApiVersion {
    return this._version
  }

  // region Logger ////
  public setLogger(logger: LoggerInterface): void {
    this._logger = logger
    this._restrictionManager.setLogger(this._logger)
  }

  public getLogger(): LoggerInterface {
    return this._logger
  }
  // endregion ////

  // region RestrictionManager ////
  public async setRestrictionManagerParams(params: RestrictionParams): Promise<void> {
    await this._restrictionManager.setConfig(params)
  }

  public getRestrictionManagerParams(): RestrictionParams {
    return this._restrictionManager.getParams()
  }

  /**
   * @inheritDoc
   */
  public getStats(): RestrictionManagerStats & {
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
      ...this._restrictionManager.getStats(),
      totalRequests: this._metrics.totalDuration,
      successfulRequests: this._metrics.successfulRequests,
      failedRequests: this._metrics.failedRequests,
      totalDuration: this._metrics.totalDuration,
      byMethod: this._metrics.byMethod,
      lastErrors: this._metrics.lastErrors
    }
  }

  /**
   * @inheritDoc
   */
  public async reset(): Promise<void> {
    this._metrics.totalDuration = 0
    this._metrics.successfulRequests = 0
    this._metrics.failedRequests = 0
    this._metrics.totalDuration = 0
    this._metrics.byMethod.clear()
    this._metrics.lastErrors = []

    return this._restrictionManager.reset()
  }
  // endregion ////

  // region LogTag ////
  public setLogTag(logTag?: string): void {
    this._logTag = logTag ?? ''
  }

  public clearLogTag(): void {
    this._logTag = ''
  }
  // endregion ////

  protected _updateMetrics(
    method: string,
    isSuccess: boolean,
    duration: number,
    error?: unknown
  ): void {
    this._metrics.totalRequests++

    if (isSuccess) {
      this._metrics.successfulRequests++
    } else {
      this._metrics.failedRequests++

      if (error instanceof AjaxError) {
        this._metrics.lastErrors.push({
          method,
          error: error.message,
          timestamp: Date.now()
        })

        if (this._metrics.lastErrors.length > 100) {
          this._metrics.lastErrors = this._metrics.lastErrors.slice(-100)
        }
      }
    }

    // Metrics by Method
    if (!this._metrics.byMethod.has(method)) {
      this._metrics.byMethod.set(method, { count: 0, totalDuration: 0 })
    }

    const methodMetrics = this._metrics.byMethod.get(method)!
    methodMetrics.count++
    methodMetrics.totalDuration += duration
  }

  // region Actions Call ////
  // region batch ////
  protected _validateBatchCommands(
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

  public async batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const opts = {
      isHaltOnError: true,
      ...options
    }

    const requestId = opts.requestId ?? this._requestIdGenerator.getRequestId()

    this._logBatchStart(requestId, calls, opts)

    this._validateBatchCommands(requestId, calls)

    if (Array.isArray(calls)) {
      return this._batchAsArray(requestId, calls, opts)
    }

    return this._batchAsObject(requestId, calls, opts)
  }

  protected async _batchAsObject<T = unknown>(
    requestId: string,
    calls: BatchNamedCommandsUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const cmd = this._prepareBatchCommandsObject(calls)
    if (Object.keys(cmd).length === 0) {
      return Promise.resolve(new Result())
    }

    // @todo ! api ver3
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

    return this._processBatchResponse<T>(cmd, response, opts)
  }

  protected _prepareBatchCommandsObject(calls: BatchNamedCommandsUniversal): Record<string, string> {
    const cmd: Record<string, string> = {}

    Object.entries(calls).forEach(([index, row]) => {
      const command = this._parseBatchRow(row)
      if (command) {
        cmd[index] = this._buildBatchCommandString(command)
      }
    })

    return cmd
  }

  protected async _batchAsArray<T = unknown>(
    requestId: string,
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const cmd = this._prepareBatchCommandsArray(calls)
    if (cmd.length === 0) {
      return Promise.resolve(new Result())
    }

    let response

    if (this.apiVersion === ApiVersion.v3) {
      // @todo ! api ver3 `params.halt` - waite docs
      response = await this.call<BatchPayload<T>>(
        'batch',
        cmd,
        requestId
      )
    } else {
      response = await this.call<BatchPayload<T>>(
        'batch',
        { halt: options.isHaltOnError ? 1 : 0, cmd },
        requestId
      )
    }

    const opts = {
      isHaltOnError: !!options.isHaltOnError,
      requestId,
      isObjectMode: false
    }

    return this._processBatchResponse<T>(cmd, response, opts)
  }

  protected _prepareBatchCommandsArray(calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal): string[] {
    const cmd: string[] = []

    calls.forEach((row) => {
      const command = this._parseBatchRow(row)
      if (command) {
        cmd.push(this._buildBatchCommandString(command))
      }
    })

    return cmd
  }

  /*
   * Helper methods for preparing batch commands
   *
   * @see AbstractB24._automaticallyObtainApiVersion()
   */
  protected _parseBatchRow(row: CommandObject<string, TypeCallParams | undefined> | CommandTuple<string, TypeCallParams | undefined>): BatchCommandV3 | null {
    if (row) {
      if (typeof row === 'object' && 'method' in row && typeof row.method === 'string') {
        return {
          method: row.method,
          query: row.params as Record<string, unknown> | undefined
        }
      }

      if (Array.isArray(row) && row.length > 0 && typeof row[0] === 'string') {
        return {
          method: row[0],
          query: row[1] as Record<string, unknown> | undefined
        }
      }
    }

    return null
  }

  protected _buildBatchCommandString(command: BatchCommandV3): string {
    return `${command.method}?${qs.stringify(command.query || {})}`
  }

  /**
   * The main method for processing the batch response
   */
  protected async _processBatchResponse<T>(
    cmd: Record<string, string> | string[],
    response: AjaxResult<BatchPayload<T>>,
    options: Required<ICallBatchOptions> & { isObjectMode: boolean }
  ): Promise<Result<ICallBatchResult<T>>> {
    const responseData = response.getData()

    const responseResult = responseData.result
    const responseTime = responseData.time

    const responseHelper = {
      requestId: response.getQuery().requestId,
      status: response.getStatus(),
      time: responseTime
    }

    const results = await this._processBatchItems<T>(cmd, responseHelper, responseResult)

    return this._handleBatchResults<T>(results, responseTime, options)
  }

  /**
   * Processing batch elements
   */
  protected async _processBatchItems<T>(
    cmd: Record<string, string> | string[],
    responseHelper: { requestId: string, status: number, time: PayloadTime },
    responseResult: BatchPayloadResult<T>
  ): Promise<Map<string | number, AjaxResult<T>>> {
    const results = new Map<string | number, AjaxResult<T>>()

    // Processing all commands
    const entries = Array.isArray(cmd)
      ? cmd.entries()
      : Object.entries(cmd)

    for (const [index, row] of entries) {
      await this._processBatchItem<T>(row, index, responseHelper, responseResult as BatchResponseData<T>, results)
    }

    return results
  }

  /**
   * Process each response element
   */
  protected async _processBatchItem<T>(
    row: string,
    index: string | number,
    responseHelper: { requestId: string, status: number, time: PayloadTime },
    responseResult: BatchResponseData<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void> {
    const resultData = this._getBatchResultByIndex(responseResult.result, index)
    const resultError = this._getBatchResultByIndex(responseResult.result_error, index)

    if (
      typeof resultData !== 'undefined'
      || typeof resultError !== 'undefined'
    ) {
      const [methodName, queryString] = row.split('?')

      // Update operating statistics for each method in the batch
      const resultTime = this._getBatchResultByIndex(responseResult.result_time, index)
      if (typeof resultTime !== 'undefined') {
        await this._restrictionManager.updateStats(responseHelper.requestId, `batch::${methodName}`, resultTime)
      }

      const result = new AjaxResult<T>({
        answer: {
          result: (resultData ?? {}) as T,
          error: resultError,
          total: this._getBatchResultByIndex(responseResult.result_total, index),
          next: this._getBatchResultByIndex(responseResult.result_next, index),
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

  protected _getBatchResultByIndex<T>(
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
  protected _handleBatchResults<T>(
    results: Map<string | number, AjaxResult<T>>,
    responseTime: PayloadTime | undefined,
    options: Required<ICallBatchOptions> & { isObjectMode: boolean }
  ): Result<ICallBatchResult<T>> {
    const result = new Result<ICallBatchResult<T>>()
    const dataResult = new Map<string | number, AjaxResult<T>>()

    let errorsCnt = 0

    for (const [index, data] of results) {
      if (data.getStatus() !== 200 || !data.isSuccess) {
        const error = this._createErrorFromAjaxResult(data)

        /*
         * This should contain code similar to #isOperatingLimitError with a check for
         * the error 'Method is blocked due to operation time limit.'
         * However, `batch` is executed without retries, so there will be an immediate error.
         */

        if (!options.isHaltOnError && !data.isSuccess) {
          this._logBatchSubCallFailed(
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
    this._logBatchCompletion(options.requestId, results.size, errorsCnt)

    result.setData({
      result: dataResult,
      time: responseTime
    })

    return result
  }

  // initError
  protected _createErrorFromAjaxResult(data: AjaxResult): AjaxError {
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

  protected _validateParams(requestId: string, method: string, params: TypeCallParams): void {
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
  public async call<T = unknown>(
    method: string,
    params: TypeCallParams,
    requestId?: string
  ): Promise<AjaxResult<T>> {
    requestId = requestId ?? this._requestIdGenerator.getRequestId()
    const maxRetries = this._restrictionManager.getParams().maxRetries!

    this._validateParams(requestId, method, params)
    this._logRequest(requestId, method, params)

    let lastError: AjaxError | null = null
    const startTime = Date.now()

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this._logAttempt(requestId, method, attempt + 1, maxRetries)

        // Apply operating limits via the manager
        await this._restrictionManager.applyOperatingLimits(requestId, method, params)

        // 3. We execute the request taking into account authorization, rate limit, and update operating statistics.
        const result = await this._executeSingleCall<T>(requestId, method, params)
        const duration = Date.now() - startTime

        // 6. Updating statistics
        this._restrictionManager.resetErrors(method)
        this._updateMetrics(method, true, duration)

        // Log the results
        this._logSuccessfulRequest(requestId, method, duration)
        return result
      } catch (error: unknown) {
        lastError = this._convertToAjaxError(requestId, error, method, params)
        const duration = Date.now() - startTime

        this._restrictionManager.incrementError(method)
        this._updateMetrics(method, false, duration, lastError)

        // Log the results
        this._logFailedRequest(requestId, method, attempt + 1, maxRetries, lastError)

        if (attempt < maxRetries) {
          const waitTime = await this._restrictionManager.handleError(requestId, method, params, lastError, attempt)
          // We don't repeat if waitTime === 0
          if (waitTime > 0) {
            this._restrictionManager.incrementStats('limitHits')

            this._logAttemptRetryWaiteDelay(requestId, method, waitTime, attempt + 1, maxRetries)
            await this._restrictionManager.waiteDelay(waitTime)

            this._restrictionManager.incrementStats('retries')

            continue
          }
        }

        if (attempt + 1 === maxRetries) {
          // Throw an exception - there will be no more attempts
          this._logAllAttemptsExhausted(requestId, method, attempt + 1, maxRetries)
        }
        throw lastError
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

  protected _convertToAjaxError(
    requestId: string,
    error: unknown,
    method: string,
    params: TypeCallParams
  ): AjaxError {
    if (error instanceof AjaxError) {
      return error
    }

    if (error instanceof AxiosError) {
      return this._convertAxiosErrorToAjaxError(requestId, error, method, params)
    }

    return this._convertUnknownErrorToAjaxError(requestId, error, method, params)
  }

  protected _convertAxiosErrorToAjaxError(
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
      const responseData = error.response.data as TypeDescriptionError | TypeDescriptionErrorV3
      if (
        responseData.error
        && typeof responseData.error === 'object'
        && 'code' in responseData.error
      ) {
        errorCode = responseData.error.code
        errorDescription = responseData.error.message.trimEnd()
        if (responseData.error.validation) {
          if (errorDescription.length > 0) {
            if (!errorDescription.endsWith('.')) {
              errorDescription += `.`
            }
            errorDescription += ` `
          }
          responseData.error.validation.forEach((row) => {
            errorDescription += `${row?.message || JSON.stringify(row)}`
          })
        }
      } else if (responseData.error && typeof responseData.error === 'string') {
        errorCode = responseData.error
        errorDescription = (responseData as TypeDescriptionError)?.error_description ?? errorDescription
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

  protected _convertUnknownErrorToAjaxError(
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
  protected async _executeSingleCall<T = unknown>(
    requestId: string,
    method: string,
    params: TypeCallParams
  ): Promise<AjaxResult<T>> {
    const authData = await this._ensureAuth(requestId)

    this._checkClientSideWarning(requestId)

    const response = await this._makeRequestWithAuthRetry<T>(requestId, method, params, authData)

    // Create and return the result
    return this._createAjaxResultFromResponse<T>(response, requestId, method, params)
  }

  // Get/update authorization
  protected async _ensureAuth(requestId: string): Promise<AuthData> {
    let authData = this._authActions.getAuthData()
    if (authData === false) {
      this._logRefreshingAuthToken(requestId)
      authData = await this._authActions.refreshAuth()
    }
    return authData
  }

  // Execute the request with 401 error handling
  protected async _makeRequestWithAuthRetry<T>(
    requestId: string,
    method: string,
    params: TypeCallParams,
    authData: AuthData
  ): Promise<AjaxResponse<T>> {
    try {
      // 4. Apply the rate limit through the manager
      await this._restrictionManager.checkRateLimit(requestId, method)

      return await this._makeAxiosRequest<T>(requestId, method, params, authData)
    } catch (error) {
      // If this is an authorization error (401), then we try to update the token and repeat
      if (this._isAuthError(error)) {
        this._logAuthErrorDetected(requestId)
        this._logRefreshingAuthToken(requestId)

        const refreshedAuthData = await this._authActions.refreshAuth()

        // 4. Apply the rate limit through the manager
        await this._restrictionManager.checkRateLimit(requestId, method)

        return await this._makeAxiosRequest<T>(requestId, method, params, refreshedAuthData)
      }

      throw error
    }
  }

  protected async _makeAxiosRequest<T>(
    requestId: string,
    method: string,
    params: TypeCallParams,
    authData: AuthData
  ): Promise<AjaxResponse<T>> {
    const response = await this._clientAxios.post<AjaxResultParams<T>>(
      this._prepareMethod(
        requestId,
        method,
        this.getBaseUrl()
      ),
      this._prepareParams(authData, params)
    )
    // // @todo ! api ver3
    // console.log('response', {
    //   result: response,
    //   time: response.data.time
    // })
    return {
      status: response.status,
      payload: response.data
    }
  }

  protected _isAuthError(error: unknown): boolean {
    if (!(error instanceof AjaxError)) {
      return false
    }

    return (
      error.status === 401
      && ['expired_token', 'invalid_token'].includes(error.code)
    )
  }

  protected async _createAjaxResultFromResponse<T>(
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
      await this._restrictionManager.updateStats(requestId, method, response.payload.time)
    }

    return result
  }
  // endregion ////
  // endregion ////

  // region Prepare ////
  /**
   * Makes the function name safe and adds JSON format
   */
  protected _prepareMethod(
    requestId: string,
    method: string,
    baseUrl: string
  ): string {
    const methodUrl = `/${encodeURIComponent(method)}`

    /**
     * @memo For task methods, skip telemetry
     * @see https://apidocs.bitrix24.com/settings/how-to-call-rest-api/data-encoding.html#order-of-parameters
     */
    if (method.includes('task.')) {
      return `${baseUrl}${methodUrl}`
    }

    const queryParams = new URLSearchParams({
      [this._requestIdGenerator.getQueryStringParameterName()]: requestId,
      [this._requestIdGenerator.getQueryStringSdkParameterName()]: '__SDK_VERSION__',
      [this._requestIdGenerator.getQueryStringSdkTypeParameterName()]: '__SDK_USER_AGENT__'
    })
    return `${baseUrl}${methodUrl}?${queryParams.toString()}`
  }

  /**
   * Processes function parameters and adds authorization
   */
  protected _prepareParams(
    authData: AuthData,
    params: TypeCallParams
  ): TypePrepareParams {
    const result: TypePrepareParams = { ...params }

    if (this._logTag.length > 0) {
      result.logTag = this._logTag
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
    this._isClientSideWarning = value
    this._clientSideWarningMessage = message
  }
  // endregion ////

  // region Tools ////
  /**
   * Tests whether the code is executed on the client side
   * @return {boolean}
   * @protected
   */
  protected isServerSide(): boolean {
    return (getEnvironment() !== Environment.BROWSE)
  }

  /**
   * Get the BX24 account address with the path based on the API version
   */
  public getBaseUrl(): string {
    return this._authActions.getTargetOriginWithPath().get(this._version)!
  }
  // endregion ////

  // region Log ////
  protected _sanitizeParams(params: TypeCallParams): Record<string, unknown> {
    const sanitized = { ...params }
    const sensitiveKeys = ['auth', 'password', 'token', 'secret', 'access_token', 'refresh_token']

    sensitiveKeys.forEach((key) => {
      if (key in sanitized && sanitized[key]) {
        sanitized[key] = '***REDACTED***'
      }
    })

    return sanitized
  }

  protected _logRequest(requestId: string, method: string, params: TypeCallParams): void {
    this.getLogger().debug(`http request starting`, {
      requestId,
      method,
      params: this._sanitizeParams(params),
      api: this.apiVersion,
      timestamp: Date.now()
    })
  }

  protected _logAttempt(requestId: string, method: string, attempt: number, maxRetries: number): void {
    this.getLogger().info(`http request attempt`, {
      requestId,
      method,
      api: this.apiVersion,
      attempt: {
        current: attempt,
        max: maxRetries
      }
    })
  }

  protected _logRefreshingAuthToken(requestId: string): void {
    this.getLogger().info(`http refreshing auth token`, {
      requestId,
      api: this.apiVersion
    })
  }

  protected _logAuthErrorDetected(requestId: string): void {
    this.getLogger().info(`http auth error detected`, {
      requestId,
      api: this.apiVersion
    })
  }

  protected _logSuccessfulRequest(requestId: string, method: string, duration: number): void {
    this.getLogger().debug(`http request successful`, {
      requestId,
      method,
      api: this.apiVersion,
      duration: {
        ms: duration,
        sec: Number.parseFloat((duration / 1000).toFixed(2))
      }
    })
  }

  protected _logFailedRequest(
    requestId: string,
    method: string,
    attempt: number,
    maxRetries: number,
    error: AjaxError
  ): void {
    this.getLogger().debug(`http request failed`, {
      requestId,
      method,
      api: this.apiVersion,
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

  protected _logAttemptRetryWaiteDelay(
    requestId: string,
    method: string,
    wait: number,
    attempt: number,
    maxRetries: number
  ): void {
    this.getLogger().debug(
      `http wait ${(wait / 1000).toFixed(2)} sec.`,
      {
        requestId,
        method,
        api: this.apiVersion,
        wait: wait,
        attempt: {
          current: attempt,
          max: maxRetries
        }
      }
    )
  }

  protected _logAllAttemptsExhausted(requestId: string, method: string, attempt: number, maxRetries: number): void {
    this.getLogger().warning(`http all retry attempts exhausted`, {
      requestId,
      method,
      api: this.apiVersion,
      attempt: {
        current: attempt,
        max: maxRetries
      }
    })
  }

  protected _logBatchStart(
    requestId: string,
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options: ICallBatchOptions
  ): void {
    const callCount = Array.isArray(calls)
      ? calls.length
      : Object.keys(calls).length

    this.getLogger().debug(`http batch request starting `, {
      requestId,
      callCount,
      api: this.apiVersion,
      isHaltOnError: options.isHaltOnError,
      timestamp: Date.now()
    })
  }

  protected _logBatchCompletion(requestId: string, total: number, errors: number): void {
    this.getLogger().debug(`http batch request completed`, {
      requestId,
      api: this.apiVersion,
      totalCalls: total,
      successful: total - errors,
      failed: errors,
      successRate: total > 0 ? ((total - errors) / (total) * 100).toFixed(1) + '%' : '??'
    })
  }

  protected _logBatchSubCallFailed(requestId: string, index: string | number, method: string, code: string, status: number, errorMessage: string): void {
    this.getLogger().debug(`http batch sub-call failed`, {
      requestId,
      index,
      method,
      api: this.apiVersion,
      error: {
        code: code,
        message: errorMessage,
        status
      }
    })
  }

  // Check client-side warnings
  protected _checkClientSideWarning(requestId: string): void {
    if (
      this._isClientSideWarning
      && !this.isServerSide()
      && Type.isStringFilled(this._clientSideWarningMessage)
    ) {
      LoggerFactory.forcedLog(
        this.getLogger(),
        'warning',
        this._clientSideWarningMessage,
        {
          requestId,
          code: 'JSSDK_CLIENT_SIDE_WARNING'
        }
      )
    }
  }
  // endregion ////
}
