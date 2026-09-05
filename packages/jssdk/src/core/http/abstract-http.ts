import type { LoggerInterface } from '../../logger'
import type {
  AjaxIdempotency,
  TypeCallOptions,
  TypeCallParams,
  TypeHttp,
  ICallBatchOptions,
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
  ICallBatchResult
} from '../../types/http'
import type { RestrictionManagerStats, RestrictionParams } from '../../types/limiters'
import type { AuthActions, AuthData } from '../../types/auth'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import type { Result } from '../result'
import type { SuccessPayload } from '../../types/payloads'
import axios, { AxiosError } from 'axios'
import { LoggerFactory } from '../../logger'
import { RequestIdGenerator } from '../request-id-generator'
import { ParamsFactory } from './limiters/params-factory'
import { RestrictionManager } from './limiters/manager'
import { AjaxError } from './ajax-error'
import { parseErrorPayload } from './parse-error-payload'
import { AjaxResult } from './ajax-result'
import { redactSensitiveParams } from './redact'
import { Type } from '../../tools/type'
import { Environment, getEnvironment } from '../../tools/environment'
import { ApiVersion } from '../../types/b24'
import { SdkError } from '../sdk-error'

// Logger payloads are truncated so a large params / result / error body can't
// flood a wired logger sink. Shared by the post/send, post/response, and
// post/catchError log callsites (#236).
// `value` is deliberately `unknown` rather than `string`: every callsite feeds it
// `JSON.stringify(...)`, whose return type is a lying `string` — it actually
// returns the VALUE `undefined` for `undefined`, a function, or a symbol. A
// success body with no `result` key (`rest.documentation.openapi`) and an
// AxiosError with no `response` (network failure, timeout, CORS) both hit that
// case, and reading `.length` off it threw a `TypeError` from inside the logging
// call — which the request path then re-wrapped as `JSSDK_UNKNOWN_ERROR` /
// status 0, destroying the real error. Coercing here keeps the guarantee at the
// one place all three callsites share, so a new callsite can't reintroduce it. (#338)
const LOG_MAX_LENGTH = 300
const LOG_SLICE_LENGTH = 100
export function truncateForLog(value: unknown): string {
  const text = typeof value === 'string' ? value : String(value)
  return text.length > LOG_MAX_LENGTH
    ? text.slice(0, LOG_SLICE_LENGTH) + '...'
    : text
}

/**
 * Header for a per-request idempotency key on `restApi:v3`. Sent in this
 * casing; read back case-insensitively, because the portal answers lowercased
 * and axios normalises differently per adapter.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'
const IDEMPOTENCY_KEY_HEADER_LOWER = 'idempotency-key'
const IDEMPOTENT_REPLAYED_HEADER_LOWER = 'idempotent-replayed'

/**
 * A valid idempotency key: 1-255 printable ASCII characters, no whitespace and
 * no control characters, as the portal's reference states.
 *
 * Checked before the key reaches axios so a malformed one fails as a readable
 * SDK error rather than as an opaque `ERR_INVALID_CHAR` out of Node's HTTP
 * client (or a silent rejection in a browser). The bound is the documented
 * one; a portal that later widens it would need this widened with it.
 */
const IDEMPOTENCY_KEY_RE = /^[\u0021-\u007E]{1,255}$/

/**
 * Picks the two idempotency headers out of a response header bag, by
 * lowercased name.
 *
 * Deliberately two named headers rather than the whole bag: putting arbitrary
 * response headers on a public result object would also put them into every
 * wired logger sink, and the SDK does not know what a portal or a proxy in
 * front of it may add there.
 *
 * Returns `undefined` when neither header is present, so an ordinary response
 * carries no extra field at all.
 */
export function readIdempotencyHeaders(headers: unknown): AjaxIdempotency | undefined {
  if (null === headers || typeof headers !== 'object') {
    return undefined
  }

  let key: string | undefined
  let replayed: boolean | undefined

  for (const [name, rawValue] of Object.entries(headers as Record<string, unknown>)) {
    const lowerName = name.toLowerCase()

    // A repeated header name reaches us as an array through Node's http
    // adapter. Bitrix24 does not send either of these twice, but a proxy in
    // front of it may — and reading the array itself would stringify to
    // `true,true`, which matches nothing and would swallow a real replay.
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue

    if (IDEMPOTENCY_KEY_HEADER_LOWER === lowerName && typeof value === 'string') {
      key = value
    } else if (IDEMPOTENT_REPLAYED_HEADER_LOWER === lowerName) {
      // The portal sends the string `true`; accept the boolean too, since an
      // adapter or a test double may have parsed it already.
      replayed = true === value || 'true' === String(value).trim().toLowerCase()
    }
  }

  if (undefined === key && undefined === replayed) {
    return undefined
  }

  return { key, replayed: replayed ?? false }
}

export type AjaxResponse<T = unknown> = {
  status: number
  payload: SuccessPayload<T>
  /** Present only when the response carried an idempotency header. */
  idempotency?: AjaxIdempotency
}

export type TypePrepareParams = TypeCallParams & {
  data?: Record<string, any>
  auth?: string
}

/**
 * Abstract base class for all Bitrix24 REST API HTTP transports.
 *
 * Provides shared infrastructure used by {@link HttpV2} and {@link HttpV3}: Axios instance
 * lifecycle, auth token management (including coalesced refresh on 401), rate/operating/adaptive
 * limiting via {@link RestrictionManager}, request-id generation, structured logging with
 * payload truncation, and request metrics. Concrete subclasses implement version-specific
 * batch strategies.
 *
 * @link https://bitrix24.github.io/b24jssdk/
 */
export abstract class AbstractHttp implements TypeHttp {
  protected _clientAxios: AxiosInstance
  protected _authActions: AuthActions
  protected _requestIdGenerator: RequestIdGenerator
  protected _restrictionManager: RestrictionManager

  /**
   * In-flight token refresh, shared so concurrent 401s coalesce into a single
   * `refreshAuth()` round-trip — avoids OAuth refresh-token reuse errors when a
   * burst of requests expires together. (#182)
   */
  protected _pendingRefresh: Promise<AuthData> | null = null

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
      timeout: 30_000,
      timeoutErrorMessage: 'Request timeout exceeded',
      ...(options ?? {}),
      // headers last so the merged default + caller headers aren't wiped by an
      // `options.headers` (or the previous `headers: undefined`) spread (#144).
      headers: {
        ...defaultHeaders,
        ...((options as any)?.headers ?? {})
      }
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

  get ajaxClient(): AxiosInstance {
    return this._clientAxios
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
      totalRequests: this._metrics.totalRequests,
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
    this._metrics.totalRequests = 0
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
   * @param options - Per-request transport options (currently `idempotencyKey`)
   * @returns Promise with AjaxResult
   */
  public async call<T = unknown>(method: string, params: TypeCallParams, requestId?: string, options?: TypeCallOptions): Promise<AjaxResult<T>> {
    requestId = requestId ?? this._requestIdGenerator.getRequestId()
    const maxRetries = this._restrictionManager.getParams().maxRetries!

    this._validateParams(requestId, method, params)
    this._logRequest(requestId, method, params)

    // Built once, before the retry loop, and threaded down as config rather
    // than as options. Three reasons, all of them found the hard way:
    // a malformed key must fail as `JSSDK_HTTP_INVALID_IDEMPOTENCY_KEY` — built
    // inside the loop it was thrown inside the try, converted by
    // `_convertToAjaxError`, and reached the caller as `JSSDK_UNKNOWN_ERROR`;
    // `HttpV2`'s dropped-key warning belongs to the call, not to each attempt;
    // and the same config must go out on every attempt, since a retry of one
    // operation has to carry the same key. (#462)
    const requestConfig = this._prepareRequestConfig(requestId, method, options)

    let lastError: AjaxError | null = null
    const startTime = Date.now()

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this._logAttempt(requestId, method, attempt + 1, maxRetries)

        // Apply operating limits via the manager
        await this._restrictionManager.applyOperatingLimits(requestId, method, params)

        // 3. We execute the request taking into account authorization, rate limit, and update operating statistics.
        const result = await this._executeSingleCall<T>(requestId, method, params, requestConfig)
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

        if (attempt + 1 < maxRetries) {
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

    // Unreachable on normal exhaustion — the final attempt throws `lastError` (its
    // real code) above. Only reached when maxRetries < 1: the loop never runs and
    // there is no lastError to surface. (#143)
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
    const errorCode = `${axiosError.code || 'JSSDK_AXIOS_ERROR'}`
    const errorDescription = axiosError.message
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

    // Shared with `AjaxResult.#processErrors()`. Which of the two runs depends on
    // whether the code is soft or hard — not something a caller controls — so
    // they have to agree, and when this was written out in both places they did
    // not: neither read `validation[].field` (#423).
    const parsed = parseErrorPayload(axiosError.response?.data, errorCode, errorDescription)

    return new AjaxError({
      code: parsed?.code ?? errorCode,
      description: parsed?.description ?? errorDescription,
      status,
      validation: parsed?.validation,
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
  protected async _executeSingleCall<T = unknown>(requestId: string, method: string, params: TypeCallParams, requestConfig?: AxiosRequestConfig): Promise<AjaxResult<T>> {
    this._checkClientSideWarning(requestId)
    const authData = await this._ensureAuth(requestId)
    const response = await this._makeRequestWithAuthRetry<T>(requestId, method, params, authData, requestConfig)

    return this._createAjaxResultFromResponse<T>(response, requestId, method, params)
  }

  // Get/update authorization
  protected async _ensureAuth(requestId: string): Promise<AuthData> {
    let authData = this._authActions.getAuthData()
    if (authData === false) {
      this._logRefreshingAuthToken(requestId)
      authData = await this._refreshAuth()
    }
    return authData
  }

  /**
   * Refresh the auth token, coalescing concurrent callers onto a single
   * in-flight `refreshAuth()` so a burst of 401s triggers exactly one refresh
   * round-trip. The slot clears once the refresh settles. (#182)
   */
  protected _refreshAuth(): Promise<AuthData> {
    if (this._pendingRefresh) {
      return this._pendingRefresh
    }
    const refresh = this._authActions.refreshAuth()
    this._pendingRefresh = refresh
    // Clear the slot once settled; the extra no-op catch keeps this cleanup
    // chain from surfacing as an unhandled rejection — callers still receive
    // the rejection through the returned promise.
    refresh.finally(() => {
      this._pendingRefresh = null
    }).catch(() => {})
    return refresh
  }

  // Execute the request with 401 error handling
  protected async _makeRequestWithAuthRetry<T>(requestId: string, method: string, params: TypeCallParams, authData: AuthData, requestConfig?: AxiosRequestConfig): Promise<AjaxResponse<T>> {
    try {
      // 4. Apply the rate limit through the manager
      await this._restrictionManager.checkRateLimit(requestId, method)

      return await this._makeAxiosRequest<T>(requestId, method, params, authData, requestConfig)
    } catch (error) {
      if (error instanceof AxiosError) {
        this.getLogger().info(
          `post/catchError`, {
            requestId,
            status: error.status,
            // Redact in case a future portal response embeds credentials in
            // the error body (today it doesn't, but the channel is open) (#39),
            // and cap the length so a large error body can't flood the sink (#236).
            responseData: truncateForLog(JSON.stringify(redactSensitiveParams(error?.response?.data), null, 0))
          }
        ).catch(() => {})
      }

      // Normalize to AjaxError first: axios throws a raw AxiosError here, whose
      // Bitrix `code` (e.g. `expired_token`) is only populated by conversion. The
      // 401 auth-retry check must run against the converted error — otherwise the
      // `instanceof AjaxError` guard in `_isAuthError` is always false and the
      // refresh-and-retry branch below is dead code. (#182)
      const ajaxError = this._convertToAjaxError(requestId, error, method, params)

      // If this is an authorization error (401), then we try to update the token and repeat
      if (this._isAuthError(ajaxError)) {
        this._logAuthErrorDetected(requestId)
        this._logRefreshingAuthToken(requestId)

        const refreshedAuthData = await this._refreshAuth()

        // 4. Apply the rate limit through the manager
        await this._restrictionManager.checkRateLimit(requestId, method)

        return await this._makeAxiosRequest<T>(requestId, method, params, refreshedAuthData, requestConfig)
      }

      // Non-auth error: rethrow the already-converted AjaxError (idempotent in
      // `call()`'s catch) instead of the raw AxiosError. (#182)
      throw ajaxError
    }
  }

  protected async _makeAxiosRequest<T>(requestId: string, method: string, params: TypeCallParams, authData: AuthData, requestConfig?: AxiosRequestConfig): Promise<AjaxResponse<T>> {
    const methodFormatted = this._prepareMethod(requestId, method, this.getBaseUrl())

    const paramsFormatted = this._prepareParams(authData, params)
    // `paramsFormatted` carries the OAuth `auth` (access_token) for non-hook flows;
    // log a redacted copy so the secret never enters logger context, while axios
    // still receives the original below. (#39)
    const paramsFormattedForLog = JSON.stringify(redactSensitiveParams(paramsFormatted), null, 0)

    this.getLogger().info(
      `post/send`, {
        requestId,
        method,
        params: truncateForLog(paramsFormattedForLog)
      }
    ).catch(() => {})

    const response = await this._clientAxios.post<SuccessPayload<T>>(methodFormatted, paramsFormatted, requestConfig)

    // Redact the log-bound copy only; callers still receive the untouched
    // `response.data` below. First-party success bodies don't embed credentials
    // today, but an OAuth-relay method (or a future method returning a canonical
    // key) would otherwise leak `access_token` / `refresh_token` / etc. into any
    // wired logger sink — mirror the `post/send` redaction on the success path. (#69)
    // A v3 method outside the `result` envelope (e.g. `rest.documentation.openapi`)
    // makes this `undefined` rather than a string; `truncateForLog` coerces it. (#338)
    // `?.` on the body itself, not only on `.result`: a success is not always an
    // object. An HTTP 200 whose body is `null` made this line throw, and the
    // request path then re-wrapped that `TypeError` as `JSSDK_UNKNOWN_ERROR` —
    // a fine response reaching the caller as an unrecognisable failure, the same
    // shape as #338 and #456 one field over.
    const resultFormattedForLog = JSON.stringify(redactSensitiveParams(response.data?.result), null, 0)
    this.getLogger().info(
      `post/response`, {
        requestId,
        // responseFull: JSON.stringify(response.data, null, 2),
        result: truncateForLog(resultFormattedForLog),
        time: JSON.stringify(response.data?.time, null, 0)
      }
    ).catch(() => {})

    const idempotency = readIdempotencyHeaders(response.headers)

    return {
      status: response.status,
      payload: response.data,
      ...(idempotency ? { idempotency } : {})
    }
  }

  /**
   * Builds the per-request axios config for one call, or `undefined` when the
   * call needs none.
   *
   * A `protected` hook rather than a branch inside `_makeAxiosRequest` because
   * the two transports genuinely disagree about one option: `HttpV2` overrides
   * it to drop `idempotencyKey`, since the v2 endpoint ignores the header and a
   * key that is silently dropped leaves a caller believing a retry is
   * deduplicated when it is not. It is the mechanism for that disagreement, not
   * a speculative extension point — a subclass overriding it owes the same
   * contract: return per-request axios config, or `undefined` for none.
   *
   * @throws {SdkError} `JSSDK_HTTP_INVALID_IDEMPOTENCY_KEY` when the key is not
   *   1-255 printable ASCII characters.
   */
  protected _prepareRequestConfig(_requestId: string, _method: string, options?: TypeCallOptions): AxiosRequestConfig | undefined {
    const idempotencyKey = options?.idempotencyKey

    if (undefined === idempotencyKey) {
      return undefined
    }

    if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      // Static text only — never the key itself. `SdkError` does not run its
      // description through `redactSensitiveParams`, and a caller is free to
      // build a key out of business identifiers.
      throw new SdkError({
        code: 'JSSDK_HTTP_INVALID_IDEMPOTENCY_KEY',
        description: '`idempotencyKey` must be 1-255 printable ASCII characters with no whitespace or control characters. '
          + 'A `crypto.randomUUID()` value satisfies this. See https://apidocs.bitrix24.ru/api-reference/rest-v3.html',
        status: 500
      })
    }

    return { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } }
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

  protected async _createAjaxResultFromResponse<T>(response: AjaxResponse<T>, requestId: string, method: string, params: TypeCallParams): Promise<AjaxResult<T>> {
    const result = new AjaxResult<T>({
      answer: response.payload,
      query: { method, params, requestId },
      status: response.status,
      idempotency: response.idempotency
    })

    // 5. Update operating statistics — only when the portal sent a `time` block.
    // It does not always: `rest.documentation.openapi` answers with the OpenAPI
    // document at the top level, with neither a `result` envelope nor `time`.
    // The `time!` assertion that used to stand here claimed otherwise, and
    // `OperatingLimiter.updateStats()` destructured the absent block — so a
    // perfectly good HTTP 200 came back to the caller as an exception.
    if (result.isSuccess) {
      const time = result.getData()?.time
      if (time) {
        await this._restrictionManager.updateStats(requestId, method, time)
      }
    }

    return result
  }

  /**
   * Turns an error the transport already built into the soft `AjaxResult` a
   * caller receives, for the codes in `RestrictionManager.exceptionCodeForSoft`.
   *
   * It used to rebuild the error from a synthetic answer holding only `code` and
   * `message`, so the portal's real body was discarded here — which is why
   * `validation` was unreachable even though `_convertAxiosErrorToAjaxError` had
   * just parsed it (#423).
   *
   * The error is now **carried** rather than re-derived: the synthetic `answer`
   * is kept so `_data` still describes the failure for anything reading it, but
   * it is no longer what produces the error — which also means the two can no
   * longer disagree. `validation` is deliberately not copied into that synthetic
   * answer: nothing parses it back out, so it would be dead weight that a future
   * refactor could mistake for the source of truth.
   *
   * The carried error keeps its `originalError` — the raw `AxiosError`, whose
   * `config.url` holds the webhook secret. It is non-enumerable (see
   * `SdkError`), so spreads and `JSON.stringify` still cannot reach it, but it
   * is now readable via `result.getErrors()` on this path as well as on the
   * throwing one. That is deliberate: the two paths differ only in how the error
   * is delivered, and a caller debugging one should not find less on the other.
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
      status: ajaxError.status,
      // The error itself, not a reconstruction: it was parsed from the portal's
      // body a moment ago, and re-deriving it here would fold the validation
      // messages onto a description that already holds them (#423).
      error: ajaxError
    })
  }
  // endregion ////
  // endregion ////

  // region Prepare ////
  /**
   * Builds the request URL: the method path plus the SDK telemetry query params
   * (`bx24_request_id` / `bx24_sdk_ver` / `bx24_sdk_type` — request tracing and
   * SDK identification, not auth material).
   *
   * Carve-out for the legacy positional `task.*` methods (`task.commentitem.*`,
   * `task.checklistitem.*`, `task.elapseditem.*`, …): these read the request
   * **query string positionally**, so appending the telemetry params shifts
   * `Param #0` and the server rejects the call —
   * `WRONG_ARGUMENTS: Param #0 (taskId) ... expected integer, but given
   * something else`. Verified live against a portal: the same
   * `task.commentitem.getlist` / `task.checklistitem.getlist` call succeeds
   * without the telemetry params and fails with them; modern `tasks.task.*`
   * (named params) is unaffected. So telemetry is omitted only for methods whose
   * name STARTS WITH `task.`.
   *
   * Shared by v2 and v3 (rather than per-transport): once the v3 method
   * allowlist was dropped (#259) a positional `task.*` method can be routed via
   * `actions.v3.*` too, so v3 needs the same suppression — keeping the rule in
   * one place stops the two transports drifting apart again (#207).
   *
   * The match is anchored (`^task\.`): only legacy positional `task.*` methods
   * are suppressed. Modern named-param methods `tasks.task.*` / `bizproc.task.*`
   * do NOT start with `task.`, so they KEEP telemetry and stay traceable — the
   * boundary was pinned live in #271/#272 (`tasks.task.list` works WITH
   * telemetry; legacy `task.*` breaks WITH it). Bitrix24 method names are
   * lowercase by convention, so the case-sensitive match is sufficient.
   *
   * @see https://apidocs.bitrix24.com/settings/how-to-call-rest-api/data-encoding.html#order-of-parameters
   */
  protected _prepareMethod(requestId: string, method: string, baseUrl: string): string {
    const methodUrl = `/${encodeURIComponent(method)}`

    if (/^task\./.test(method)) {
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
  /**
   * Redaction contract: runs caller params through {@link redactSensitiveParams}
   * (see `redact.ts`) so credential-bearing keys are masked before they reach any
   * logger context. (#39, #73)
   * @see redactSensitiveParams
   */
  protected _sanitizeParams(params: TypeCallParams): Record<string, unknown> {
    return redactSensitiveParams(params)
  }

  /**
   * Redaction contract: params are redacted via {@link _sanitizeParams} →
   * {@link redactSensitiveParams} before logging. (#73)
   * @see redactSensitiveParams
   */
  protected _logRequest(requestId: string, method: string, params: TypeCallParams): void {
    this.getLogger().debug(`http request starting`, {
      requestId,
      method,
      params: this._sanitizeParams(params),
      api: this.apiVersion,
      timestamp: Date.now()
    }).catch(() => {})
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
    }).catch(() => {})
  }

  protected _logRefreshingAuthToken(requestId: string): void {
    this.getLogger().info(`http refreshing auth token`, {
      requestId,
      api: this.apiVersion
    }).catch(() => {})
  }

  protected _logAuthErrorDetected(requestId: string): void {
    this.getLogger().info(`http auth error detected`, {
      requestId,
      api: this.apiVersion
    }).catch(() => {})
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
    }).catch(() => {})
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
    }).catch(() => {})
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
    ).catch(() => {})
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
    }).catch(() => {})
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
    }).catch(() => {})
  }

  protected _logBatchCompletion(requestId: string, total: number, errors: number): void {
    this.getLogger().debug(`http batch request completed`, {
      requestId,
      api: this.apiVersion,
      totalCalls: total,
      successful: total - errors,
      failed: errors,
      successRate: total > 0 ? ((total - errors) / (total) * 100).toFixed(1) + '%' : '??'
    }).catch(() => {})
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
