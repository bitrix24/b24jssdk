import type { RestrictionParams, RestrictionManagerStats } from '../../../types/limiters'
import { RateLimiter } from './rate-limiter'
import { OperatingLimiter } from './operating-limiter'
import { AdaptiveDelayer } from './adaptive-delayer'
import { LoggerBrowser, LoggerType } from '../../../logger/browser'

/**
 * Менеджер управления задержками
 * @todo перевод
 * @todo docs?
 */
export class RestrictionManager {
  #rateLimiter: RateLimiter
  #operatingLimiter: OperatingLimiter
  #adaptiveDelayer: AdaptiveDelayer
  #config: RestrictionParams
  #stats: Pick<RestrictionManagerStats, 'retries' | 'consecutiveErrors' | 'limitHits'> = {
    /** Повторные попытки */
    retries: 0,
    /** Последовательные ошибки */
    consecutiveErrors: 0,
    /** Срабатывания limit */
    limitHits: 0
  }

  #errorCounts = new Map<string, number>()

  private _logger: null | LoggerBrowser = null

  constructor(params: RestrictionParams) {
    this.#config = params
    this.#rateLimiter = new RateLimiter(params.rateLimit!)
    this.#operatingLimiter = new OperatingLimiter(params.operatingLimit!)
    this.#adaptiveDelayer = new AdaptiveDelayer(params.adaptiveConfig!, this.#operatingLimiter)
  }

  // region Logger ////
  setLogger(logger: LoggerBrowser): void {
    this._logger = logger
    this.#rateLimiter.setLogger(this._logger)
    this.#operatingLimiter.setLogger(this._logger)
    this.#adaptiveDelayer.setLogger(this._logger)
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
   * Проверяет и ждет rate limit
   * Цикл нужен для паралельных запросов (Promise.all())
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
      // Так как это обработка ошибки то учитываем количество попыток
      const wait = (await this.#handleRateLimitExceeded(requestId)) * Math.pow(1.5, attempt)
      this.#logError(this.#rateLimiter.getTitle(), requestId, 'QUERY_LIMIT_EXCEEDED', error.message, method, wait)
      return wait
    }

    // Operating limit exceeded
    if (this.#isOperatingLimitError(error)) {
      // Так как это обработка ошибки то увеличим минимум до 10 секунд
      const wait = Math.max(10_000, await this.#handleOperatingLimitError(requestId, method, params, error))
      this.#logError(this.#operatingLimiter.getTitle(), requestId, 'OPERATION_TIME_LIMIT', error.message, method, wait)
      return wait
    }

    // Иные исключения
    if (!this.#isNeedThrowError(error)) {
      // Так как это обработка ошибки то учитываем количество попыток
      const baseDelay = await this.#getErrorBackoff(requestId)
      const maxDelay = Math.max(30_000, baseDelay)
      const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))

      // Добавить jitter для предотвращения thundering herd
      const jitter = delay * 0.1 * (Math.random() * 2 - 1) // ±10% jitter
      const wait = Math.max(100, delay + jitter)

      this.#logSomeError(requestId, error?.code ? `${error.code}` : '?', error.message, method, wait)

      return wait
    }

    return 0 // Не повторяем
  }

  /**
   * Проверяет является ли ошибка rate limit
   */
  #isRateLimitError(error: any): boolean {
    return error.status === 503
      || error.code === 'QUERY_LIMIT_EXCEEDED'
  }

  /**
   * Задержака при превышение rate limit
   */
  async #handleRateLimitExceeded(requestId: string): Promise<number> {
    return this.#rateLimiter.handleExceeded(requestId)
  }

  /**
   * Проверяет является ли ошибка operating limit
   * @memo `OPERATION_TIME_LIMIT` && `429` - получены практическим путем
   * @memo для `batch` запросов это не работает
   */
  #isOperatingLimitError(error: any): boolean {
    return error.status === 429
      || error.code === 'OPERATION_TIME_LIMIT'
  }

  /**
   * Задержака при ошибке operating limit
   * @memo Сейчас в ошибках не приходят тайминги по операциям - по этой причине будем брать данные из прошлого запроса
   */
  async #handleOperatingLimitError(requestId: string, method: string, params?: any, _error?: any): Promise<number> {
    return this.#operatingLimiter.getTimeToFree(requestId, method, params, _error)
  }

  /**
   * Проверяет нужно ли прекратить попытки при не понятных ошибках
   */
  #isNeedThrowError(error: any): boolean {
    return [
      '100', 'NOT_FOUND',
      'INTERNAL_SERVER_ERROR', 'ERROR_UNEXPECTED_ANSWER', 'PORTAL_DELETED',
      'ERROR_BATCH_METHOD_NOT_ALLOWED', 'ERROR_BATCH_LENGTH_EXCEEDED',
      'NO_AUTH_FOUND', 'INVALID_REQUEST',
      'OVERLOAD_LIMIT', 'expired_token',
      'ACCESS_DENIED', 'INVALID_CREDENTIALS', 'user_access_error', 'insufficient_scope',
      'ERROR_MANIFEST_IS_NOT_AVAILABLE'
    ].includes(error?.code ?? '-1')
    || (error?.message ?? '').includes('Could not find value for parameter')
  }

  /**
   * Задержака при не понятных ошибках
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
   * Возвращает статистику работы
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
   * Сбрасывает лимитеры и статистику
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
   * Функция задержки
   */
  async #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Публичный доступ к функции задержки
   */
  async waiteDelay(ms: number): Promise<void> {
    return this.#delay(ms)
  }

  // region Log ////
  #logMethodBlocked(limiter: string, requestId: string, method: string, wait: number) {
    this.getLogger().warn(`${limiter} blocked method ${method}`, {
      requestId,
      method,
      wait,
      limiter
    })
  }

  #logMethodBlockedWithTimes(limiter: string, requestId: string, method: string, wait: number, times: number) {
    this.getLogger().warn(`${limiter} blocked method ${method} | ${times} times`, {
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
    this.getLogger().error(`Recognized the ${code} error for the ${method} method`, {
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
