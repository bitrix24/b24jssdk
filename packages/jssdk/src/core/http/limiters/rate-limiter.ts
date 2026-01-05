import { LoggerBrowser, LoggerType } from '../../../logger/browser'
import type { ILimiter, RateLimitConfig } from '../../../types/limiters'

/**
 * Rate limiting (Leaky Bucket)
 * с адаптивным регулированием
 */
export class RateLimiter implements ILimiter {
  #tokens: number
  #lastRefill: number
  #refillIntervalMs: number
  #config: RateLimitConfig
  #lockQueue: Array<() => void> = []

  #originalConfig: RateLimitConfig // Оригинальная конфигурация для восстановления
  #errorThreshold: number = 5 // Порог ошибок за 60 секунд для уменьшения лимитов
  #successThreshold: number = 20 // Порог успехов подряд для восстановления лимитов
  #minDrainRate: number = 0.5 // Минимальный drainRate
  #minBurstLimit: number = 5 // Минимальный burstLimit
  #errorTimestamps: number[] = [] // Временные метки ошибок (последние 60 секунд)
  #successTimestamps: number[] = [] // Временные метки успешных запросов (последние 60 секунд)

  private _logger: null | LoggerBrowser = null

  constructor(config: RateLimitConfig) {
    this.#config = config
    this.#originalConfig = { ...config }
    this.#tokens = config.burstLimit
    this.#lastRefill = Date.now()
    this.#refillIntervalMs = 1000 / config.drainRate
  }

  getTitle(): string {
    return 'rateLimiter'
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

  /**
   * @inheritDoc
   */
  async canProceed(requestId: string, _method: string, _params?: any): Promise<boolean> {
    await this.#acquireLock(requestId)
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

  /**
   * @inheritDoc
   */
  async waitIfNeeded(requestId: string, _method: string, _params?: any): Promise<number> {
    await this.#acquireLock(requestId)

    try {
      const now = Date.now()
      const timePassed = now - this.#lastRefill

      // Пополняем токены
      const refillAmount = timePassed * this.#config.drainRate / 1_000
      this.#tokens = Math.min(
        this.#config.burstLimit,
        this.#tokens + refillAmount
      )

      // Всегда обновляем время последнего пополнения
      this.#lastRefill = now

      // Если достаточно токенов
      if (this.#tokens >= 1) {
        // Consume token
        this.#tokens -= 1
        return 0
      }

      // Вычисляем время ожидания для 1 токена
      const deficit = 1 - this.#tokens
      return Math.ceil(deficit * this.#refillIntervalMs)
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * Обработчик ошибки.
   * Если много ошибок, то будем понижать лимиты
   */
  async handleExceeded(requestId: string): Promise<number> {
    await this.#acquireLock(requestId)

    try {
      // Записываем ошибку
      this.#recordError()

      // Адаптивное регулирование: если много ошибок - уменьшаем лимиты
      if (this.#config.adaptiveEnabled && this.#shouldReduceLimits()) {
        this.#reduceLimits(requestId)
      }

      this.#tokens = 0
      // Ждем время для восстановления хотя бы одного токена + 1sec
      return this.#refillIntervalMs + 1_000
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * Обработчик успешного запроса.
   * Если все нормально, то будем восстанавливать лимиты
   */
  async updateStats(requestId: string, method: string, _data: any): Promise<void> {
    // пропускаем учет подзапросов `batch`
    if (method.startsWith('batch::')) {
      return
    }

    await this.#acquireLock(requestId)

    try {
      // Записываем успешный запрос
      this.#recordSuccess()

      // Адаптивное регулирование: если стабильно работаем - восстанавливаем лимиты

      if (this.#config.adaptiveEnabled) {
        this.#logStat(requestId)
      }

      if (this.#config.adaptiveEnabled && this.#shouldRestoreLimits()) {
        this.#restoreLimits(requestId)
      }
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * @inheritDoc
   */
  async reset(): Promise<void> {
    await this.#acquireLock('reset')

    try {
      this.#tokens = this.#config.burstLimit
      this.#lastRefill = Date.now()
      this.#errorTimestamps = []
      this.#successTimestamps = []

      // Восстанавливаем оригинальные настройки при reset
      this.#config.drainRate = this.#originalConfig.drainRate
      this.#config.burstLimit = this.#originalConfig.burstLimit
      this.#refillIntervalMs = 1000 / this.#config.drainRate
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * @inheritDoc
   */
  getStats() {
    return {
      tokens: this.#tokens,
      burstLimit: this.#config.burstLimit,
      originalBurstLimit: this.#originalConfig.burstLimit,
      drainRate: this.#config.drainRate,
      originalDrainRate: this.#originalConfig.drainRate,
      refillIntervalMs: this.#refillIntervalMs,
      lastRefill: this.#lastRefill,
      pendingRequests: this.#lockQueue.length,
      recentErrors: this.#errorTimestamps.length,
      recentSuccesses: this.#successTimestamps.length
    }
  }

  /**
   * @inheritDoc
   */
  async setConfig(config: RateLimitConfig): Promise<void> {
    await this.#acquireLock('setConfig')

    try {
      this.#config = config
      this.#originalConfig = { ...config }
      this.#refillIntervalMs = 1000 / this.#config.drainRate

      // Если новая конфигурация увеличивает burstLimit, мы можем увеличить текущее количество токенов
      if (config.burstLimit > this.#tokens) {
        this.#tokens = Math.min(config.burstLimit, this.#tokens)
      }

      // Сбрасываем статистику при изменении конфигурации
      this.#errorTimestamps = []
      this.#successTimestamps = []
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * Приобретаем блокировку для критической секции
   * Использует очередь промисов
   */
  async #acquireLock(requestId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      // Добавляем в очередь разрешающую функцию
      const queueLength = this.#lockQueue.push(resolve)

      if (queueLength > 1) {
        this.#logAcquireQueue(requestId, queueLength)
      }
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

  /**
   * Проверяет, нужно ли уменьшать лимиты
   */
  #shouldReduceLimits(): boolean {
    // Если за последние 60 секунд больше ошибок, чем порог
    return this.#errorTimestamps.length >= this.#errorThreshold
  }

  /**
   * Проверяет, нужно ли восстанавливать лимиты
   * Восстанавливаем если:
   * 1. Много успешных запросов (больше порога)
   * 2. Мало ошибок (меньше половины порога)
   * 3. Текущие лимиты ниже оригинальных
   */
  #shouldRestoreLimits(): boolean {
    return this.#successTimestamps.length >= this.#successThreshold
      && this.#errorTimestamps.length < (this.#errorThreshold / 2)
      && (
        this.#config.drainRate < this.#originalConfig.drainRate
        || this.#config.burstLimit < this.#originalConfig.burstLimit
      )
  }

  /**
   * Уменьшает лимиты при частых ошибках
   */
  #reduceLimits(requestId: string): void {
    // Уменьшаем drainRate на 20%, но не ниже минимума
    const newDrainRate = Math.max(
      this.#minDrainRate,
      Number.parseFloat((this.#config.drainRate * 0.8).toFixed(2))
    )

    // Уменьшаем burstLimit на 20%, но не ниже минимума
    const newBurstLimit = Math.max(
      this.#minBurstLimit,
      Number.parseFloat((this.#config.burstLimit * 0.8).toFixed(2))
    )

    // Применяем новые лимиты
    this.#config.drainRate = newDrainRate
    this.#config.burstLimit = newBurstLimit
    this.#refillIntervalMs = 1000 / newDrainRate

    this.#logReduceLimits(requestId, newDrainRate, newBurstLimit)

    // Сбрасываем статистику ошибок после уменьшения
    this.#errorTimestamps = []
    this.#successTimestamps = []
  }

  /**
   * Восстанавливает лимиты при стабильной работе
   */
  #restoreLimits(requestId: string): void {
    if (
      this.#config.drainRate === this.#originalConfig.drainRate
      && this.#config.burstLimit === this.#originalConfig.burstLimit
    ) {
      return
    }

    // Восстанавливаем drainRate на 10% к оригинальному значению
    const newDrainRate = Math.min(
      this.#originalConfig.drainRate,
      Number.parseFloat((this.#config.drainRate * 1.1).toFixed(2))
    )

    // Восстанавливаем burstLimit на 10% к оригинальному значению
    const newBurstLimit = Math.min(
      this.#originalConfig.burstLimit,
      Number.parseFloat((this.#config.burstLimit * 1.1).toFixed(2))
    )

    // Применяем новые лимиты
    this.#config.drainRate = newDrainRate
    this.#config.burstLimit = newBurstLimit
    this.#refillIntervalMs = 1000 / newDrainRate

    this.#logRestoreLimits(requestId, newDrainRate, newBurstLimit)

    // Сбрасываем статистику успехов после восстановления
    this.#errorTimestamps = []
    this.#successTimestamps = []
  }

  /**
   * Записывает ошибку во временную историю
   */
  #recordError(): void {
    const now = Date.now()
    this.#errorTimestamps.push(now)

    // Очищаем ВСЕ успехи
    this.#successTimestamps = []
    // Очищаем старые ошибки
    this.#cleanupOldErrors(now)
  }

  /**
   * Очищает старые ошибки (старше 60 секунд)
   */
  #cleanupOldErrors(now: number): void {
    const cutoff = now - 60_000 // 60 секунд
    this.#errorTimestamps = this.#errorTimestamps.filter(timestamp => timestamp > cutoff)
  }

  /**
   * Записывает успешный запрос во временную историю
   */
  #recordSuccess(): void {
    const now = Date.now()
    this.#successTimestamps.push(now)

    // Очищаем старые успехи
    this.#cleanupOldSuccesses()
    // Очищаем старые ошибки
    this.#cleanupOldErrors(now)
  }

  /**
   * Очищает старые успехи
   */
  #cleanupOldSuccesses(): void {
    this.#successTimestamps = this.#successTimestamps.slice(-1 * this.#successThreshold)
  }

  // region Log ////
  #logReduceLimits(requestId: string, currentDrainRate: number, currentBurstLimit: number) {
    const originalDrainRate = this.#originalConfig.drainRate
    const drainRateCondition = currentDrainRate < originalDrainRate

    const originalBurstLimit = this.#originalConfig.burstLimit
    const burstLimitCondition = currentBurstLimit < originalBurstLimit

    this.getLogger().warn(
      `${this.getTitle()} is lowering limits due to frequent errors`, {
        requestId,
        drainRate: {
          current: currentDrainRate,
          original: originalDrainRate,
          condition: drainRateCondition,
          formatted: `(${currentDrainRate} < ${originalDrainRate}) ${drainRateCondition}`
        },
        burstLimit: {
          current: currentBurstLimit,
          original: originalBurstLimit,
          condition: burstLimitCondition,
          formatted: `(${currentBurstLimit} < ${originalBurstLimit}) ${burstLimitCondition}`
        }
      }
    )
  }

  #logRestoreLimits(requestId: string, currentDrainRate: number, currentBurstLimit: number) {
    const originalDrainRate = this.#originalConfig.drainRate
    const drainRateCondition = currentDrainRate < originalDrainRate

    const originalBurstLimit = this.#originalConfig.burstLimit
    const burstLimitCondition = currentBurstLimit < originalBurstLimit

    this.getLogger().warn(
      `${this.getTitle()} increases limits during stable operation`, {
        requestId,
        drainRate: {
          current: currentDrainRate,
          original: originalDrainRate,
          condition: drainRateCondition,
          formatted: `(${currentDrainRate} < ${originalDrainRate}) ${drainRateCondition}`
        },
        burstLimit: {
          current: currentBurstLimit,
          original: originalBurstLimit,
          condition: burstLimitCondition,
          formatted: `(${currentBurstLimit} < ${originalBurstLimit}) ${burstLimitCondition}`
        }
      }
    )
  }

  #logAcquireQueue(requestId: string, queueLength: number) {
    this.getLogger().log(`${this.getTitle()} request in queue`, {
      requestId,
      queueLength
    })
  }

  #logStat(
    requestId: string
  ): void {
    const successCount = this.#successTimestamps.length
    const successThreshold = this.#successThreshold
    const successCondition = successCount >= successThreshold

    const errorCount = this.#errorTimestamps.length
    const errorThreshold = this.#errorThreshold
    const failCondition = errorCount < (errorThreshold / 2)

    const currentDrainRate = this.#config.drainRate
    const originalDrainRate = this.#originalConfig.drainRate
    const drainRateCondition = currentDrainRate < originalDrainRate

    const currentBurstLimit = this.#config.burstLimit
    const originalBurstLimit = this.#originalConfig.burstLimit
    const burstLimitCondition = currentBurstLimit < originalBurstLimit

    this.getLogger().log(`${this.getTitle()} state`, {
      requestId,
      success: {
        count: successCount,
        threshold: successThreshold,
        condition: successCondition,
        formatted: `(${successCount} >= ${successThreshold}) ${successCondition}`
      },
      fail: {
        count: errorCount,
        threshold: errorThreshold / 2,
        condition: failCondition,
        formatted: `(${errorCount} < ${errorThreshold / 2}) ${failCondition}`
      },
      drainRate: {
        current: currentDrainRate,
        original: originalDrainRate,
        condition: drainRateCondition,
        formatted: `(${currentDrainRate} < ${originalDrainRate}) ${drainRateCondition}`
      },
      burstLimit: {
        current: currentBurstLimit,
        original: originalBurstLimit,
        condition: burstLimitCondition,
        formatted: `(${currentBurstLimit} < ${originalBurstLimit}) ${burstLimitCondition}`
      }
    })
  }
  // endregion ////
}
