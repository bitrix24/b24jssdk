import type { AuthData } from '../types/auth'
import type { LoggerInterface } from '../logger'

/**
 * Opt-in keep-alive for the frame access token (#532).
 *
 * The SDK's automatic refresh hangs off the request path: `_ensureAuth` before
 * a call and `_makeRequestWithAuthRetry` on a 401. An app that reads the token
 * with `auth.getAuthData()` and hands it to its OWN backend makes no `$b24`
 * calls at all, so neither path ever fires and the token quietly dies in an
 * idle tab — the app then looks broken although nothing changed.
 *
 * This module is the timer that closes that gap. It costs no REST: refreshing
 * the frame token is a `postMessage` to the parent window.
 */

/**
 * Refresh once less than this remains of the token's lifetime.
 *
 * @default 5 minutes
 */
export const FRAME_REFRESH_MARGIN_MS = 5 * 60_000

/**
 * Hard lower bound on the sleep between checks, and the default. Bitrix warns
 * that refreshing too often risks an application being auto-blocked, so this
 * one is a floor rather than a default: `minDelayMs` can only raise it. A
 * one-character slip (`minDelayMs: 30`, meaning seconds) would otherwise be a
 * thousand `postMessage` round-trips a second.
 *
 * @default 30 seconds
 */
export const FRAME_PULSE_MIN_MS = 30_000

/**
 * Upper bound on the sleep between checks. It keeps the pulse from sleeping
 * past a token whose lifetime shrank under it, at the cost of one wake-up per
 * 10 minutes in the worst case.
 *
 * @default 10 minutes
 */
export const FRAME_PULSE_MAX_MS = 10 * 60_000

/**
 * Tunables for {@link frameTokenDue} / {@link frameTokenDelayMs}. All three are
 * optional; each falls back to the constant of the same name.
 */
export type KeepAuthFreshParams = {
  /**
   * How long before expiry a refresh becomes due, in milliseconds.
   * @default 300000 (5 minutes)
   */
  marginMs?: number
  /**
   * Shortest sleep between checks, in milliseconds. Values below
   * {@link FRAME_PULSE_MIN_MS} are raised to it — this knob can only slow the
   * pulse down, never speed it past the safety floor.
   * @default 30000 (30 seconds)
   */
  minDelayMs?: number
  /**
   * Longest sleep between checks, in milliseconds.
   * @default 600000 (10 minutes)
   */
  maxDelayMs?: number
}

type ResolvedParams = Required<KeepAuthFreshParams>

/**
 * Normalises {@link KeepAuthFreshParams}, dropping values that cannot describe
 * a delay (non-finite, zero, negative) in favour of the defaults, and ordering
 * the bounds so `minDelayMs <= maxDelayMs` holds whatever the caller passed.
 */
export function resolveKeepAuthFreshParams(params?: KeepAuthFreshParams): ResolvedParams {
  const pick = (value: undefined | number, fallback: number): number => {
    return Number.isFinite(value) && (value as number) > 0
      ? (value as number)
      : fallback
  }

  const marginMs = pick(params?.marginMs, FRAME_REFRESH_MARGIN_MS)
  // The floor is not negotiable — see FRAME_PULSE_MIN_MS.
  const minDelayMs = Math.max(FRAME_PULSE_MIN_MS, pick(params?.minDelayMs, FRAME_PULSE_MIN_MS))
  const maxDelayMs = pick(params?.maxDelayMs, FRAME_PULSE_MAX_MS)

  return {
    marginMs,
    minDelayMs,
    // A caller that inverts the bounds gets the wider of the two as the
    // ceiling rather than a `Math.min(max, Math.max(min, …))` that silently
    // collapses to `min` for every input.
    maxDelayMs: Math.max(minDelayMs, maxDelayMs)
  }
}

/**
 * Is the token due for a refresh?
 *
 * An unreadable `expires` counts as due: the cost of one extra `postMessage`
 * is nothing next to the cost of missing the only chance to refresh.
 *
 * @param expiresSec expiry as a UNIX timestamp in **seconds** — the unit
 *   `AuthData.expires` uses.
 * @param nowMs current time in milliseconds (`Date.now()`).
 */
export function frameTokenDue(
  expiresSec: undefined | number,
  nowMs: number,
  params?: KeepAuthFreshParams
): boolean {
  if (!Number.isFinite(expiresSec) || (expiresSec as number) <= 0) {
    return true
  }

  const { marginMs } = resolveKeepAuthFreshParams(params)
  return (expiresSec as number) * 1_000 - nowMs <= marginMs
}

/**
 * How long to sleep before the next check, clamped to the configured bounds.
 *
 * Aimed at "expiry minus margin", so the pulse sleeps through the part of the
 * token's life where there is nothing to do rather than waking on a fixed tick.
 * The clamp still applies: with the defaults, anything further out than 15
 * minutes sleeps the 10-minute maximum.
 *
 * @param expiresSec expiry as a UNIX timestamp in **seconds**.
 * @param nowMs current time in milliseconds (`Date.now()`).
 */
export function frameTokenDelayMs(
  expiresSec: undefined | number,
  nowMs: number,
  params?: KeepAuthFreshParams
): number {
  const { marginMs, minDelayMs, maxDelayMs } = resolveKeepAuthFreshParams(params)

  if (!Number.isFinite(expiresSec) || (expiresSec as number) <= 0) {
    return minDelayMs
  }

  const untilRefresh = (expiresSec as number) * 1_000 - nowMs - marginMs
  return Math.min(maxDelayMs, Math.max(minDelayMs, untilRefresh))
}

/**
 * The slice of `AuthActions` the pulse needs. Structural on purpose: it keeps
 * this module independent of `AuthManager` and makes the driver testable with a
 * two-method stub.
 */
export type KeepAuthFreshActions = {
  getAuthData: () => false | AuthData
  refreshAuth: () => Promise<AuthData>
}

/**
 * The timer itself: wakes up, refreshes the token if it is due, and schedules
 * the next wake-up from the new expiry.
 *
 * Two properties matter more than the schedule:
 *
 * - **It never throws.** A refusal from the portal is a state, not an exception
 *   for the app: a failed tick is logged through the SDK logger (which is the
 *   null logger unless the app wired one, so production stays silent) and the
 *   pulse retries after the minimum delay.
 * - **It listens to `visibilitychange`.** A background tab's timers are
 *   throttled and a frozen tab's are not run at all, so a timer alone would
 *   come back to a dead token. Returning to the tab checks immediately.
 */
export class AuthKeepAlive {
  readonly #actions: KeepAuthFreshActions
  readonly #params: ResolvedParams
  readonly #getLogger: () => LoggerInterface

  #timer: null | ReturnType<typeof setTimeout> = null
  #isRunning: boolean = false
  // The run whose tick is currently in flight, or `null`. Run-scoped rather
  // than a plain flag: a tick left over from an earlier run must not block a
  // newer run's tick, or the pulse strands itself with nothing scheduled.
  #tickingRunId: null | number = null
  #onVisibilityChange: null | (() => void) = null

  // Identifies the current start()..stop() run. A tick or timer from an earlier
  // run must not schedule work for a later one, and a bare ticking flag cannot
  // tell them apart because `stop()` cannot cancel a refresh already in flight.
  #runId: number = 0
  // Consecutive ticks that did not end with a usable token. Drives the backoff.
  #failures: number = 0
  // When the next check is due. Everything that wants to check early — the
  // visibility handler above all — defers to this, so a tab switch cannot walk
  // past the backoff and turn a refusing parent back into a 30-second retry.
  #nextCheckAtMs: number = 0

  constructor(
    actions: KeepAuthFreshActions,
    getLogger: () => LoggerInterface,
    params?: KeepAuthFreshParams
  ) {
    this.#actions = actions
    this.#getLogger = getLogger
    this.#params = resolveKeepAuthFreshParams(params)
  }

  /**
   * Starts the pulse. Idempotent, and a no-op outside a browser (SSR): there is
   * no parent window to postMessage to, and no `document` to watch.
   */
  public start(): void {
    if (this.#isRunning || typeof window === 'undefined') {
      return
    }

    this.#isRunning = true
    this.#failures = 0

    // The run id is bumped by `stop()`, which is the only thing that needs to
    // invalidate one. Bumping here as well would be a second mechanism doing
    // the same job, and neither would be observable on its own.
    const runId = this.#runId

    if (typeof document !== 'undefined') {
      this.#onVisibilityChange = () => {
        if (document.visibilityState !== 'visible') {
          return
        }

        // Coming back to the tab is the one moment a throttled timer is
        // certainly stale: a frozen tab's timers do not run at all, so the
        // check that was due while we were away never happened. Re-arming from
        // the deadline handles both halves of that — if the deadline has
        // passed, check now; if it has not, the timer we would have replaced
        // was not late after all.
        //
        // Gating on the deadline rather than on the floor is what keeps a tab
        // switch from walking past the backoff: fifty alt-tabs against a
        // refusing parent must not become fifty messages.
        const currentRunId = this.#runId
        const waitMs = this.#nextCheckAtMs - Date.now()

        if (waitMs > 0) {
          this.#schedule(waitMs, currentRunId)
          return
        }

        void this.#tick(currentRunId)
      }
      document.addEventListener('visibilitychange', this.#onVisibilityChange)
    }

    if (this.#tickingRunId !== null) {
      // A tick from the previous run is still awaiting its refresh. It belongs
      // to a stale run and will not schedule anything, so this run arms its own
      // timer rather than waiting on it.
      this.#schedule(this.#params.minDelayMs, runId)
      return
    }

    void this.#tick(runId)
  }

  /**
   * Stops the pulse and detaches the listener. Idempotent; safe to call on a
   * pulse that never started.
   */
  public stop(): void {
    this.#isRunning = false
    // Invalidate the run so a refresh already in flight cannot re-arm the timer
    // when it settles — `stop()` cannot cancel it, only disown it.
    this.#runId += 1
    this.#clearTimer()

    if (this.#onVisibilityChange !== null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVisibilityChange)
    }

    this.#onVisibilityChange = null
  }

  /**
   * True while the pulse is scheduled. Exposed for tests and for an app that
   * wants to show the state.
   */
  public get isRunning(): boolean {
    return this.#isRunning
  }

  async #tick(runId: number): Promise<void> {
    // `#tickingRunId === runId` is the re-entrancy guard: one check at a time
    // within a run, so a visibility event cannot send a second refresh on top
    // of one already in flight. A tick from an OLDER run is not a reason to
    // skip this one — it has been disowned and will schedule nothing.
    //
    // There is deliberately no `#runId !== runId` check here. `#schedule` is
    // the gate that disowns a stale run, and it is the only way a tick is ever
    // armed: every caller passes the run id it read a statement earlier, and
    // `stop()` clears the pending timer. A check here would be unreachable, and
    // an unreachable guard is a claim no test can keep honest.
    if (!this.#isRunning || this.#tickingRunId === runId) {
      return
    }

    this.#tickingRunId = runId

    let delay = this.#params.minDelayMs

    try {
      const authData = this.#actions.getAuthData()
      // `getAuthData()` returns `false` once the token has already expired —
      // that is `due` too, and the reason the pulse exists is to get ahead of it.
      const expires = authData === false ? undefined : authData.expires

      if (!frameTokenDue(expires, Date.now(), this.#params)) {
        this.#failures = 0
        delay = frameTokenDelayMs(expires, Date.now(), this.#params)
      } else {
        const refreshed = await this.#actions.refreshAuth()
        // Not `refreshed?.expires`: optional chaining does not short-circuit on
        // `false`, and a frame refresh can resolve falsy.
        const freshExpires = refreshed ? refreshed.expires : undefined

        if (frameTokenDue(freshExpires, Date.now(), this.#params)) {
          // The refresh succeeded and bought no headroom: the token's whole
          // life is shorter than the margin, or the portal answered with an
          // expiry we cannot use. Ticking again at the floor would mean a
          // `postMessage` every 30 seconds for as long as the tab is open —
          // the auto-block pattern. Back off instead.
          this.#failures += 1
          delay = this.#backoffDelayMs()
        } else {
          this.#failures = 0
          delay = frameTokenDelayMs(freshExpires, Date.now(), this.#params)
        }
      }
    } catch (error) {
      // Never surface to the app. The logger is the null logger by default, so
      // this is silent in production unless the app wired a sink itself.
      //
      // Only `error.message` — never the error object or the payload, which on
      // this path carries the tokens. (#43)
      this.#failures += 1
      delay = this.#backoffDelayMs()

      try {
        this.#getLogger().warning('keepAuthFresh: refresh failed, will retry', {
          error: error instanceof Error ? error.message : String(error),
          failures: this.#failures,
          retryInMs: delay
        }).catch(() => {})
      } catch {
        // A logger that throws on the way in is still not the app's problem.
      }
    } finally {
      if (this.#tickingRunId === runId) {
        this.#tickingRunId = null
      }

      this.#schedule(delay, runId)
    }
  }

  /**
   * Exponential backoff over consecutive failed (or useless) refreshes, from
   * the floor up to the ceiling: 30s, 1m, 2m, 4m, 8m, then 10m forever.
   *
   * A parent window that is navigated away, blocked or refusing is the case
   * `REFRESH_AUTH_TIMEOUT` exists for, and each attempt costs a message plus a
   * 10-second reject timer. Retrying it at a flat 30 seconds for the life of
   * the tab is the behaviour this exists to prevent.
   */
  #backoffDelayMs(): number {
    // Capped before the shift so a long-lived tab cannot overflow the exponent.
    const steps = Math.min(Math.max(this.#failures - 1, 0), 10)
    return Math.min(this.#params.maxDelayMs, this.#params.minDelayMs * 2 ** steps)
  }

  #schedule(delayMs: number, runId: number): void {
    if (!this.#isRunning || this.#runId !== runId) {
      return
    }

    this.#clearTimer()
    this.#nextCheckAtMs = Date.now() + delayMs
    this.#timer = setTimeout(() => {
      this.#timer = null
      void this.#tick(runId)
    }, delayMs)

    // Node keeps the process alive for a pending timer; a keep-alive must not.
    // Browsers have no `unref`, hence the guard.
    const timer = this.#timer as unknown as { unref?: () => void }
    if (typeof timer?.unref === 'function') {
      timer.unref()
    }
  }

  #clearTimer(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
  }
}
