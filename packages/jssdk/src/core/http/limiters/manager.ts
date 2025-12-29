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
  #stats: Pick<RestrictionManagerStats, 'totalRequests' | 'retries' | 'consecutiveErrors' | 'limitHits'> = {
    /** Общее количество запросов */
    totalRequests: 0,
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

  async applyOperatingLimits(method: string, params?: any): Promise<void> {
    // 1. Check operating limit
    const operatingWait = await this.#operatingLimiter.waitIfNeeded(method, params)
    if (operatingWait > 0) {
      this.incrementStats('limitHits')
      this.getLogger().warn(
        `⏳ Метод ${method}: заблокирован по operating limit.`,
        `Ждем ${(operatingWait / 1000).toFixed(2)} sec.`
      )
      await this.#delay(operatingWait)
    } else {
      // 2. Apply adaptive delay
      const adaptiveDelay = await this.#adaptiveDelayer.waitIfNeeded(method, params)
      if (adaptiveDelay > 0) {
        this.incrementStats('limitHits')
        this.getLogger().warn(
          `⏳ Метод ${method}: заблокирован по ${method === 'batch' ? 'максимальному ' : ''}adaptive delay.`,
          `Ждем ${(adaptiveDelay / 1000).toFixed(2)} sec.`
        )
        await this.#delay(adaptiveDelay)
      }
    }
  }

  /**
   * Проверяет и ждет rate limit
   */
  async checkRateLimit(method: string): Promise<void> {
    // 3. Apply rate limit
    const waitTime = await this.#rateLimiter.waitIfNeeded()
    if (waitTime > 0) {
      this.incrementStats('limitHits')
      this.getLogger().warn(
        `⏳ Метод ${method}: заблокирован по rate limit`,
        `Ждем ${(waitTime / 1000).toFixed(2)} sec.`
      )
      await this.#delay(waitTime)
    }
  }

  updateOperatingStats(method: string, timeData: any): void {
    this.#operatingLimiter.updateStats(method, timeData)
  }

  handleError(
    method: string,
    params: any,
    error: any,
    attempt: number
  ): number {
    // Rate limit exceeded
    if (this.#isRateLimitError(error)) {
      this.getLogger().warn(`🚫[QUERY_LIMIT_EXCEEDED] Ошибка: rate limit превышен.`)
      return this.#handleRateLimitExceeded() * Math.pow(4, attempt)
    }

    if (this.#isOperatingLimitError(error)) {
      this.getLogger().warn(`🚫[OPERATION_TIME_LIMIT] Ошибка: operating limit превышен.`)
      return this.#handleOperatingLimitError(method, params, error)
    }

    if (!this.#isNeedThrowError(error)) {
      this.getLogger().warn(`🚫${error?.code ? `[${error.code}] ` : ''}Ошибка: ${error.message}.`)
      return this.#getErrorBackoff() * Math.pow(2, attempt)
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
  #handleRateLimitExceeded(): number {
    return this.#rateLimiter.handleExceeded()
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
  #handleOperatingLimitError(method: string, params?: any, _error?: any): number {
    const waitTime = this.#operatingLimiter.getTimeToFree(method, params, _error)

    // Так как это обработкаошибки то увеличим минимум до 10 секунд
    return Math.max(10_000, waitTime)
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
  #getErrorBackoff(): number {
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

  incrementStats(stat: keyof Pick<RestrictionManagerStats, 'totalRequests' | 'retries' | 'consecutiveErrors' | 'limitHits'>): void {
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
  reset(): void {
    // this.#lastOperatingTimes.clear()
    // this.#tokens = this.#restrictionParams.rateLimit!.burstLimit!
    // this.#lastRefill = Date.now()

    this.#rateLimiter.reset()
    this.#operatingLimiter.reset()
    this.#adaptiveDelayer.reset()
    this.#errorCounts.clear()

    this.#stats = {
      totalRequests: 0,
      retries: 0,
      consecutiveErrors: 0,
      limitHits: 0
    }
  }

  setParams(params: RestrictionParams): void {
    // @todo
    // // Мерджим переданные параметры с текущими
    // this.#restrictionParams = {
    //   ...this.#restrictionParams,
    //   ...params,
    //   rateLimit: {
    //     ...this.#restrictionParams.rateLimit,
    //     ...params.rateLimit
    //   } as RateLimitConfig,
    //   operatingLimit: {
    //     ...this.#restrictionParams.operatingLimit,
    //     ...params.operatingLimit
    //   } as OperatingLimitConfig,
    //   adaptiveConfig: {
    //     ...this.#restrictionParams.adaptiveConfig,
    //     ...params.adaptiveConfig
    //   } as AdaptiveConfig
    // }
    //
    // this.getLogger().log(`new restriction manager params`, this.#restrictionParams)
    //
    // // Обновляем внутреннее состояние rate limiter
    // this.#tokens = this.#restrictionParams.rateLimit!.burstLimit!
    // this.#refillIntervalMs = 1000 / this.#restrictionParams.rateLimit!.drainRate!
    // this.#lastRefill = Date.now()

    this.#config = params
    this.#rateLimiter.setConfig(params.rateLimit!)
    this.#operatingLimiter.setConfig(params.operatingLimit!)
    this.#adaptiveDelayer.setConfig(params.adaptiveConfig!)
  }

  getParams(): RestrictionParams {
    return { ...this.#config }
  }

  /**
   * Публичный доступ к функции задержки
   */
  async waiteDelay(ms: number): Promise<void> {
    return this.#delay(ms)
  }

  /**
   * Функция задержки
   */
  async #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
