import type { OperatingLimitConfig, ILimiter } from '../../../types/limiters'
import type { PayloadTime } from '../../../types/payloads'
import { LoggerBrowser, LoggerType } from '../../../logger/browser'

interface OperatingStats {
  /*
   * operating время за 10 минут (в мс)
   */
  operating: number
  /**
   * Время сброса (timestamp в мс)
   */
  operating_reset_at: number
  lastUpdated: number
}

/**
 * Operating limiting
 * @todo перевод
 * @todo docs
 */
export class OperatingLimiter implements ILimiter {
  #config: OperatingLimitConfig
  #methodStats = new Map<string, OperatingStats>()
  #stats = {
    /** Тяжелые запросы */
    heavyRequestCount: 0
  }

  private _logger: null | LoggerBrowser = null

  getTitle(): string {
    return 'operatingLimiter'
  }

  constructor(config: OperatingLimitConfig) {
    this.#config = config
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

  get limitMs(): number {
    return this.#config.limitMs
  }

  getMethodStat(method: string): undefined | OperatingStats {
    const stats = this.#methodStats.get(method)
    if (!stats) {
      return undefined
    }

    return stats
  }

  async canProceed(requestId: string, method: string, params?: any): Promise<boolean> {
    const timeToFree = await this.getTimeToFree(requestId, method, params)
    return timeToFree === 0
  }

  async waitIfNeeded(requestId: string, method: string, params?: any): Promise<number> {
    return this.getTimeToFree(requestId, method, params)
  }

  /**
   * Возвращает время до освобождения метода от operating лимита (в мс)
   * Анализ происходит по прошлому вызову функции. Нужно понимать что речь идет об блокировках до 10 минут
   * Это довольно жесткая блокировка по лимиту:
   * - не достигнут - нет блокировки
   * - достигли - блокируем до времени разблокировки + 1 секунда
   */
  async getTimeToFree(
    requestId: string,
    method: string,
    params?: any,
    _error?: any
  ): Promise<number> {
    this.#cleanupOldStats()

    if (method === 'batch') {
      return this.#getTimeToFreeBatch(requestId, params)
    }

    const stats = this.#methodStats.get(method)
    if (!stats) {
      return 0
    }

    // Use limit with buffer. При рассчетах operating лимита будем на 5 секунд меньше брать
    const limitWithBuffer = Math.max(1_000, this.#config.limitMs - 5_000)
    if (stats.operating >= limitWithBuffer) {
      const now = Date.now()
      if (stats.operating_reset_at > now) {
        // Возвращаем время до reset_at + 1 секунда
        return (stats.operating_reset_at - now) + 1_000
      }
      return 5_000 // 5 секунд по умолчанию
    }

    return 0
  }

  /**
   * Для `batch` из команд возвращает максимальное время до освобождения метода от operating лимита (в мс)
   */
  async #getTimeToFreeBatch(requestId: string, params: any): Promise<number> {
    let maxWait = 0

    if (!params?.cmd || !Array.isArray(params.cmd)) {
      return maxWait
    }

    const batchMethods = params.cmd
      .map((row: string) => row.split('?')[0])
      .filter(Boolean)

    for (const methodName of batchMethods) {
      const waitTime = await this.getTimeToFree(requestId, `batch::${methodName}`, {})
      maxWait = Math.max(maxWait, waitTime)
    }

    return maxWait
  }

  /**
   * Обновляет статистику operating времени для метода
   */
  async updateStats(requestId: string, method: string, data: PayloadTime): Promise<void> {
    this.#cleanupOldStats()

    // все в секундах
    const { operating, operating_reset_at } = data
    if (operating === undefined || operating === null) {
      return
    }

    if (!this.#methodStats.has(method)) {
      this.#methodStats.set(method, {
        operating: 0,
        operating_reset_at: 0,
        lastUpdated: Date.now()
      })
    }

    const stats = this.#methodStats.get(method)!

    stats.operating = operating * 1000
    stats.operating_reset_at = operating_reset_at * 1000
    stats.lastUpdated = Date.now()

    // Check for heavy requests
    const usagePercent = (stats.operating / this.#config.limitMs) * 100
    if (usagePercent > this.#config.heavyPercent) {
      this.#stats.heavyRequestCount++

      // Логируем если близко к лимиту
      this.#logStat(requestId, method, usagePercent, stats.operating)
    }
  }

  /**
   * Очистка устаревших данных по operating лимита
   */
  #cleanupOldStats(): void {
    const now = Date.now()
    const maxAge = this.#config.windowMs + 10_000 // 10 seconds extra

    for (const [method, stats] of this.#methodStats.entries()) {
      if (now - stats.lastUpdated > maxAge) {
        this.#methodStats.delete(method)
      }
    }
  }

  async reset(): Promise<void> {
    this.#methodStats.clear()
    this.#stats = {
      heavyRequestCount: 0
    }
  }

  getStats(): {
    heavyRequestCount: number
    operatingStats: { [method: string]: number }
  } {
    const operatingStats: Record<string, number> = {}

    for (const [method, stats] of this.#methodStats.entries()) {
      operatingStats[method] = Number.parseFloat((stats.operating / 1000).toFixed(2))
    }

    return {
      ...this.#stats,
      operatingStats
    }
  }

  async setConfig(config: OperatingLimitConfig): Promise<void> {
    this.#config = config
  }

  // region Log ////
  #logStat(requestId: string, method: string, percent: number, operating: number) {
    this.getLogger().info(`${this.getTitle()} detected limit for method ${method}`, {
      requestId,
      method,
      operating: {
        percent: Number.parseFloat(percent.toFixed(2)),
        current: Number.parseFloat(operating.toFixed(0)),
        max: this.#config.limitMs
      }
    })
  }
  // endregion ////
}
