import type { LoggerInterface } from '../../logger'
import type {
  TypeCallParams,
  TypeHttp,
  ICallBatchOptions,
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  ICallBatchResult
} from '../../types/http'
import type { RestrictionManagerStats, RestrictionParams } from '../../types/limiters'
import type { AuthActions, AuthData, TypeDescriptionError, TypeDescriptionErrorV3 } from '../../types/auth'
import type { AxiosInstance } from 'axios'
import type { Result } from '../result'
import type { SuccessPayload } from '../../types/payloads'
import axios, { AxiosError } from 'axios'
import { LoggerFactory } from '../../logger'
import { RequestIdGenerator } from '../request-id-generator'
import { ParamsFactory } from './limiters/params-factory'
import { RestrictionManager } from './limiters/manager'
import { AjaxError } from './ajax-error'
import { AjaxResult } from './ajax-result'
import { Type } from '../../tools/type'
import { Environment, getEnvironment } from '../../tools/environment'
import { ApiVersion } from '../../types/b24'

export type AjaxResponse<T = unknown> = {
  status: number
  payload: SuccessPayload<T>
}

export type TypePrepareParams = TypeCallParams & {
  data?: Record<string, any>
  auth?: string
}

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
    this._version = ApiVersion.v2

    this._logger = LoggerFactory.createNullLogger()

    const defaultHeaders: Record<string, string> = {}

    if (this.isServerSide()) {
      defaultHeaders['User-Agent'] = '__SDK_USER_AGENT__/__SDK_VERSION__'
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

  // region Metrics ////
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
  // endregion ////

  // region Actions Call ////
  // region batch ////
  public abstract batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>>
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
  public async call<T = unknown>(method: string, params: TypeCallParams, requestId?: string): Promise<AjaxResult<T>> {
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
          this._logAllAttemptsExhausted(requestId, method, attempt + 1, maxRetries)
        }

        /**
         * We decide whether to throw an error in `AjaxResult` or throw an exception.
         */
        if (this._restrictionManager.exceptionCodeForSoft.includes(lastError.code)) {
          return this._createAjaxResultWithErrorFromResponse<T>(lastError, requestId, method, params)
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

  protected _convertToAjaxError(requestId: string, error: unknown, method: string, params: TypeCallParams): AjaxError {
    if (error instanceof AjaxError) {
      return error
    }

    if (error instanceof AxiosError) {
      return this._convertAxiosErrorToAjaxError(requestId, error, method, params)
    }

    return this._convertUnknownErrorToAjaxError(requestId, error, method, params)
  }

  protected _convertAxiosErrorToAjaxError(requestId: string, axiosError: AxiosError, method: string, params: TypeCallParams): AjaxError {
    let errorCode = `${axiosError.code || 'JSSDK_AXIOS_ERROR'}`
    let errorDescription = axiosError.message
    const status = axiosError.response?.status || 0

    // Handling network errors
    if (errorCode === 'ERR_NETWORK') {
      return new AjaxError({
        code: 'NETWORK_ERROR',
        description: 'Network connection failed',
        status: 0,
        requestInfo: { method, params, requestId },
        originalError: axiosError
      })
    }

    // Handling timeout
    if (errorCode === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
      return new AjaxError({
        code: 'REQUEST_TIMEOUT',
        description: 'Request timeout exceeded',
        status: 408,
        requestInfo: { method, params, requestId },
        originalError: axiosError
      })
    }

    /**
     * @todo make single function
     * @see AjaxResult.#processErrors()
     */
    if (axiosError.response?.data && typeof axiosError.response.data === 'object') {
      const responseData = axiosError.response.data as TypeDescriptionError | TypeDescriptionErrorV3
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
        errorCode = responseData.error !== '0' ? responseData.error : errorCode
        errorDescription = (responseData as TypeDescriptionError)?.error_description ?? errorDescription
      }
    }

    return new AjaxError({
      code: errorCode,
      description: errorDescription,
      status,
      requestInfo: { method, params, requestId },
      originalError: axiosError
    })
  }

  protected _convertUnknownErrorToAjaxError(requestId: string, error: unknown, method: string, params: TypeCallParams): AjaxError {
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
  protected async _executeSingleCall<T = unknown>(requestId: string, method: string, params: TypeCallParams): Promise<AjaxResult<T>> {
    this._checkClientSideWarning(requestId)
    const authData = await this._ensureAuth(requestId)
    const response = await this._makeRequestWithAuthRetry<T>(requestId, method, params, authData)

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
  protected async _makeRequestWithAuthRetry<T>(requestId: string, method: string, params: TypeCallParams, authData: AuthData): Promise<AjaxResponse<T>> {
    try {
      // 4. Apply the rate limit through the manager
      await this._restrictionManager.checkRateLimit(requestId, method)

      return await this._makeAxiosRequest<T>(requestId, method, params, authData)
    } catch (error) {
      if (error instanceof AxiosError) {
        this.getLogger().info(
          `post/catchError`, {
            requestId,
            status: error.status,
            responseData: JSON.stringify(error?.response?.data, null, 0)
          }
        )
      }

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

  protected async _makeAxiosRequest<T>(requestId: string, method: string, params: TypeCallParams, authData: AuthData): Promise<AjaxResponse<T>> {
    const methodFormatted = this._prepareMethod(requestId, method, this.getBaseUrl())

    const paramsFormatted = this._prepareParams(authData, params)
    const paramsFormattedForLog = JSON.stringify(paramsFormatted, null, 0)

    const maxLogLength = 300
    const sliceLogLength = 100
    this.getLogger().info(
      `post/send`, {
        requestId,
        method: methodFormatted,
        params: paramsFormattedForLog.length > maxLogLength ? paramsFormattedForLog.slice(0, sliceLogLength) + '...' : paramsFormattedForLog
      }
    )

    const response = await this._clientAxios.post<SuccessPayload<T>>(methodFormatted, paramsFormatted)

    const resultFormattedForLog = JSON.stringify(response.data.result, null, 0)
    this.getLogger().info(
      `post/response`, {
        requestId,
        // responseFull: JSON.stringify(response.data, null, 2),
        result: resultFormattedForLog.length > maxLogLength ? resultFormattedForLog.slice(0, sliceLogLength) + '...' : resultFormattedForLog,
        time: JSON.stringify(response.data.time, null, 0)
      }
    )

    return {
      status: response.status,
      payload: response.data
    }
  }

  protected _isAuthError(error: unknown): boolean {
    if (!(error instanceof AjaxError)) {
      return false
    }

    // @todo ! test this
    return (
      error.status === 401
      && ['expired_token', 'invalid_token'].includes(error.code)
    )
  }

  protected async _createAjaxResultFromResponse<T>(response: AjaxResponse<T>, requestId: string, method: string, params: TypeCallParams): Promise<AjaxResult<T>> {
    const result = new AjaxResult<T>({
      answer: response.payload,
      query: { method, params, requestId },
      status: response.status
    })

    // 5. Update operating statistics
    if (result.isSuccess) {
      const time = result.getData()?.time
      await this._restrictionManager.updateStats(requestId, method, time!)
    }

    return result
  }

  /**
   * This works in conjunction with the AbstractHttp._convertAxiosErrorToAjaxError function
   */
  protected _createAjaxResultWithErrorFromResponse<T>(ajaxError: AjaxError, requestId: string, method: string, params: TypeCallParams): AjaxResult<T> {
    return new AjaxResult<T>({
      answer: {
        error: {
          code: ajaxError.code,
          message: ajaxError.message
        }
      },
      query: { method, params, requestId },
      status: ajaxError.status
    })
    //
    // result.addError(ajaxError)
    //
    // return result
  }
  // endregion ////
  // endregion ////

  // region Prepare ////
  /**
   * Makes the function name safe and adds JSON format
   */
  protected abstract _prepareMethod(requestId: string, method: string, baseUrl: string): string

  /**
   * Processes function parameters and adds authorization
   */
  protected _prepareParams(authData: AuthData, params: TypeCallParams): TypePrepareParams {
    const result: TypePrepareParams = { ...params }

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
