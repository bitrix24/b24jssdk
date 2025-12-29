import type { RateLimitConfig, ILimiter } from '../../../types/limiters'
import { LoggerBrowser, LoggerType } from '../../../logger/browser'

/**
 * Rate limiting (Leaky Bucket)
 */
export class RateLimiter implements ILimiter {
  #tokens: number
  #lastRefill: number
  #refillIntervalMs: number

  #config: RateLimitConfig
  #lockQueue: Array<() => void> = []

  private _logger: null | LoggerBrowser = null

  constructor(config: RateLimitConfig) {
    this.#config = config
    this.#tokens = config.burstLimit
    this.#lastRefill = Date.now()
    this.#refillIntervalMs = 1000 / config.drainRate
  }

  // region Logger ////
  setLogger(logger: LoggerBrowser): void {
    this._logger = logger
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

  async canProceed(): Promise<boolean> {
    await this.#acquireLock()
    try {
      const now = Date.now()
      const timePassed = now - this.#lastRefill

      // Refill tokens
      const refillAmount = timePassed * this.#config.drainRate / 1000
      this.#tokens = Math.min(
        this.#config.burstLimit,
        this.#tokens + refillAmount
      )
      this.#lastRefill = now

      return this.#tokens >= 1
    } finally {
      this.#releaseLock()
    }
  }

  async waitIfNeeded(): Promise<number> {
    await this.#acquireLock()

    try {
      const now = Date.now()
      const timePassed = now - this.#lastRefill

      // Refill tokens
      const refillAmount = timePassed * this.#config.drainRate / 1000
      this.#tokens = Math.min(
        this.#config.burstLimit,
        this.#tokens + refillAmount
      )
      this.#lastRefill = now

      // Calculate wait time if needed
      if (this.#tokens < 1) {
        const deficit = 1 - this.#tokens
        const waitTime = Math.ceil(deficit * this.#refillIntervalMs)
        this.#tokens = 0
        return waitTime
      }

      // Consume token
      this.#tokens -= 1
      return 0
    } finally {
      this.#releaseLock()
    }
  }

  handleExceeded(): number {
    // Используем lock для атомарной операции
    const releaseLock = () => {
      // Если есть ожидающие в очереди, разрешаем следующего
      if (this.#lockQueue.length > 0) {
        const nextResolve = this.#lockQueue.shift()!
        nextResolve()
      }
    }

    try {
      this.#tokens = 0
      // Ждем время для восстановления хотя бы одного токена + 1sec
      return this.#refillIntervalMs + 1_000
    } finally {
      releaseLock()
    }
  }

  updateStats(): void {
    // Rate limiter doesn't update from response data
  }

  reset(): void {
    // Используем lock для атомарной операции
    const releaseLock = () => {
      if (this.#lockQueue.length > 0) {
        const nextResolve = this.#lockQueue.shift()!
        nextResolve()
      }
    }

    try {
      this.#tokens = this.#config.burstLimit
      this.#lastRefill = Date.now()
    } finally {
      releaseLock()
    }
  }

  getStats() {
    return {
      tokens: this.#tokens,
      burstLimit: this.#config.burstLimit,
      drainRate: this.#config.drainRate,
      refillIntervalMs: this.#refillIntervalMs,
      lastRefill: this.#lastRefill,
      pendingRequests: this.#lockQueue.length
    }
  }

  setConfig(config: RateLimitConfig): void {
    // Используем lock для атомарной операции
    const releaseLock = () => {
      if (this.#lockQueue.length > 0) {
        const nextResolve = this.#lockQueue.shift()!
        nextResolve()
      }
    }

    try {
      this.#config = config
      this.#refillIntervalMs = 1000 / config.drainRate

      // Если новая конфигурация увеличивает burstLimit, мы можем увеличить текущее количество токенов
      if (config.burstLimit > this.#tokens) {
        this.#tokens = Math.min(config.burstLimit, this.#tokens)
      }
    } finally {
      releaseLock()
    }
  }

  /**
   * Приобретаем блокировку для критической секции
   * Использует очередь промисов
   */
  async #acquireLock(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Добавляем в очередь разрешающую функцию
      this.#lockQueue.push(resolve)

      // Если это первый в очереди, сразу разрешаем
      if (this.#lockQueue.length === 1) {
        resolve()
      }
    })
  }

  /**
   * Освобождает блокировку и разрешает следующему в очереди
   */
  #releaseLock(): void {
    // Удаляем текущий разрешитель из начала очереди
    this.#lockQueue.shift()

    // Если есть ожидающие, разрешаем следующего
    if (this.#lockQueue.length > 0) {
      const nextResolve = this.#lockQueue[0]
      nextResolve()
    }
  }
}
