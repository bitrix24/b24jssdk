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
  /**
   * Whether to retry on transport-level errors (`NETWORK_ERROR`, `REQUEST_TIMEOUT`).
   *
   * Default: `true` — preserves the historical retry behaviour.
   *
   * Set to `false` for **non-idempotent** calls (e.g. `crm.documentgenerator.document.add`,
   * any `*.add` that creates an entity, file uploads). When the request times out
   * client-side, the server may still have processed it successfully — retrying then
   * creates duplicates. With `retryOnNetworkError: false` the SDK immediately throws
   * `NETWORK_ERROR` / `REQUEST_TIMEOUT` instead of retrying.
   *
   * For long-running heavy operations also raise the axios timeout:
   * ```ts
   * const clientAxios = $b24.getHttpClient(ApiVersion.v2).ajaxClient
   * clientAxios.defaults.timeout = 120_000
   * ```
   */
  retryOnNetworkError?: boolean
  /**
   * Additional error codes that must be thrown as exceptions immediately,
   * without any retry. Merged with the SDK's built-in hard list — you can
   * only **add** codes, not remove built-ins (auth / fatal codes are always hard).
   *
   * Use this for business-specific or custom REST methods whose error codes
   * the SDK doesn't know about (otherwise the SDK treats unknown codes as
   * transient and retries them with backoff).
   *
   * @example
   * ```ts
   * await $b24.setRestrictionManagerParams({
   *   ...ParamsFactory.getDefault(),
   *   hardErrorCodes: ['DOCUMENT_GENERATOR_ALREADY_IN_QUEUE', 'MY_APP_BAD_PAYLOAD']
   * })
   * ```
   */
  hardErrorCodes?: string[]
  /**
   * Additional error codes that should be returned inside `AjaxResult` as a
   * soft error instead of thrown. Merged with the SDK's built-in soft list.
   *
   * Use this when your application expects to inspect a specific REST error
   * code as part of normal control flow (e.g. validation errors from a
   * custom v3 endpoint).
   */
  softErrorCodes?: string[]
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
