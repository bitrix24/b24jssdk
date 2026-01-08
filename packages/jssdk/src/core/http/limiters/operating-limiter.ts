import type { OperatingLimitConfig, ILimiter } from '../../../types/limiters'
import type { PayloadTime } from '../../../types/payloads'
import type { LoggerInterface } from '../../../types/logger'
import { LoggerFactory } from '../../../logger'

interface OperatingStats {
  /*
   * operating time in 10 minutes (in ms)
   */
  operating: number
  /**
   * reset time (timestamp in ms)
   */
  operating_reset_at: number
  lastUpdated: number
}

/**
 * Operating limiting
 *
 * @todo docs
 */
export class OperatingLimiter implements ILimiter {
  #config: OperatingLimitConfig
  #methodStats = new Map<string, OperatingStats>()
  #stats = {
    /** Heavy requests */
    heavyRequestCount: 0
  }

  private _logger: LoggerInterface

  getTitle(): string {
    return 'operatingLimiter'
  }

  constructor(config: OperatingLimitConfig) {
    this._logger = LoggerFactory.createNullLogger()
    this.#config = config
  }

  // region Logger ////
  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
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
   * Returns the time until the method's operating limit is released (in ms)
   * The analysis is based on the previous function call.
   * It's important to understand that we're talking about locks of up to 10 minutes.
   * This is a fairly strict lock based on the limit:
   *   - not reached - no lock
   *   - reached - lock until the unlock time + 1 second
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

    // Use limit with buffer. When calculating the operating limit, we will take 5 seconds less
    const limitWithBuffer = Math.max(1_000, this.#config.limitMs - 5_000)
    if (stats.operating >= limitWithBuffer) {
      const now = Date.now()
      if (stats.operating_reset_at > now) {
        // Return the time before reset_at + 1 second
        return (stats.operating_reset_at - now) + 1_000
      }
      return 5_000 // 5 seconds by default
    }

    return 0
  }

  /**
   * For `batch` commands, returns the maximum time until the method reaches the operating limit (in ms)
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
   * Updates operating time statistics for the method
   */
  async updateStats(requestId: string, method: string, data: PayloadTime): Promise<void> {
    this.#cleanupOldStats()

    // all in seconds
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

      // log if close to the limit
      this.#logStat(requestId, method, usagePercent, stats.operating)
    }
  }

  /**
   * Clearing outdated operating limit data
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
