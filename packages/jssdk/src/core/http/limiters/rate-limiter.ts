import type { RateLimitConfig, ILimiter } from '../../../types/limiters'
import { LoggerBrowser, LoggerType } from '../../../logger/browser'

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

  /**
   * @inheritDoc
   */
  async waitIfNeeded(): Promise<number> {
    await this.#acquireLock()

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
      const waitTime = Math.ceil(deficit * this.#refillIntervalMs)

      // НЕ двигаем lastRefill!
      // Токены могут стать отрицательными - это нормально
      // Они пополнятся при следующем вызове

      // Advance time for next refill
      // ** this.#tokens = 0
      // ** this.#lastRefill = now + waitTime

      return waitTime
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * Обработчик ошибки.
   * Если много ошибок, то будем понижать лимиты
   */
  async handleExceeded(): Promise<number> {
    await this.#acquireLock()

    try {
      // Записываем ошибку
      this.#recordError()

      // Адаптивное регулирование: если много ошибок - уменьшаем лимиты
      if (this.#config.adaptiveEnabled && this.#shouldReduceLimits()) {
        this.#reduceLimits()
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
  async updateStats(method: string): Promise<void> {
    // пропускаем учет подзапросов `batch`
    if (method.startsWith('batch::')) {
      return
    }

    await this.#acquireLock()

    try {
      // Записываем успешный запрос
      this.#recordSuccess()

      // Адаптивное регулирование: если стабильно работаем - восстанавливаем лимиты

      if (this.#config.adaptiveEnabled) {
        this.getLogger().log(
          `📈 [RateLimiter] текущие показатели:`,
          `\n- успешных много: (${this.#successTimestamps.length} >= ${this.#successThreshold}) ${this.#successTimestamps.length >= this.#successThreshold}`,
          `\n- ошибок мало: (${this.#errorTimestamps.length} < ${(this.#errorThreshold / 2)}) ${this.#errorTimestamps.length < (this.#errorThreshold / 2)}`,
          `\n- drainRate: (${this.#config.drainRate} < ${this.#originalConfig.drainRate}) ${this.#config.drainRate < this.#originalConfig.drainRate}`,
          `\n- burstLimit: (${this.#config.burstLimit} < ${this.#originalConfig.burstLimit}) ${this.#config.burstLimit < this.#originalConfig.burstLimit}`,
        )
      }

      if (this.#config.adaptiveEnabled && this.#shouldRestoreLimits()) {
        this.#restoreLimits()
      }
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * @inheritDoc
   */
  async reset(): Promise<void> {
    await this.#acquireLock()

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
    await this.#acquireLock()

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
  async #acquireLock(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Добавляем в очередь разрешающую функцию
      const queueLength = this.#lockQueue.push(resolve)

      if (queueLength > 1) {
        this.getLogger().log(`⏱️ [RateLimiter] Запрос в очереди: ${queueLength} ожидающих`)
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
  #reduceLimits(): void {
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

    this.getLogger().warn(
      `⚠️ [RateLimiter] Уменьшаем лимиты из-за частых ошибок:`,
      `drainRate=${newDrainRate.toFixed(2)}, burstLimit=${newBurstLimit}`
    )

    // Сбрасываем статистику ошибок после уменьшения
    this.#errorTimestamps = []
    this.#successTimestamps = []
  }

  /**
   * Восстанавливает лимиты при стабильной работе
   */
  #restoreLimits(): void {
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

    this.getLogger().warn(
      `✅ [RateLimiter] Увеличиваем лимиты при стабильной работе:`,
      `drainRate=${newDrainRate.toFixed(2)}, burstLimit=${newBurstLimit}`
    )

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
}
