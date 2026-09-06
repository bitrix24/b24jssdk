import type {
  AdaptiveConfig,
  OperatingLimitConfig,
  RateLimitConfig,
  RestrictionManagerStats,
  RestrictionParams
} from '../../../types/limiters'
import type { LoggerInterface } from '../../../types/logger'
import type { PayloadTime } from '../../../types/payloads'
import { LoggerFactory } from '../../../logger'
import { RateLimiter } from './rate-limiter'
import { OperatingLimiter } from './operating-limiter'
import { AdaptiveDelayer } from './adaptive-delayer'
import { ParamsFactory } from './params-factory'
import { SdkError } from '../../sdk-error'

const RATE_LIMIT_FIELDS = ['burstLimit', 'drainRate', 'adaptiveEnabled'] as const
const OPERATING_LIMIT_FIELDS = ['windowMs', 'limitMs', 'heavyPercent'] as const
const ADAPTIVE_CONFIG_FIELDS = ['thresholdPercent', 'coefficient', 'maxDelay', 'enabled'] as const

/**
 * Drops keys whose value is explicitly `undefined`.
 *
 * Object spread copies an own key even when its value is `undefined`, so
 * `{ ...config, ...{ maxRetries: undefined } }` erases `maxRetries` rather than
 * keeping it — the natural spelling of an optional override
 * (`maxRetries: fromEnv ? Number(fromEnv) : undefined`) silently emptied the
 * field, and `maxRetries` reaching the retry loop as `undefined` made
 * `attempt < undefined` false on the first pass, so every call failed as
 * "all attempts exhausted" without one request going out.
 *
 * With this, "omitted" and "explicitly undefined" mean the same thing, which is
 * what the merge promises and what the block guards below already assumed.
 */
function definedOnly(params: RestrictionParams): RestrictionParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as RestrictionParams
}

/**
 * Copies the nested blocks and the code arrays, not just the top level.
 *
 * A sub-limiter stores the block it is given by reference and rewrites it in
 * place — `RateLimiter` lowers `drainRate` and `burstLimit` as it throttles
 * adaptively. A shallow spread therefore handed a caller the live enforcement
 * state: reading the policy showed values changing underneath, and pushing onto
 * the returned `hardErrorCodes` reconfigured the manager without ever calling
 * the setter.
 */
function cloneParams(params: RestrictionParams): RestrictionParams {
  return {
    ...params,
    ...(params.rateLimit ? { rateLimit: { ...params.rateLimit } } : {}),
    ...(params.operatingLimit ? { operatingLimit: { ...params.operatingLimit } } : {}),
    ...(params.adaptiveConfig ? { adaptiveConfig: { ...params.adaptiveConfig } } : {}),
    ...(params.hardErrorCodes ? { hardErrorCodes: [...params.hardErrorCodes] } : {}),
    ...(params.softErrorCodes ? { softErrorCodes: [...params.softErrorCodes] } : {})
  }
}

/**
 * Refuses a limiter block that is not whole.
 *
 * The blocks are replaced rather than deep-merged, and their types carry no
 * optional fields — so for a TypeScript caller a half-specified block is
 * already a compile error. JavaScript has no such gate, and neither does a
 * cast: `{ rateLimit: { burstLimit: 7 } }` used to reach `RateLimiter`, where
 * `1000 / undefined` is `NaN`, `while (waitTime > 0)` is false on `NaN`, and
 * rate limiting was simply off for the rest of the process — no error, nothing
 * logged. That is the failure class this whole change exists to remove, so it
 * is not acceptable one layer down.
 *
 * @throws {SdkError} `JSSDK_LIMITER_INVALID_CONFIG_BLOCK`
 */
function assertBlock(
  block: object | undefined,
  name: string,
  fields: readonly string[]
): void {
  if (block === undefined) {
    return
  }

  const present = block as Record<string, unknown> | null
  const missing = present === null
    ? [...fields]
    : fields.filter(field => present[field] === undefined)

  if (missing.length === 0) {
    return
  }

  // Static text plus the block and field names only — never a caller value.
  throw new SdkError({
    code: 'JSSDK_LIMITER_INVALID_CONFIG_BLOCK',
    description: `setRestrictionManagerParams: \`${name}\` is replaced whole, not merged, so it must carry every field. `
      + `Missing: ${missing.join(', ')}. Spread the current block if you mean to change one value.`,
    status: 500
  })
}

/**
 * Central coordinator for all outbound request throttling.
 *
 * Composes a {@link RateLimiter} (requests-per-second cap), an
 * {@link OperatingLimiter} (Bitrix24 operating-time budget), and an
 * {@link AdaptiveDelayer} (back-off based on observed server load) into a
 * single façade consumed by {@link AbstractHttp}. Tracks aggregate stats
 * (retries, consecutive errors, limit hits) and propagates a shared logger
 * to all three sub-limiters.
 */
export class RestrictionManager {
  #rateLimiter: RateLimiter
  #operatingLimiter: OperatingLimiter
  #adaptiveDelayer: AdaptiveDelayer
  #config: RestrictionParams
  #stats: Pick<RestrictionManagerStats, 'retries' | 'consecutiveErrors' | 'limitHits'> = {
    /** Retry attempts */
    retries: 0,
    /** Consecutive errors */
    consecutiveErrors: 0,
    /** Limit triggers */
    limitHits: 0
  }

  #errorCounts = new Map<string, number>()

  private _logger: LoggerInterface

  /**
   * `RestrictionManager` is exported from the package root and every field of
   * `RestrictionParams` is optional, so `new RestrictionManager({ maxRetries: 5 })`
   * is a call TypeScript accepts. It used to throw from inside `RateLimiter`,
   * because the defaulting lived one class away in `AbstractHttp` and the
   * assertions here claimed a caller always sends every block. Merging against
   * the defaults makes the class safe on its own terms, and makes the promise
   * this file documents true here as well as in the setter. (#479)
   */
  constructor(params: RestrictionParams) {
    this._logger = LoggerFactory.createNullLogger()

    const patch = definedOnly(params)

    // The same gate as `setConfig`. A block replaces the default whole, so a
    // half-specified one here reaches `RateLimiter` exactly as it would through
    // the setter — and this door is open from `B24Hook`'s `restrictionParams`
    // option as well as from the exported class.
    assertBlock(patch.rateLimit, 'rateLimit', RATE_LIMIT_FIELDS)
    assertBlock(patch.operatingLimit, 'operatingLimit', OPERATING_LIMIT_FIELDS)
    assertBlock(patch.adaptiveConfig, 'adaptiveConfig', ADAPTIVE_CONFIG_FIELDS)

    this.#config = cloneParams({ ...ParamsFactory.getDefault(), ...patch })
    this.#rateLimiter = new RateLimiter(this.#config.rateLimit as RateLimitConfig)
    this.#operatingLimiter = new OperatingLimiter(this.#config.operatingLimit as OperatingLimitConfig)
    this.#adaptiveDelayer = new AdaptiveDelayer(this.#config.adaptiveConfig as AdaptiveConfig, this.#operatingLimiter)
  }

  // region Logger ////
  setLogger(logger: LoggerInterface): void {
    this._logger = logger
    this.#rateLimiter.setLogger(this._logger)
    this.#operatingLimiter.setLogger(this._logger)
    this.#adaptiveDelayer.setLogger(this._logger)
  }

  getLogger(): LoggerInterface {
    return this._logger
  }
  // endregion ////

  async applyOperatingLimits(requestId: string, method: string, params?: any): Promise<void> {
    // 1. Check operating limit
    const operatingWait = await this.#operatingLimiter.waitIfNeeded(requestId, method, params)
    if (operatingWait > 0) {
      this.incrementStats('limitHits')
      this.#logMethodBlocked(this.#operatingLimiter.getTitle(), requestId, method, operatingWait)
      await this.#delay(operatingWait)
    } else {
      // 2. Apply adaptive delay
      const adaptiveDelay = await this.#adaptiveDelayer.waitIfNeeded(requestId, method, params)
      if (adaptiveDelay > 0) {
        this.incrementStats('limitHits')
        this.#logMethodBlocked(this.#adaptiveDelayer.getTitle(), requestId, method, adaptiveDelay)
        await this.#delay(adaptiveDelay)
      }
    }
  }

  /**
   * Checks and waits for the rate limit
   * The loop is needed for parallel requests (Promise.all())
   */
  async checkRateLimit(requestId: string, method: string): Promise<void> {
    // 3. Apply rate limit
    let waitTime
    let times = 1
    do {
      waitTime = await this.#rateLimiter.waitIfNeeded(requestId, method)
      if (waitTime > 0) {
        this.incrementStats('limitHits')
        this.#logMethodBlockedWithTimes(this.#rateLimiter.getTitle(), requestId, method, waitTime, times)
        await this.#delay(waitTime)
        times++
      }
    } while (waitTime > 0)
  }

  /**
   * Fans the response's `time` block out to all three limiters.
   *
   * `timeData` is `undefined` when the portal sent no `time` block at all, which
   * a success legitimately can — `rest.documentation.openapi` answers with the
   * OpenAPI document at the top level. The transport already skips this call in
   * that case; the parameter stays optional because `updateStats` is on the
   * public {@link ILimiter} contract and the transport is not its only caller.
   */
  async updateStats(
    requestId: string,
    method: string,
    timeData: PayloadTime | undefined
  ): Promise<void> {
    await this.#operatingLimiter.updateStats(requestId, method, timeData)
    await this.#adaptiveDelayer.updateStats(requestId, method, timeData)
    await this.#rateLimiter.updateStats(requestId, method, timeData)
  }

  async handleError(
    requestId: string,
    method: string,
    params: any,
    error: any,
    attempt: number
  ): Promise<number> {
    // Rate limit exceeded
    if (this.#isRateLimitError(error)) {
      // Since this is error handling, we take into account the number of attempts
      const wait = (await this.#handleRateLimitExceeded(requestId)) * Math.pow(1.5, attempt)
      this.#logError(this.#rateLimiter.getTitle(), requestId, 'QUERY_LIMIT_EXCEEDED', error.message, method, wait)
      return wait
    }

    // Operating limit exceeded
    if (this.#isOperatingLimitError(error)) {
      // Since this is error handling, we will increase the minimum to 10 seconds.
      const wait = Math.max(10_000, await this.#handleOperatingLimitError(requestId, method, params, error))
      this.#logError(this.#operatingLimiter.getTitle(), requestId, 'OPERATION_TIME_LIMIT', error.message, method, wait)
      return wait
    }

    // Client errors (HTTP 4xx) are deterministic — retrying cannot change the
    // outcome, so fail fast regardless of whether the error code is enumerated.
    // 429 (rate/operating limit) is handled above; 408 (timeout) stays retryable.
    if (this.#isNonRetryableClientError(error)) {
      this.#logNonRetryableClientError(requestId, error?.code ? `${error.code}` : '?', error?.message ?? '', method, Number(error?.status ?? 0))
      return 0
    }

    // Other exceptions
    if (!this.#isNeedThrowError(error)) {
      // Since this is error handling, we take into account the number of attempts
      const baseDelay = await this.#getErrorBackoff(requestId)
      const maxDelay = Math.max(30_000, baseDelay)
      const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))

      // Add jitter to prevent thundering herd
      const jitter = delay * 0.1 * (Math.random() * 2 - 1) // ±10% jitter
      const wait = Math.max(100, delay + jitter)

      this.#logSomeError(requestId, error?.code ? `${error.code}` : '?', error.message, method, wait)

      return wait
    }

    return 0 // We don't repeat
  }

  /**
   * Checks if the error is a rate limit
   */
  #isRateLimitError(error: any): boolean {
    return error.status === 503
      || error.code === 'QUERY_LIMIT_EXCEEDED'
  }

  /**
   * Delay when exceeding the rate limit
   */
  async #handleRateLimitExceeded(requestId: string): Promise<number> {
    return this.#rateLimiter.handleExceeded(requestId)
  }

  /**
   * Checks if the error is an operating limit
   *
   * @memo `OPERATION_TIME_LIMIT` && `429` - obtained through practical means
   * @memo This doesn't work for `batch` queries.
   */
  #isOperatingLimitError(error: any): boolean {
    return error.status === 429
      || error.code === 'OPERATION_TIME_LIMIT'
  }

  /**
   * Operating limit error delay
   *
   * @memo Currently, the errors don't include timings for operations.
   *       For this reason, we will take data from the previous request
   */
  async #handleOperatingLimitError(requestId: string, method: string, params?: any, _error?: any): Promise<number> {
    return this.#operatingLimiter.getTimeToFree(requestId, method, params, _error)
  }

  /**
   * Checks if the error is a non-retryable client error (HTTP 4xx).
   *
   * `429` is excluded — it is handled as a rate/operating limit and is retried
   * with backoff. `408` (request timeout) is excluded — it is transient and is
   * governed by `retryOnNetworkError`.
   */
  #isNonRetryableClientError(error: any): boolean {
    const status = Number(error?.status ?? 0)
    if (Number.isNaN(status)) {
      return false
    }
    return status >= 400 && status < 500 && status !== 408 && status !== 429
  }

  /**
   * Checks whether attempts should be stopped if errors are encountered that are unclear.
   */
  #isNeedThrowError(error: any): boolean {
    const answerError = {
      code: error?.code ?? '-1',
      description: error?.message ?? ''
    }

    return [
      ...this.exceptionCodeForHard,
      ...this.exceptionCodeForSoft
    ].includes(answerError.code)
    || (answerError.description ?? '').includes('Could not find value for parameter')
  }

  /**
   * Built-in hard error codes (always throw, never retry).
   *
   * Includes authorization and fatal codes that must never be silently retried.
   * Use `RestrictionParams.hardErrorCodes` to extend this list with custom codes.
   */
  static readonly BUILT_IN_HARD_ERROR_CODES: readonly string[] = [
    'ERR_BAD_REQUEST',
    'JSSDK_UNKNOWN_ERROR',
    '100',
    'INTERNAL_SERVER_ERROR', 'ERROR_UNEXPECTED_ANSWER', 'PORTAL_DELETED',
    'ERROR_BATCH_METHOD_NOT_ALLOWED', 'ERROR_BATCH_LENGTH_EXCEEDED',
    'NO_AUTH_FOUND',
    'INVALID_REQUEST',
    'OVERLOAD_LIMIT', 'expired_token', 'invalid_token',
    'ACCESS_DENIED', 'INVALID_CREDENTIALS', 'user_access_error', 'insufficient_scope',
    // The `restApi:v3` spelling of `insufficient_scope`, pinned so the same
    // condition is delivered the same way on both versions. Without it the v3
    // form matches nothing — it is a different string — and the category rule
    // would soften it at 403 while the v2 form kept throwing. This is a missing
    // OAuth grant, a configuration fault rather than a per-record ACL check, so
    // it stays loud; the neighbouring `…ACCESSDENIEDEXCEPTION` is a permission
    // check and stays soft. (#460)
    'BITRIX_REST_V3_EXCEPTION_INSUFFICIENTSCOPEEXCEPTION',
    'ERROR_MANIFEST_IS_NOT_AVAILABLE',
    'allowed_only_intranet_user',
    'NOT_FOUND',
    'INVALID_ARG_VALUE'
  ]

  /**
   * Built-in soft error codes (returned as `AjaxResult` with error, never thrown).
   *
   * Use `RestrictionParams.softErrorCodes` to extend this list with custom codes.
   */
  static readonly BUILT_IN_SOFT_ERROR_CODES: readonly string[] = [
    'ERROR_ENTITY_NOT_FOUND',
    'BITRIX_REST_V3_EXCEPTION_ACCESSDENIEDEXCEPTION',
    'BITRIX_REST_V3_EXCEPTION_INVALIDJSONEXCEPTION',
    'BITRIX_REST_V3_EXCEPTION_INVALIDFILTEREXCEPTION',
    'BITRIX_REST_V3_EXCEPTION_INVALIDSELECTEXCEPTION',
    'BITRIX_REST_V3_EXCEPTION_ENTITYNOTFOUNDEXCEPTION',
    'BITRIX_REST_V3_EXCEPTION_METHODNOTFOUNDEXCEPTION',
    'BITRIX_REST_V3_EXCEPTION_UNKNOWNDTOPROPERTYEXCEPTION',
    'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
    'BITRIX_REST_V3_EXCEPTION_VALIDATION_DTOVALIDATIONEXCEPTION'
  ]

  /**
   * Codes that cause the SDK to throw immediately.
   *
   * Composed of:
   * - `BUILT_IN_HARD_ERROR_CODES` (always included)
   * - `NETWORK_ERROR` and `REQUEST_TIMEOUT` when `retryOnNetworkError === false`
   * - `RestrictionParams.hardErrorCodes` (user-provided extensions)
   */
  get exceptionCodeForHard(): string[] {
    const codes = [...RestrictionManager.BUILT_IN_HARD_ERROR_CODES]

    if (this.#config.retryOnNetworkError === false) {
      codes.push('NETWORK_ERROR', 'REQUEST_TIMEOUT')
    }

    if (this.#config.hardErrorCodes && this.#config.hardErrorCodes.length > 0) {
      codes.push(...this.#config.hardErrorCodes)
    }

    return codes
  }

  /**
   * Codes returned as `AjaxResult` with an `AjaxError` payload instead of thrown.
   *
   * Composed of:
   * - `BUILT_IN_SOFT_ERROR_CODES` (always included)
   * - `RestrictionParams.softErrorCodes` (user-provided extensions)
   */
  get exceptionCodeForSoft(): string[] {
    const codes = [...RestrictionManager.BUILT_IN_SOFT_ERROR_CODES]

    if (this.#config.softErrorCodes && this.#config.softErrorCodes.length > 0) {
      codes.push(...this.#config.softErrorCodes)
    }

    return codes
  }

  /**
   * Statuses a 4xx category rule must not claim.
   *
   * `401` belongs to the auth-refresh path, which owns it end to end. `408`
   * and `429` are the two retryable 4xx — the same pair
   * `#isNonRetryableClientError` excludes — and an error still being retried
   * has not been classified yet.
   *
   * `403` is deliberately **not** here. A permission or scope refusal is
   * caller-addressable, and `…_ACCESSDENIEDEXCEPTION` is already in the
   * built-in soft list, so excluding 403 would leave one 403 soft by list and
   * its neighbour thrown — exactly the per-code arbitrariness this rule
   * removes. (#460)
   */
  static readonly #CATEGORY_RULE_EXCLUDED_STATUSES: readonly number[] = [401, 408, 429]

  /**
   * Should this error reach the caller inside an `AjaxResult` rather than be
   * thrown?
   *
   * Evaluated in a fixed order, most specific first:
   *
   * 1. a code in `exceptionCodeForHard` throws — so the rule can never soften
   *    a credential failure, and a caller's `hardErrorCodes` always wins;
   * 2. a code in `exceptionCodeForSoft` is soft — so the built-in list, the v2
   *    codes and a caller's `softErrorCodes` keep working unchanged;
   * 3. with `classifyV3ErrorsByCategory` on, an error that arrived in the
   *    **v3 error envelope** carrying a **4xx other than 401 / 408 / 429** is
   *    soft, whatever its code;
   * 4. otherwise it throws, which is what happens today for anything unlisted.
   *
   * Step 3 keys on the envelope the response actually carried, never on the
   * client's own version: a gateway in front of the v3 controller is documented
   * to sometimes answer in the flat v2 shape, and such a body is left to the
   * lists.
   */
  isSoftError(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code
    const codeText = typeof code === 'string' ? code : ''

    if (this.exceptionCodeForHard.includes(codeText)) {
      return false
    }

    if (this.exceptionCodeForSoft.includes(codeText)) {
      return true
    }

    if (this.#config.classifyV3ErrorsByCategory !== true) {
      return false
    }

    // This check, not the status range below, is what keeps an untagged error
    // out of the rule. Every other path that builds an `AjaxError` — the
    // 401 refresh, a timeout, a network failure, `_convertUnknownErrorToAjaxError`
    // — leaves `isV3Envelope` undefined, and today each also carries a status
    // the range happens to exclude. That overlap is a coincidence, not a
    // guarantee: a future conversion path producing a synthetic 403 without an
    // envelope must still be refused here. Do not remove this as redundant.
    if ((error as { isV3Envelope?: unknown } | null)?.isV3Envelope !== true) {
      return false
    }

    const status = Number((error as { status?: unknown } | null)?.status ?? 0)

    return Number.isInteger(status)
      && status >= 400
      && status < 500
      && !RestrictionManager.#CATEGORY_RULE_EXCLUDED_STATUSES.includes(status)
  }

  /**
   * Delay due to unknown errors
   */
  async #getErrorBackoff(_requestId: string): Promise<number> {
    // Unreachable today — the constructor merges against the defaults, so
    // `retryDelay` is always set. Kept because the alternative spelling is
    // `retryDelay!`, the assertion pattern this file just finished removing,
    // and an absent value there produces `NaN` delays rather than a clean
    // failure — a retry storm dressed up as a backoff.
    return this.#config.retryDelay ?? ParamsFactory.getDefault().retryDelay!
  }

  incrementError(method: string): void {
    const current = this.#errorCounts.get(method) || 0
    this.#errorCounts.set(method, current + 1)
    this.incrementStats('consecutiveErrors')
  }

  resetErrors(method: string): void {
    this.#errorCounts.delete(method)
    this.#stats.consecutiveErrors = 0
  }

  incrementStats(stat: keyof Pick<RestrictionManagerStats, 'retries' | 'consecutiveErrors' | 'limitHits'>): void {
    this.#stats[stat]++
  }

  /**
   * Returns job statistics
   */
  getStats(): RestrictionManagerStats & {
    adaptiveDelayAvg: number
    errorCounts: Record<string, number>
  } {
    return {
      ...this.#stats,
      ...this.#rateLimiter.getStats(),
      ...this.#adaptiveDelayer.getStats(),
      ...this.#operatingLimiter.getStats(),
      errorCounts: Object.fromEntries(this.#errorCounts)
    }
  }

  /**
   * Resets limiters and statistics
   */
  async reset(): Promise<void> {
    await this.#rateLimiter.reset()
    await this.#operatingLimiter.reset()
    await this.#adaptiveDelayer.reset()
    this.#errorCounts.clear()

    this.#stats = {
      retries: 0,
      consecutiveErrors: 0,
      limitHits: 0
    }
  }

  /**
   * Replaces the named parameters, keeping the ones not mentioned.
   *
   * It used to assign — `this.#config = params` — so a caller changing one
   * field silently lost every other one. `setRestrictionManagerParams({
   * maxRetries: 5 })` after a careful setup left `hardErrorCodes`,
   * `retryOnNetworkError`, `classifyV3ErrorsByCategory` **and** `rateLimit` all
   * `undefined`, with no error and nothing in the log. (#479)
   *
   * The tell was in our own documentation: every example of this method spreads
   * `...ParamsFactory.getDefault()` first. That was not house style, it was a
   * workaround repeated everywhere the method appeared.
   *
   * **The merge is shallow.** `rateLimit`, `operatingLimit` and
   * `adaptiveConfig` are replaced **whole**, not merged field by field — pass
   * one and you supply all of its fields, omit it and it is left untouched.
   * Deep-merging them would let a half-specified `rateLimit` combine with an
   * older one into a pair of numbers nobody chose; replacing keeps a limiter's
   * configuration something a caller stated in one place.
   *
   * A sub-limiter is only reconfigured when its own block was supplied, which
   * is also why the non-null assertions here are gone: they claimed the caller
   * always sends every block, and the whole point of this method is that they
   * do not. A block that *is* supplied must be whole — `assertBlock` refuses a
   * partial one rather than letting `1000 / undefined` switch rate limiting off
   * for the rest of the process.
   *
   * An **explicitly `undefined`** value counts as "not mentioned". Object
   * spread would otherwise copy the key and erase the field, which is not what
   * `maxRetries: enabled ? 5 : undefined` means.
   */
  async setConfig(params: RestrictionParams): Promise<void> {
    const patch = definedOnly(params)

    assertBlock(patch.rateLimit, 'rateLimit', RATE_LIMIT_FIELDS)
    assertBlock(patch.operatingLimit, 'operatingLimit', OPERATING_LIMIT_FIELDS)
    assertBlock(patch.adaptiveConfig, 'adaptiveConfig', ADAPTIVE_CONFIG_FIELDS)

    this.#config = cloneParams({ ...this.#config, ...patch })

    if (patch.rateLimit !== undefined) {
      await this.#rateLimiter.setConfig({ ...patch.rateLimit })
    }

    if (patch.operatingLimit !== undefined) {
      await this.#operatingLimiter.setConfig({ ...patch.operatingLimit })
    }

    if (patch.adaptiveConfig !== undefined) {
      await this.#adaptiveDelayer.setConfig({ ...patch.adaptiveConfig })
    }
  }

  /**
   * A **copy**, nested blocks and code arrays included.
   *
   * A shallow spread handed the caller the very objects the sub-limiters use:
   * `RateLimiter` rewrites `drainRate` and `burstLimit` in place while it
   * throttles adaptively, so a caller reading the policy saw it change under
   * them, and a caller pushing onto the returned `hardErrorCodes` reconfigured
   * the manager without ever calling the setter. (#479)
   */
  getParams(): RestrictionParams {
    return cloneParams(this.#config)
  }

  /**
   * Delay function
   */
  async #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Public access to the delay function
   */
  async waiteDelay(ms: number): Promise<void> {
    return this.#delay(ms)
  }

  // region Log ////
  #logMethodBlocked(limiter: string, requestId: string, method: string, wait: number) {
    this.getLogger().notice(`${limiter} blocked method ${method}`, {
      requestId,
      method,
      wait,
      limiter
    }).catch(() => {})
  }

  #logMethodBlockedWithTimes(limiter: string, requestId: string, method: string, wait: number, times: number) {
    this.getLogger().notice(`${limiter} blocked method ${method} | ${times} times`, {
      requestId,
      method,
      times,
      wait,
      limiter
    }).catch(() => {})
  }

  #logError(limiter: string, requestId: string, code: string, message: string, method: string, wait: number) {
    this.getLogger().error(`${limiter} recognized the ${code} error for the ${method} method`, {
      requestId,
      method,
      wait,
      limiter,
      error: {
        code,
        message
      }
    }).catch(() => {})
  }

  #logSomeError(requestId: string, code: string, message: string, method: string, wait: number) {
    this.getLogger().error(`recognized the ${code} error for the ${method} method`, {
      requestId,
      method,
      wait,
      error: {
        code,
        message
      }
    }).catch(() => {})
  }

  #logNonRetryableClientError(requestId: string, code: string, message: string, method: string, status: number) {
    this.getLogger().error(`client error ${status} (${code}) for the ${method} method is not retryable`, {
      requestId,
      method,
      status,
      error: {
        code,
        message
      }
    }).catch(() => {})
  }
  // endregion ////
}
