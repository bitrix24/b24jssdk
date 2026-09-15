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
 * Enforces the Bitrix24 per-method operating-time budget.
 *
 * Bitrix24 charges each REST call against a rolling 10-minute CPU-time
 * quota (`operating` field in the response). This limiter tracks that
 * quota per method and blocks further calls (via {@link ILimiter.canProceed})
 * until the reset timestamp has passed, preventing the `OPERATION_TIME_LIMIT`
 * refusal (HTTP 429) that heavy requests earn by exhausting that budget.
 * `QUERY_LIMIT_EXCEEDED` is a different limit — requests per second — and
 * belongs to {@link RateLimiter}.
 *
 * **It is inert on a default self-hosted portal, and that is the correct
 * behaviour, not a gap.** Such a portal sends no counters, because its own
 * `LoadLimiter` is switched off — and the same switch gates enforcement, so it
 * is not refusing calls either. There is no budget to track. `RateLimiter` and
 * `AdaptiveDelayer` are unaffected.
 *
 * @see https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/limiters/#enabling-the-operating-limiter-on-a-self-hosted-portal
 *   for how a box owner switches the portal's limiter on, including the
 *   half-configured state in which the counters arrive but never accumulate.
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
   *
   * `_requestId` and `_params` went unused when the batch budget started being
   * read under its own `batch` key: the special case that recursed per
   * sub-command was what needed them. They stay in the signature because
   * `RestrictionManager.getTimeToFree` and the public `Http.getTimeToFree`
   * forward all four arguments through.
   */
  async getTimeToFree(
    _requestId: string,
    method: string,
    _params?: any,
    _error?: any
  ): Promise<number> {
    this.#cleanupOldStats()

    // `batch` is read here like any other method, and that is the point.
    //
    // The portal keys its operating budget on the triple (auth type, credential,
    // method) and charges a batch to the method `batch` — measured on a live
    // portal, where `batch` stood at 1.228 while `tasks.task.list` read 0 at the
    // same moment, on both API versions. So the budget a batch spends against is
    // the one stored under `batch`, which `_createAjaxResultFromResponse` already
    // records from the envelope.
    //
    // This used to route to a helper that took the largest wait across synthetic
    // `batch::<method>` entries instead. Those modelled a per-sub-method batch budget the portal
    // does not keep, and on v2 they were fed each sub-result's `time` — which
    // carries the batch-wide running sum, identical across all fifty rows, not
    // that command's own cost. The real `batch` entry was written on every call
    // and never read. (#459)
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
   * Updates operating time statistics for the method.
   *
   * `data` is optional because **a successful response without a `time` block at
   * all is normal**: `rest.documentation.openapi` answers with the OpenAPI
   * document at the top level — no `result` envelope and no `time` — on every
   * portal tried (an on-premise build, a cloud portal and a cloud sandbox).
   * Destructuring the absent block threw `Cannot destructure property
   * 'operating' of 'data' as it is undefined` and turned a fine HTTP 200 into an
   * exception. Same shape as #338, one level over: there the missing key was
   * `result`, here it is `time`.
   *
   * A `time` block that arrives *without* the counters is a second, separate
   * case and was never the crash — the `operating === undefined` check below has
   * always caught it. It is the normal self-hosted state, because the portal's
   * own limiter is off by default there (the `rest` module's
   * `load_limiter_active` option, default `N`, which nothing in the product ever
   * sets), so the counters are missing from every response on such a portal —
   * which is also a portal that is not enforcing anything.
   *
   * No counters are synthesised when the block is absent. A fabricated
   * `operating: 0` is indistinguishable from a real "nothing consumed yet" and
   * would make the limiter confidently wrong — on-premise that exact value is
   * what an enabled-but-unconfigured limiter reports.
   */
  async updateStats(requestId: string, method: string, data?: PayloadTime): Promise<void> {
    if (!data) {
      return
    }

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
    // Held apart from `operating` deliberately. The two counters travel together
    // on every portal seen, but the type no longer promises that, and the old
    // unconditional `operating_reset_at * 1000` would have written `NaN` into
    // the stats if one ever arrived without the other — and `NaN` compares false
    // against every threshold, so the limiter would have stopped waiting rather
    // than failed visibly. Keeping the previous reset point is the safe reading.
    if (operating_reset_at !== undefined) {
      stats.operating_reset_at = operating_reset_at * 1000
    }
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
    this.getLogger().debug(`${this.getTitle()} detected limit for method ${method}`, {
      requestId,
      method,
      operating: {
        percent: Number.parseFloat(percent.toFixed(2)),
        current: Number.parseFloat((operating / 1000).toFixed(0)),
        max: Number.parseFloat((this.#config.limitMs / 1000).toFixed(0))
      }
    }).catch(() => {})
  }
  // endregion ////
}
