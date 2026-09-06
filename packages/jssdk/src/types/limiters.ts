import type { LoggerInterface } from './logger'
import type { PayloadTime } from './payloads'
/**
 * Types and interfaces for configuring rate-limiting and adaptive throttling of REST API requests.
 * These settings control the operating time window, per-window limits, and adaptive pause behaviour.
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
 * Parameters for managing all types of restrictions.
 *
 * `setRestrictionManagerParams` **replaces the parameters you name and keeps
 * the rest**, so a partial update is safe: changing `maxRetries` alone leaves
 * `hardErrorCodes`, `retryOnNetworkError` and the limiter blocks as they were.
 * It used to replace the whole configuration, silently resetting everything
 * a call did not mention (#479).
 *
 * The merge is **shallow**: `rateLimit`, `operatingLimit` and `adaptiveConfig`
 * are replaced whole rather than merged field by field. Their own types have
 * no optional fields, so supplying one means supplying all of it — a partial
 * block reaching the setter from JavaScript is refused with
 * `JSSDK_LIMITER_INVALID_CONFIG_BLOCK`. To change a single number, spread the
 * block you already have.
 *
 * An omitted key and one set to `undefined` mean the same thing: leave that
 * parameter alone. To clear a list, pass an empty array.
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
   * import { ParamsFactory } from '@bitrix24/b24jssdk'
   *
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
  /**
   * Decide the soft/hard split for `restApi:v3` by the **response category**
   * rather than by an enumerated list of codes.
   *
   * With this on, an error that arrived in the v3 error envelope with an HTTP
   * **4xx other than 401, 408 or 429** is returned inside `AjaxResult` as a
   * soft error, whatever its code. `hardErrorCodes` and `softErrorCodes` still
   * outrank the rule, so a pinned classification always wins; 5xx is untouched;
   * and `restApi:v2`, whose flat error body is not a v3 envelope, is unaffected.
   *
   * **Why it is not the default yet.** Turning it on changes *how* an error is
   * delivered: a code that throws today resolves instead, so a `try / catch`
   * around the call stops firing and control falls through into the success
   * path. That is a breaking change, so it is opt-in for the 2.x line and
   * becomes the default in 3.0.0. Callers relying on `catch` move to
   * `if (!response.isSuccess)`.
   *
   * **Why the rule exists.** The built-in soft list holds nine v3 codes; a
   * single on-premise build ships at least 39, and the set grows with every
   * portal module. Classification by list is therefore per-module-shipping-date
   * rather than per-error-kind: `INVALIDSELECTEXCEPTION` is soft while
   * `INVALIDPAGINATIONEXCEPTION` — the same caller mistake, same request, same
   * HTTP 400 — throws. Codes are also not uniformly prefixed
   * (`NOTE_SEARCH_QUERY_TOO_SHORT` carries none), so no pattern match can
   * stand in for the list either.
   *
   * @default false
   *
   * @example
   * ```ts
   * import { ParamsFactory } from '@bitrix24/b24jssdk'
   *
   * await $b24.setRestrictionManagerParams({
   *   ...ParamsFactory.getDefault(),
   *   classifyV3ErrorsByCategory: true
   * })
   *
   * const response = await $b24.actions.v3.call.make({ method: 'main.eventlog.list', params: {} })
   * if (!response.isSuccess) {
   *   // Reached for any 4xx the portal reports, not only the nine listed codes.
   *   console.log(response.getErrorMessages().join('; '))
   * }
   * ```
   */
  classifyV3ErrorsByCategory?: boolean
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
  /**
   * @param data - the response's `time` block, or `undefined` when the portal
   *   sent none. Not every success carries one — `rest.documentation.openapi`
   *   answers with the OpenAPI document at the top level — so an implementation
   *   must tolerate its absence rather than assume it away.
   */
  updateStats(requestId: string, method: string, data: PayloadTime | undefined): Promise<void>
  reset(): Promise<void>
  getStats(): Record<string, any>
}
