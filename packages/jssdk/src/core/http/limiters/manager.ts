import type { RestrictionParams, RestrictionManagerStats } from '../../../types/limiters'
import type { LoggerInterface } from '../../../types/logger'
import { LoggerFactory } from '../../../logger'
import { RateLimiter } from './rate-limiter'
import { OperatingLimiter } from './operating-limiter'
import { AdaptiveDelayer } from './adaptive-delayer'

/**
 * Delay Management Manager
 *
 * @todo docs
 */
export class RestrictionManager {
  #rateLimiter: RateLimiter
  #operatingLimiter: OperatingLimiter
  #adaptiveDelayer: AdaptiveDelayer
  #config: RestrictionParams
  #stats: Pick<RestrictionManagerStats, 'retries' | 'consecutiveErrors' | 'limitHits'> = {
    /** Retry attempts */
    retries: 0,
    /** Consecutive errors */
    consecutiveErrors: 0,
    /** Limit triggers */
    limitHits: 0
  }

  #errorCounts = new Map<string, number>()

  private _logger: LoggerInterface

  constructor(params: RestrictionParams) {
    this._logger = LoggerFactory.createNullLogger()
    this.#config = params
    this.#rateLimiter = new RateLimiter(params.rateLimit!)
    this.#operatingLimiter = new OperatingLimiter(params.operatingLimit!)
    this.#adaptiveDelayer = new AdaptiveDelayer(params.adaptiveConfig!, this.#operatingLimiter)
  }

  // region Logger ////
  setLogger(logger: LoggerInterface): void {
    this._logger = logger
    this.#rateLimiter.setLogger(this._logger)
    this.#operatingLimiter.setLogger(this._logger)
    this.#adaptiveDelayer.setLogger(this._logger)
  }

  getLogger(): LoggerInterface {
    return this._logger
  }
  // endregion ////

  async applyOperatingLimits(requestId: string, method: string, params?: any): Promise<void> {
    // 1. Check operating limit
    const operatingWait = await this.#operatingLimiter.waitIfNeeded(requestId, method, params)
    if (operatingWait > 0) {
      this.incrementStats('limitHits')
      this.#logMethodBlocked(this.#operatingLimiter.getTitle(), requestId, method, operatingWait)
      await this.#delay(operatingWait)
    } else {
      // 2. Apply adaptive delay
      const adaptiveDelay = await this.#adaptiveDelayer.waitIfNeeded(requestId, method, params)
      if (adaptiveDelay > 0) {
        this.incrementStats('limitHits')
        this.#logMethodBlocked(this.#adaptiveDelayer.getTitle(), requestId, method, adaptiveDelay)
        await this.#delay(adaptiveDelay)
      }
    }
  }

  /**
   * Checks and waits for the rate limit
   * The loop is needed for parallel requests (Promise.all())
   */
  async checkRateLimit(requestId: string, method: string): Promise<void> {
    // 3. Apply rate limit
    let waitTime
    let times = 1
    do {
      waitTime = await this.#rateLimiter.waitIfNeeded(requestId, method)
      if (waitTime > 0) {
        this.incrementStats('limitHits')
        this.#logMethodBlockedWithTimes(this.#rateLimiter.getTitle(), requestId, method, waitTime, times)
        await this.#delay(waitTime)
        times++
      }
    } while (waitTime > 0)
  }

  async updateStats(
    requestId: string,
    method: string,
    timeData: any
  ): Promise<void> {
    await this.#operatingLimiter.updateStats(requestId, method, timeData)
    await this.#adaptiveDelayer.updateStats(requestId, method, timeData)
    await this.#rateLimiter.updateStats(requestId, method, timeData)
  }

  async handleError(
    requestId: string,
    method: string,
    params: any,
    error: any,
    attempt: number
  ): Promise<number> {
    // Rate limit exceeded
    if (this.#isRateLimitError(error)) {
      // Since this is error handling, we take into account the number of attempts
      const wait = (await this.#handleRateLimitExceeded(requestId)) * Math.pow(1.5, attempt)
      this.#logError(this.#rateLimiter.getTitle(), requestId, 'QUERY_LIMIT_EXCEEDED', error.message, method, wait)
      return wait
    }

    // Operating limit exceeded
    if (this.#isOperatingLimitError(error)) {
      // Since this is error handling, we will increase the minimum to 10 seconds.
      const wait = Math.max(10_000, await this.#handleOperatingLimitError(requestId, method, params, error))
      this.#logError(this.#operatingLimiter.getTitle(), requestId, 'OPERATION_TIME_LIMIT', error.message, method, wait)
      return wait
    }

    // Other exceptions
    if (!this.#isNeedThrowError(error)) {
      // Since this is error handling, we take into account the number of attempts
      const baseDelay = await this.#getErrorBackoff(requestId)
      const maxDelay = Math.max(30_000, baseDelay)
      const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))

      // Add jitter to prevent thundering herd
      const jitter = delay * 0.1 * (Math.random() * 2 - 1) // ±10% jitter
      const wait = Math.max(100, delay + jitter)

      this.#logSomeError(requestId, error?.code ? `${error.code}` : '?', error.message, method, wait)

      return wait
    }

    return 0 // We don't repeat
  }

  /**
   * Checks if the error is a rate limit
   */
  #isRateLimitError(error: any): boolean {
    return error.status === 503
      || error.code === 'QUERY_LIMIT_EXCEEDED'
  }

  /**
   * Delay when exceeding the rate limit
   */
  async #handleRateLimitExceeded(requestId: string): Promise<number> {
    return this.#rateLimiter.handleExceeded(requestId)
  }

  /**
   * Checks if the error is an operating limit
   *
   * @memo `OPERATION_TIME_LIMIT` && `429` - obtained through practical means
   * @memo This doesn't work for `batch` queries.
   */
  #isOperatingLimitError(error: any): boolean {
    return error.status === 429
      || error.code === 'OPERATION_TIME_LIMIT'
  }

  /**
   * Operating limit error delay
   *
   * @memo Currently, the errors don't include timings for operations.
   *       For this reason, we will take data from the previous request
   */
  async #handleOperatingLimitError(requestId: string, method: string, params?: any, _error?: any): Promise<number> {
    return this.#operatingLimiter.getTimeToFree(requestId, method, params, _error)
  }

  /**
   * Checks whether attempts should be stopped if errors are encountered that are unclear.
   */
  #isNeedThrowError(error: any): boolean {
    const answerError = {
      code: error?.code ?? '-1',
      description: error?.message ?? ''
    }

    return [
      ...this.exceptionCodeForHard,
      ...this.exceptionCodeForSoft
    ].includes(answerError.code)
    || (answerError.description ?? '').includes('Could not find value for parameter')
  }

  /**
   * These exceptions will be thrown
   */
  get exceptionCodeForHard(): string[] {
    return [
      'ERR_BAD_REQUEST',
      'JSSDK_UNKNOWN_ERROR', // 'REQUEST_TIMEOUT', 'NETWORK_ERROR',
      '100', 'NOT_FOUND',
      'INTERNAL_SERVER_ERROR', 'ERROR_UNEXPECTED_ANSWER', 'PORTAL_DELETED',
      'ERROR_BATCH_METHOD_NOT_ALLOWED', 'ERROR_BATCH_LENGTH_EXCEEDED',
      'NO_AUTH_FOUND', 'INVALID_REQUEST',
      'OVERLOAD_LIMIT', 'expired_token',
      'ACCESS_DENIED', 'INVALID_CREDENTIALS', 'user_access_error', 'insufficient_scope',
      'ERROR_MANIFEST_IS_NOT_AVAILABLE'
    ]
  }

  /**
   * These exceptions will be thrown into `AjaxResult` as `AjaxError`
   */
  get exceptionCodeForSoft(): string[] {
    return [
      'BITRIX_REST_V3_EXCEPTION_ACCESSDENIEDEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_INVALIDJSONEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_INVALIDFILTEREXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_INVALIDSELECTEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_ENTITYNOTFOUNDEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_METHODNOTFOUNDEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_UNKNOWNDTOPROPERTYEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_VALIDATION_DTOVALIDATIONEXCEPTION'
    ]
  }

  /**
   * Delay due to unknown errors
   */
  async #getErrorBackoff(_requestId: string): Promise<number> {
    return this.#config.retryDelay!
  }

  incrementError(method: string): void {
    const current = this.#errorCounts.get(method) || 0
    this.#errorCounts.set(method, current + 1)
    this.incrementStats('consecutiveErrors')
  }

  resetErrors(method: string): void {
    this.#errorCounts.delete(method)
    this.#stats.consecutiveErrors = 0
  }

  incrementStats(stat: keyof Pick<RestrictionManagerStats, 'retries' | 'consecutiveErrors' | 'limitHits'>): void {
    this.#stats[stat]++
  }

  /**
   * Returns job statistics
   */
  getStats(): RestrictionManagerStats & {
    adaptiveDelayAvg: number
    errorCounts: Record<string, number>
  } {
    return {
      ...this.#stats,
      ...this.#rateLimiter.getStats(),
      ...this.#adaptiveDelayer.getStats(),
      ...this.#operatingLimiter.getStats(),
      errorCounts: Object.fromEntries(this.#errorCounts)
    }
  }

  /**
   * Resets limiters and statistics
   */
  async reset(): Promise<void> {
    await this.#rateLimiter.reset()
    await this.#operatingLimiter.reset()
    await this.#adaptiveDelayer.reset()
    this.#errorCounts.clear()

    this.#stats = {
      retries: 0,
      consecutiveErrors: 0,
      limitHits: 0
    }
  }

  async setConfig(params: RestrictionParams): Promise<void> {
    this.#config = params
    await this.#rateLimiter.setConfig(params.rateLimit!)
    await this.#operatingLimiter.setConfig(params.operatingLimit!)
    await this.#adaptiveDelayer.setConfig(params.adaptiveConfig!)
  }

  getParams(): RestrictionParams {
    return { ...this.#config }
  }

  /**
   * Delay function
   */
  async #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Public access to the delay function
   */
  async waiteDelay(ms: number): Promise<void> {
    return this.#delay(ms)
  }

  // region Log ////
  #logMethodBlocked(limiter: string, requestId: string, method: string, wait: number) {
    this.getLogger().notice(`${limiter} blocked method ${method}`, {
      requestId,
      method,
      wait,
      limiter
    })
  }

  #logMethodBlockedWithTimes(limiter: string, requestId: string, method: string, wait: number, times: number) {
    this.getLogger().notice(`${limiter} blocked method ${method} | ${times} times`, {
      requestId,
      method,
      times,
      wait,
      limiter
    })
  }

  #logError(limiter: string, requestId: string, code: string, message: string, method: string, wait: number) {
    this.getLogger().error(`${limiter} recognized the ${code} error for the ${method} method`, {
      requestId,
      method,
      wait,
      limiter,
      error: {
        code,
        message
      }
    })
  }

  #logSomeError(requestId: string, code: string, message: string, method: string, wait: number) {
    this.getLogger().error(`recognized the ${code} error for the ${method} method`, {
      requestId,
      method,
      wait,
      error: {
        code,
        message
      }
    })
  }
  // endregion ////
}
