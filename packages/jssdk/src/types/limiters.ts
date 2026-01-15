import type { LoggerInterface } from './logger'
/**
 * @todo docs
 */

/**
 * Settings for operating limiting
 */
export interface OperatingLimitConfig {
  /**
   * Operating limit time period in milliseconds
   * Default: 10 minutes (600_000 ms)
   */
  windowMs: number
  /**
   * Maximum total execution time (operating) in milliseconds
   * Default: 480 seconds (480_000 ms)
   * When calculating the operating limit, we will use 5 seconds less
   * @see Http.getTimeToFree
   */
  limitMs: number
  /**
   * Threshold for notifications about heavy queries (%)
   */
  heavyPercent: number
}

/**
 * Adaptive pause settings
 */
export interface AdaptiveConfig {
  /**
   * Threshold for heavy queries (%)
   * Default: 80% - this means that `operating >= 384`
   * Specifies what % of `operatingLimit.limitMs` in `operating` should pause.
   */
  thresholdPercent: number
  /**
   * Pause multiplier
   * Default: 0.01 - 0.002 will result in a 1.2-second pause with increasing load
   * If: operating_reset_at > Date.now()
   * Then: Pause = (operating_reset_at - Date.now()) * coefficient
   * Otherwise: Pause = 7_000
   * There's no point in specifying a value close to 1, as this will create unnecessary delays.
   * In other words: if coefficient === 1, the pause will last until the blocking is unblocked, and our code hasn't yet reached the limits.
   * It's important to understand that the goal of adaptive blocking is to smoothly reduce the 'operating' of heavy queries.
   */
  coefficient: number
  /**
   * Maximum pause (ms)
   * Default: 7_000 ms
   * Limits the maximum estimated pause time
   */
  maxDelay: number
  /**
   * Whether adaptive pause is enabled
   * Default: true
   */
  enabled: boolean
}

/**
 * Rate limiting settings (Leaky Bucket)
 */
export interface RateLimitConfig {
  /**
   * X - limit before blocking (bucket capacity)
   * For standard plans: 50
   * For Enterprise: 250
   */
  burstLimit: number
  /**
   * Y - leak rate (requests per second)
   * For standard plans: 2
   * For Enterprise: 5
   */
  drainRate: number
  /**
   * Whether adaptive control is enabled
   * Default: true
   */
  adaptiveEnabled: boolean
}

/**
 * Parameters for managing all types of restrictions
 */
export interface RestrictionParams {
  rateLimit?: RateLimitConfig
  operatingLimit?: OperatingLimitConfig
  adaptiveConfig?: AdaptiveConfig
  /**
   * Maximum number of retries
   * Default: 3
   */
  maxRetries?: number
  /**
   * Base delay between retries (ms)
   * Default: 1_000
   */
  retryDelay?: number
}

/**
 * Limiter operation statistics
 */
export interface RestrictionManagerStats {
  /** Retries */
  retries: number
  /** Consecutive errors */
  consecutiveErrors: number
  /** Limit hits */
  limitHits: number
  /** Current number of tokens */
  tokens: number
  /** Adaptive delays */
  adaptiveDelays: number
  /** Total time of adaptive delays */
  totalAdaptiveDelay: number
  /** Heavy requests */
  heavyRequestCount: number
  /** Method statistics in seconds */
  operatingStats: { [method: string]: number }
}

export interface ILimiter {
  getTitle(): string
  setConfig(config: any): Promise<void>
  setLogger(logger: LoggerInterface): void
  getLogger(): LoggerInterface
  canProceed(requestId: string, method: string, params?: any): Promise<boolean>
  waitIfNeeded(requestId: string, method: string, params?: any): Promise<number>
  updateStats(requestId: string, method: string, data: any): Promise<void>
  reset(): Promise<void>
  getStats(): Record<string, any>
}
