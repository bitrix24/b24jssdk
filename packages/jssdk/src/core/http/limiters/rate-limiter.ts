import type { ILimiter, RateLimitConfig } from '../../../types/limiters'
import type { LoggerInterface } from '../../../types/logger'
import { LoggerFactory } from '../../../logger'

/**
 * Rate limiting (Leaky Bucket) with adaptive control
 */
export class RateLimiter implements ILimiter {
  #tokens: number
  #lastRefill: number
  #refillIntervalMs: number
  #config: RateLimitConfig
  #lockQueue: Array<() => void> = []

  #originalConfig: RateLimitConfig // Original configuration for recovery
  #errorThreshold: number = 5 // 60-second error threshold to reduce limits
  #successThreshold: number = 20 // Consecutive success threshold for restoring limits
  #minDrainRate: number = 0.5 // Minimum drain rate
  #minBurstLimit: number = 5 // Minimum burst limit
  #errorTimestamps: number[] = [] // Error timestamps (last 60 seconds)
  #successTimestamps: number[] = [] // Timestamps of successful requests

  private _logger: LoggerInterface

  constructor(config: RateLimitConfig) {
    this._logger = LoggerFactory.createNullLogger()
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
  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
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

      // Replenishing tokens
      const refillAmount = timePassed * this.#config.drainRate / 1_000
      this.#tokens = Math.min(
        this.#config.burstLimit,
        this.#tokens + refillAmount
      )

      // We always update the time of the last replenishment
      this.#lastRefill = now

      // If there are enough tokens
      if (this.#tokens >= 1) {
        // Consume token
        this.#tokens -= 1
        return 0
      }

      // Calculating the waiting time for 1 token
      const deficit = 1 - this.#tokens
      return Math.ceil(deficit * this.#refillIntervalMs)
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * Error handler.
   * If there are a lot of errors, we'll lower the limits.
   */
  async handleExceeded(requestId: string): Promise<number> {
    await this.#acquireLock(requestId)

    try {
      this.#recordError()

      // Adaptive regulation: if there are many errors, we reduce the limits
      if (this.#config.adaptiveEnabled && this.#shouldReduceLimits()) {
        this.#reduceLimits(requestId)
      }

      this.#tokens = 0
      // Wait for the time to restore at least one token + 1sec
      return this.#refillIntervalMs + 1_000
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * Successful request handler.
   * If everything is OK, we'll restore the limits.
   */
  async updateStats(requestId: string, method: string, _data: any): Promise<void> {
    // skip accounting of `batch` subqueries
    if (method.startsWith('batch::')) {
      return
    }

    await this.#acquireLock(requestId)

    try {
      this.#recordSuccess()

      // Adaptive regulation: if we operate stably, we restore the limits
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

      // Restore original settings during reset
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

      // If the new configuration increases burstLimit, we can increase the current number of tokens
      if (config.burstLimit > this.#tokens) {
        this.#tokens = Math.min(config.burstLimit, this.#tokens)
      }

      // Reset statistics when changing configuration
      this.#errorTimestamps = []
      this.#successTimestamps = []
    } finally {
      this.#releaseLock()
    }
  }

  /**
   * Acquire a lock for the critical section
   * Uses a promise queue
   */
  async #acquireLock(requestId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      // Add the resolution function to the queue
      const queueLength = this.#lockQueue.push(resolve)

      if (queueLength > 1) {
        this.#logAcquireQueue(requestId, queueLength)
      }
      // If it's the first one in the queue, we allow it immediately
      if (this.#lockQueue.length === 1) {
        resolve()
      }
    })
  }

  /**
   * Releases the lock and allows the next person in the queue to proceed
   */
  #releaseLock(): void {
    // Remove the current resolver from the front of the queue
    this.#lockQueue.shift()

    // If there are any waiting, resolve the next one
    if (this.#lockQueue.length > 0) {
      const nextResolve = this.#lockQueue[0]
      nextResolve()
    }
  }

  /**
   * Checks whether the limits need to be reduced
   */
  #shouldReduceLimits(): boolean {
    // If there are more errors than the threshold in the last 60 seconds
    return this.#errorTimestamps.length >= this.#errorThreshold
  }

  /**
   * Checks whether limits need to be restored
   * Restore if:
   *   1. Many successful requests (more than the threshold)
   *   2. Few errors (less than half the threshold)
   *   3. Current limits are lower than the original ones
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
   * Reduces limits for frequent errors
   */
  #reduceLimits(requestId: string): void {
    // Reduce drainRate by 20%, but not below the minimum
    const newDrainRate = Math.max(
      this.#minDrainRate,
      Number.parseFloat((this.#config.drainRate * 0.8).toFixed(2))
    )

    // Reduce burstLimit by 20%, but not below the minimum
    const newBurstLimit = Math.max(
      this.#minBurstLimit,
      Number.parseFloat((this.#config.burstLimit * 0.8).toFixed(2))
    )

    // Applying new limits
    this.#config.drainRate = newDrainRate
    this.#config.burstLimit = newBurstLimit
    this.#refillIntervalMs = 1000 / newDrainRate

    this.#logReduceLimits(requestId, newDrainRate, newBurstLimit)

    // Reset error statistics after reduction
    this.#errorTimestamps = []
    this.#successTimestamps = []
  }

  /**
   * Restores limits during stable operation
   */
  #restoreLimits(requestId: string): void {
    if (
      this.#config.drainRate === this.#originalConfig.drainRate
      && this.#config.burstLimit === this.#originalConfig.burstLimit
    ) {
      return
    }

    // Restore drainRate to 10% of its original value
    const newDrainRate = Math.min(
      this.#originalConfig.drainRate,
      Number.parseFloat((this.#config.drainRate * 1.1).toFixed(2))
    )

    // Restore burstLimit to 10% of its original value
    const newBurstLimit = Math.min(
      this.#originalConfig.burstLimit,
      Number.parseFloat((this.#config.burstLimit * 1.1).toFixed(2))
    )

    // Applying new limits
    this.#config.drainRate = newDrainRate
    this.#config.burstLimit = newBurstLimit
    this.#refillIntervalMs = 1000 / newDrainRate

    this.#logRestoreLimits(requestId, newDrainRate, newBurstLimit)

    // Reset success statistics after recovery
    this.#errorTimestamps = []
    this.#successTimestamps = []
  }

  /**
   * Writes an error to the temporary history
   */
  #recordError(): void {
    const now = Date.now()
    this.#errorTimestamps.push(now)

    // Clear ALL progress
    this.#successTimestamps = []
    this.#cleanupOldErrors(now)
  }

  /**
   * Clears old errors (older than 60 seconds)
   */
  #cleanupOldErrors(now: number): void {
    const cutoff = now - 60_000
    this.#errorTimestamps = this.#errorTimestamps.filter(timestamp => timestamp > cutoff)
  }

  /**
   * Writes a successful request to the temporary history
   */
  #recordSuccess(): void {
    const now = Date.now()
    this.#successTimestamps.push(now)

    this.#cleanupOldSuccesses()
    this.#cleanupOldErrors(now)
  }

  /**
   * Clears old progress
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

    this.getLogger().warning(
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

    this.getLogger().warning(
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
    this.getLogger().debug(`${this.getTitle()} request in queue`, {
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

    this.getLogger().debug(`${this.getTitle()} state`, {
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
