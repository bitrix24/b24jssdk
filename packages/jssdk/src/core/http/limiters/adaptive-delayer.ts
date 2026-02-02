import type { AdaptiveConfig, ILimiter } from '../../../types/limiters'
import type { OperatingLimiter } from './operating-limiter'
import type { LoggerInterface } from '../../../types/logger'
import { LoggerFactory } from '../../../logger'

/**
 * Adaptive delayer
 *
 * @todo docs
 */
export class AdaptiveDelayer implements ILimiter {
  #config: AdaptiveConfig
  #operatingLimiter: OperatingLimiter
  #stats = {
    adaptiveDelays: 0,
    totalAdaptiveDelay: 0
  }

  private _logger: LoggerInterface

  getTitle(): string {
    return 'adaptiveDelayer'
  }

  constructor(config: AdaptiveConfig, operatingLimiter: OperatingLimiter) {
    this._logger = LoggerFactory.createNullLogger()
    this.#config = config
    this.#operatingLimiter = operatingLimiter
  }

  // region Logger ////
  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
    return this._logger
  }
  // endregion ////

  async canProceed(_requestId: string, _method: string, _params?: any): Promise<boolean> {
    return true // Adaptive delay doesn't block, only delays
  }

  /**
   * Returns an adaptive delay based on previous experience
   */
  async waitIfNeeded(requestId: string, method: string, params?: any): Promise<number> {
    if (!this.#config.enabled) {
      return 0
    }

    const delay = this.#calculateDelay(requestId, method, params)
    if (delay > 0) {
      this.incrementAdaptiveDelays()
      this.#stats.totalAdaptiveDelay += delay
    }

    return delay
  }

  /**
   * Calculates adaptive delay based on previous experience
   */
  #calculateDelay(requestId: string, method: string, params?: any): number {
    if (method === 'batch') {
      return this.#calculateBatchDelay(requestId, params)
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
        adaptiveDelay += 7_000 // 7 seconds by default
      }

      const waitDelay = Number.parseInt(Math.min(adaptiveDelay, this.#config.maxDelay).toFixed(0))

      this.#logStat(requestId, method, usagePercent, adaptiveDelay, waitDelay)
      return waitDelay
    }

    return 0
  }

  /**
   * For `batch`, applies adaptive delay based on previous experience from commands
   */
  #calculateBatchDelay(requestId: string, params: any): number {
    let maxDelay = 0

    if (!params?.cmd || !Array.isArray(params.cmd)) {
      return maxDelay
    }

    const batchMethods = params.cmd
      .map((row: string) => row.split('?')[0])
      .filter(Boolean)

    const batchMethodsUnique = [...new Set(batchMethods)]

    for (const methodName of batchMethodsUnique) {
      const delay = this.#calculateDelay(requestId, `batch::${methodName}`, {})
      maxDelay = Math.max(maxDelay, delay)
    }

    return maxDelay
  }

  async updateStats(_requestId: string, _method: string, _data: any): Promise<void> {
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

  // region Log ////
  #logStat(requestId: string, method: string, percent: number, adaptiveDelay: number, waitDelay: number) {
    this.getLogger().debug(`${this.getTitle()} state for method ${method}`, {
      requestId,
      method,
      percent: Number.parseFloat(percent.toFixed(2)),
      delays: {
        calculated: adaptiveDelay,
        actual: waitDelay
      }
    })
  }
  // endregion ////
}
