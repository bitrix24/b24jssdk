import type { AdaptiveConfig, ILimiter } from '../../../types/limiters'
import type { OperatingLimiter } from './operating-limiter'
import { LoggerBrowser, LoggerType } from '../../../logger/browser'

/**
 * Adaptive delayer
 * @todo перевод
 * @todo docs
 */
export class AdaptiveDelayer implements ILimiter {
  #config: AdaptiveConfig
  #operatingLimiter: OperatingLimiter
  #stats = {
    adaptiveDelays: 0,
    totalAdaptiveDelay: 0
  }

  private _logger: null | LoggerBrowser = null

  constructor(config: AdaptiveConfig, operatingLimiter: OperatingLimiter) {
    this.#config = config
    this.#operatingLimiter = operatingLimiter
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
    return true // Adaptive delay doesn't block, only delays
  }

  /**
   * Возвращает адаптивную задержку на основе предыдущего опыта
   */
  async waitIfNeeded(method: string, params?: any): Promise<number> {
    if (!this.#config.enabled) {
      return 0
    }

    const delay = this.#calculateDelay(method, params)

    if (delay > 0) {
      this.incrementAdaptiveDelays()
      this.#stats.totalAdaptiveDelay += delay
    }

    return delay
  }

  /**
   * Считает адаптивную задержку на основе предыдущего опыта
   */
  #calculateDelay(method: string, params?: any): number {
    if (method === 'batch') {
      return this.#calculateBatchDelay(params)
    }

    const stats = this.#operatingLimiter.getMethodStat(method)

    if (typeof stats === 'undefined') {
      return 0
    }

    const usagePercent = (stats.operating / this.#operatingLimiter.limitMs) * 100

    if (usagePercent > this.#config.thresholdPercent) {
      let adaptiveDelay = 0

      // Calculate based on previous delay or default
      const now = Date.now()
      if (stats.operating_reset_at > now) {
        adaptiveDelay += (stats.operating_reset_at - now) * this.#config.coefficient
      } else {
        adaptiveDelay += 7_000 // 7 секунд по умолчанию
      }

      const waitDelay = Math.min(adaptiveDelay, this.#config.maxDelay)

      this.getLogger().log(
        `⚠️ Method ${method}: предыдущий запрос использовал ${(usagePercent).toFixed(1)}% operating limit`,
        `Задержка:`,
        `- расчетная ${(adaptiveDelay / 1000).toFixed(2)} sec.`,
        `- фактическая ${(waitDelay / 1000).toFixed(2)} sec.`
      )

      return waitDelay
    }

    return 0
  }

  /**
   * Для `batch` из команд применяет адаптивную задержку на основе предыдущего опыта
   * @todo проверить для объектной натации
   * @todo проверить для всех натаций
   */
  #calculateBatchDelay(params: any): number {
    let maxDelay = 0

    if (!params?.cmd || !Array.isArray(params.cmd)) {
      return maxDelay
    }

    const batchMethods = params.cmd
      .map((row: string) => row.split('?')[0])
      .filter(Boolean)

    const batchMethodsUnique = [...new Set(batchMethods)]

    for (const methodName of batchMethodsUnique) {
      const delay = this.#calculateDelay(`batch::${methodName}`, {})
      maxDelay = Math.max(maxDelay, delay)
    }

    return maxDelay
  }

  async updateStats(_method: string, _data: any): Promise<void> {
    // Adaptive delayer updates based on operating limiter
  }

  async reset(): Promise<void> {
    this.#stats = {
      adaptiveDelays: 0,
      totalAdaptiveDelay: 0
    }
  }

  getStats(): {
    adaptiveDelays: number
    totalAdaptiveDelay: number
    adaptiveDelayAvg: number
  } {
    return {
      ...this.#stats,
      adaptiveDelayAvg: this.#stats.adaptiveDelays > 0
        ? this.#stats.totalAdaptiveDelay / this.#stats.adaptiveDelays
        : 0
    }
  }

  async setConfig(config: AdaptiveConfig): Promise<void> {
    this.#config = config
  }

  incrementAdaptiveDelays(): void {
    this.#stats.adaptiveDelays++
  }
}
