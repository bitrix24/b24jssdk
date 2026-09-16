/**
 * #532 — the opt-in frame token keep-alive.
 *
 * The SDK refreshes the frame token on the request path only. An app that reads
 * the token with `auth.getAuthData()` and hands it to its own backend makes no
 * `$b24` calls, so the token dies in an idle tab. These specs pin the rules the
 * keep-alive uses and the three properties the issue asked for: it refreshes
 * ahead of expiry, it re-checks on `visibilitychange`, and it never throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  frameTokenDue,
  frameTokenDelayMs,
  resolveKeepAuthFreshParams,
  AuthKeepAlive,
  FRAME_REFRESH_MARGIN_MS,
  FRAME_PULSE_MIN_MS,
  FRAME_PULSE_MAX_MS
} from '../../../packages/jssdk/src/frame/auth-keep-alive'
import { LoggerFactory } from '../../../packages/jssdk/src/logger'
import type { LoggerInterface } from '../../../packages/jssdk/src/logger'
import type { AuthData } from '../../../packages/jssdk/src/types/auth'

const NOW = 1_800_000_000_000 // fixed `Date.now()` in ms
const sec = (msFromNow: number): number => (NOW + msFromNow) / 1_000

function authData(expiresSec: undefined | number): AuthData {
  return {
    access_token: 'ACCESS',
    refresh_token: 'REFRESH',
    expires: expiresSec,
    expires_in: 3600,
    domain: 'https://portal.bitrix24.com',
    member_id: 'MEMBER'
  } as unknown as AuthData
}

describe('#532 frameTokenDue', () => {
  it.each([
    ['an hour left', sec(60 * 60_000), false],
    ['exactly at the margin', sec(FRAME_REFRESH_MARGIN_MS), true],
    ['inside the margin', sec(FRAME_REFRESH_MARGIN_MS - 1), true],
    ['just outside the margin', sec(FRAME_REFRESH_MARGIN_MS + 1), false],
    ['already expired', sec(-60_000), true]
  ])('%s -> %s', (_label, expiresSec, expected) => {
    expect(frameTokenDue(expiresSec as number, NOW)).toBe(expected)
  })

  it.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['zero', 0],
    ['negative', -1]
  ])('treats an unreadable expiry (%s) as due', (_label, expiresSec) => {
    // Asymmetric cost: one extra postMessage against missing the only chance
    // to refresh.
    expect(frameTokenDue(expiresSec as undefined | number, NOW)).toBe(true)
  })

  it('honours a custom margin', () => {
    const expires = sec(10 * 60_000)
    expect(frameTokenDue(expires, NOW)).toBe(false)
    expect(frameTokenDue(expires, NOW, { marginMs: 15 * 60_000 })).toBe(true)
  })
})

describe('#532 frameTokenDelayMs', () => {
  it('aims at expiry minus the margin once that lands inside the bounds', () => {
    // 12 minutes left, 5 minutes of margin -> 7 minutes, which is between the
    // 30s floor and the 10min ceiling and so survives the clamp.
    expect(frameTokenDelayMs(sec(12 * 60_000), NOW)).toBe(7 * 60_000)
  })

  it('clamps to the maximum, so a long token is re-checked every 10 minutes', () => {
    // The ceiling wins well before "expiry minus margin" does: an hour-long
    // token is polled, cheaply, rather than slept through in one go.
    expect(frameTokenDelayMs(sec(60 * 60_000), NOW)).toBe(FRAME_PULSE_MAX_MS)
    expect(frameTokenDelayMs(sec(24 * 60 * 60_000), NOW)).toBe(FRAME_PULSE_MAX_MS)
  })

  it.each([
    ['inside the margin', sec(60_000)],
    ['already expired', sec(-60_000)],
    ['unreadable', undefined]
  ])('clamps to the minimum (%s) — the floor is what keeps the pulse off a tight loop', (_label, expiresSec) => {
    expect(frameTokenDelayMs(expiresSec as undefined | number, NOW)).toBe(FRAME_PULSE_MIN_MS)
  })

  it('honours custom bounds', () => {
    expect(frameTokenDelayMs(sec(60 * 60_000), NOW, { maxDelayMs: 120_000 })).toBe(120_000)
    expect(frameTokenDelayMs(sec(8 * 60_000), NOW, { marginMs: 60_000 })).toBe(7 * 60_000)
  })
})

describe('#532 resolveKeepAuthFreshParams', () => {
  it('falls back to the defaults for values that cannot describe a delay', () => {
    expect(resolveKeepAuthFreshParams({ marginMs: 0, minDelayMs: -1, maxDelayMs: Number.NaN }))
      .toEqual({
        marginMs: FRAME_REFRESH_MARGIN_MS,
        minDelayMs: FRAME_PULSE_MIN_MS,
        maxDelayMs: FRAME_PULSE_MAX_MS
      })
  })

  it('orders inverted bounds instead of collapsing every delay to the minimum', () => {
    const { minDelayMs, maxDelayMs } = resolveKeepAuthFreshParams({ minDelayMs: 60_000, maxDelayMs: 10_000 })
    expect(minDelayMs).toBe(60_000)
    expect(maxDelayMs).toBe(60_000)
  })
})

describe('#532 AuthKeepAlive', () => {
  const logger = () => LoggerFactory.createNullLogger()

  /** A null logger with a spy on `warning`, so "it never throws" is assertable. */
  function spyLogger() {
    const warning = vi.fn(async () => {})
    const getLogger = () => ({
      ...LoggerFactory.createNullLogger(),
      warning
    }) as unknown as LoggerInterface
    return { getLogger, warning }
  }

  let visibilityState: DocumentVisibilityState = 'visible'
  const listeners = new Map<string, Set<() => void>>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    listeners.clear()
    visibilityState = 'visible'

    // A minimal browser. `window` gets the same listener registry as
    // `document` so that a future listener moved onto it (focus, pageshow,
    // online) is still observable here rather than silently unregistered.
    const registry = {
      addEventListener(type: string, handler: () => void) {
        if (!listeners.has(type)) {
          listeners.set(type, new Set())
        }
        listeners.get(type)!.add(handler)
      },
      removeEventListener(type: string, handler: () => void) {
        listeners.get(type)?.delete(handler)
      }
    }

    vi.stubGlobal('window', { ...registry })
    vi.stubGlobal('document', {
      ...registry,
      get visibilityState() {
        return visibilityState
      },
      // Real documents carry both; keeping them in step means code that reads
      // `hidden` cannot pass here by reading `undefined` as "visible".
      get hidden() {
        return visibilityState === 'hidden'
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function fireVisibilityChange(state: DocumentVisibilityState): void {
    visibilityState = state
    for (const handler of listeners.get('visibilitychange') ?? []) {
      handler()
    }
  }

  it('refreshes ahead of expiry, at the computed moment and not one tick earlier', async () => {
    let expires = sec(60 * 60_000)
    const refreshAuth = vi.fn(async () => {
      expires = (Date.now() + 60 * 60_000) / 1_000
      return authData(expires)
    })
    const pulse = new AuthKeepAlive(
      { getAuthData: () => authData(expires), refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    // An hour of headroom: nothing to do yet.
    expect(refreshAuth).not.toHaveBeenCalled()

    // The `not.toHaveBeenCalled()` one millisecond short is the assertion that
    // matters: without it a pulse that ignored `frameTokenDelayMs` and simply
    // woke every 30 seconds would satisfy this test just as well.
    await vi.advanceTimersByTimeAsync(60 * 60_000 - FRAME_REFRESH_MARGIN_MS - 1)
    expect(refreshAuth).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // And it refreshed while the token was still valid — the whole point.
    expect(expires * 1_000).toBeGreaterThan(Date.now())

    pulse.stop()
  })

  it('refreshes when `getAuthData()` already returns false', async () => {
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    pulse.stop()
  })

  it('checks immediately on return when the due time passed while the tab was frozen', async () => {
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // A hidden tab's timers are throttled or frozen; coming back is the moment
    // the schedule is certainly stale.
    fireVisibilityChange('hidden')
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // A frozen tab: wall-clock time passes but its timers do NOT run. Moving
    // the system clock without advancing timers is exactly that, and it is the
    // case the visibility listener exists for — a plain timer would come back
    // to a dead token.
    vi.setSystemTime(Date.now() + FRAME_PULSE_MAX_MS * 2)
    const before = refreshAuth.mock.calls.length

    fireVisibilityChange('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(before + 1)

    pulse.stop()
  })

  it('does not check ahead of the due time just because the tab came back', async () => {
    // The mirror image of the test above, and the reason the gate is on the
    // due time rather than on the floor: alt-tabbing against a refusing parent
    // must not walk past the backoff and restore a 30-second retry.
    const refreshAuth = vi.fn(async () => {
      throw new Error('parent is refusing')
    })
    const pulse = new AuthKeepAlive({ getAuthData: () => false, refreshAuth }, logger)

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(refreshAuth).toHaveBeenCalledTimes(4)

    // Backoff now stands at 4 minutes. Switch tabs every 31 seconds for the
    // whole of it: not one extra message.
    for (let elapsed = 0; elapsed < 240_000 - 31_000; elapsed += 31_000) {
      fireVisibilityChange('hidden')
      fireVisibilityChange('visible')
      await vi.advanceTimersByTimeAsync(31_000)
    }
    expect(refreshAuth).toHaveBeenCalledTimes(4)

    pulse.stop()
  })

  it('does not check more often than the floor, however often the tab is switched', async () => {
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // Fifty alt-tabs with no time passing must not be fifty messages to the
    // parent window — the event is a reason to re-check, not a licence.
    for (let i = 0; i < 50; i += 1) {
      fireVisibilityChange('hidden')
      fireVisibilityChange('visible')
    }
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)
    // …and the deferred check is still armed, exactly once.
    expect(vi.getTimerCount()).toBe(1)

    pulse.stop()
  })

  it('does not start a second refresh while one is still in flight', async () => {
    let release: () => void = () => {}
    const refreshAuth = vi.fn(() => new Promise<AuthData>((resolve) => {
      release = () => resolve(authData(sec(60 * 60_000)))
    }))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // Let the floor elapse, so the visibility gate is NOT what holds the
    // second check back — the in-flight guard has to be.
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)

    // The refresh still has not settled. Coming back to the tab now must not
    // send a second one — that is the "refreshing too often" case directly.
    fireVisibilityChange('hidden')
    fireVisibilityChange('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    pulse.stop()
  })

  it('swallows a failed refresh into the logger and keeps running', async () => {
    // `expect(() => start()).not.toThrow()` cannot fail here — `start()` voids
    // the tick and returns synchronously — so assert the actual property: the
    // failure reached the logger, and the pulse survived it.
    const { getLogger, warning } = spyLogger()
    const refreshAuth = vi.fn(async () => {
      throw new Error('portal said no')
    })
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      getLogger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(refreshAuth).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith(
      'keepAuthFresh: refresh failed, will retry',
      expect.objectContaining({ error: 'portal said no' })
    )
    expect(pulse.isRunning).toBe(true)

    // Retries after the floor, then backs off — see the backoff spec below.
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(2)

    pulse.stop()
  })

  it('survives a logger whose own `warning()` rejects', async () => {
    const getLogger = () => ({
      ...LoggerFactory.createNullLogger(),
      warning: async () => {
        throw new Error('sink is down')
      }
    }) as unknown as LoggerInterface
    const refreshAuth = vi.fn(async () => {
      throw new Error('portal said no')
    })
    const pulse = new AuthKeepAlive({ getAuthData: () => false, refreshAuth }, getLogger)

    pulse.start()
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)

    expect(pulse.isRunning).toBe(true)
    expect(refreshAuth).toHaveBeenCalledTimes(2)

    pulse.stop()
  })

  it('never throws when `getAuthData()` itself throws', async () => {
    const { getLogger, warning } = spyLogger()
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      {
        getAuthData: () => {
          throw new Error('boom')
        },
        refreshAuth
      },
      getLogger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(warning).toHaveBeenCalledWith(
      'keepAuthFresh: refresh failed, will retry',
      expect.objectContaining({ error: 'boom' })
    )
    expect(refreshAuth).not.toHaveBeenCalled()
    expect(pulse.isRunning).toBe(true)

    pulse.stop()
  })

  it('backs off exponentially while refreshes keep failing, up to the ceiling', async () => {
    const refreshAuth = vi.fn(async () => {
      throw new Error('parent window is gone')
    })
    const pulse = new AuthKeepAlive({ getAuthData: () => false, refreshAuth }, logger)

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // 30s, 1m, 2m, 4m, 8m, then the 10m ceiling. A flat retry at the floor
    // would be 20 messages in the first 10 minutes to a parent that is
    // navigated away or refusing — the auto-block pattern.
    for (const [index, delay] of [30_000, 60_000, 120_000, 240_000, 480_000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(refreshAuth).toHaveBeenCalledTimes(index + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(refreshAuth).toHaveBeenCalledTimes(index + 2)
    }

    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MAX_MS - 1)
    expect(refreshAuth).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(1)
    expect(refreshAuth).toHaveBeenCalledTimes(7)

    pulse.stop()
  })

  it('backs off when a refresh succeeds but buys no headroom', async () => {
    // A token whose whole life is shorter than the margin is `due` again the
    // instant it is refreshed. Without the backoff this is one postMessage
    // every 30s for as long as the tab is open.
    const refreshAuth = vi.fn(async () => authData(sec(60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => authData(sec(60_000)), refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(2)

    // Third attempt is a minute out, not another 30 seconds.
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(3)

    // Ten minutes in, a flat floor would have sent 20. Bounded well below that.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(refreshAuth.mock.calls.length).toBeLessThan(8)

    pulse.stop()
  })

  it('resets the backoff once a refresh works again', async () => {
    let healthy = false
    const refreshAuth = vi.fn(async () => {
      if (!healthy) {
        throw new Error('not yet')
      }
      return authData(sec(60 * 60_000))
    })
    // The app's own token holder is separate from the pulse's stub, so
    // `getAuthData()` stays `false`: every tick is due, and only the outcome of
    // the refresh changes when the parent window comes back.
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(refreshAuth).toHaveBeenCalledTimes(3)

    // The parent answers again: the fourth attempt is the 3rd backoff step
    // (2 minutes) out, and it succeeds.
    healthy = true
    await vi.advanceTimersByTimeAsync(120_000)
    expect(refreshAuth).toHaveBeenCalledTimes(4)

    // Back on the normal schedule — the ceiling, not a backoff step.
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MAX_MS - 1)
    expect(refreshAuth).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(refreshAuth).toHaveBeenCalledTimes(5)

    // The reset is only observable on the NEXT failure: every success path
    // recomputes the delay from the token's expiry, which hides a stale
    // failure count. So fail again and check the retry lands at the floor
    // rather than at the 4-minute step the old count would have produced.
    healthy = false
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MAX_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(6)

    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS - 1)
    expect(refreshAuth).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(1)
    expect(refreshAuth).toHaveBeenCalledTimes(7)

    pulse.stop()
  })

  it('a healthy tick between failures resets the backoff too', async () => {
    // The not-due branch has its own reset, and it is invisible unless a
    // failure follows a tick that had nothing to do.
    let due = true
    let failing = true
    const refreshAuth = vi.fn(async () => {
      if (failing) {
        throw new Error('not yet')
      }
      return authData(sec(60 * 60_000))
    })
    const pulse = new AuthKeepAlive(
      { getAuthData: () => (due ? false : authData(sec(12 * 60_000))), refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(refreshAuth).toHaveBeenCalledTimes(3)

    // A tick with plenty of headroom: no refresh, and the failure count clears.
    due = false
    await vi.advanceTimersByTimeAsync(120_000)
    expect(refreshAuth).toHaveBeenCalledTimes(3)

    // Next failure starts from the floor again, not from the 4-minute step the
    // pre-reset count would have produced. Measure the gap between the two
    // attempts rather than guessing where on the timeline they land.
    due = true
    failing = true

    const attempts: number[] = []
    refreshAuth.mockImplementation(async () => {
      attempts.push(Date.now())
      throw new Error('failing again')
    })

    await vi.advanceTimersByTimeAsync(30 * 60_000)
    expect(attempts.length).toBeGreaterThanOrEqual(2)
    expect(attempts[1]! - attempts[0]!).toBe(FRAME_PULSE_MIN_MS)

    pulse.stop()
  })

  it('a restarted pulse keeps ticking even if the old tick outlives the new timer', async () => {
    // The stall this guards: if the ticking flag were not run-scoped, the new
    // run's first timer would hit it, return without scheduling, and the old
    // run's tick would then be turned away by the run check — leaving
    // `isRunning === true` with no timer at all, forever.
    let release: () => void = () => {}
    const refreshAuth = vi.fn(() => new Promise<AuthData>((resolve) => {
      release = () => resolve(authData(sec(60 * 60_000)))
    }))
    const pulse = new AuthKeepAlive({ getAuthData: () => false, refreshAuth }, logger)

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    pulse.stop()
    pulse.start()

    // The new run's timer fires while the abandoned refresh is STILL pending.
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(2)

    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(pulse.isRunning).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    pulse.stop()
  })

  it('a tick from a stopped run cannot reschedule the run that replaced it', async () => {
    // The stale tick computes its delay from the run it belonged to. If it
    // were allowed to schedule, it would silently replace the new run's timer
    // with its own — the new run would look alive and tick on the old
    // schedule. Nothing about the timer count shows that, so the assertion has
    // to be on WHEN the next check happens.
    const resolvers: ((value: AuthData) => void)[] = []
    const refreshAuth = vi.fn(() => new Promise<AuthData>((resolve) => {
      resolvers.push(resolve)
    }))
    const pulse = new AuthKeepAlive({ getAuthData: () => false, refreshAuth }, logger)

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    pulse.stop()
    pulse.start()

    // The abandoned refresh lands with an hour-long token, so its delay would
    // be the 10-minute ceiling — far past the new run's 30-second timer.
    resolvers[0]!(authData(sec(60 * 60_000)))
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(2)

    pulse.stop()
  })

  it('start() clears the backoff from the previous run', async () => {
    const refreshAuth = vi.fn(async () => {
      throw new Error('parent is gone')
    })
    const pulse = new AuthKeepAlive({ getAuthData: () => false, refreshAuth }, logger)

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(refreshAuth).toHaveBeenCalledTimes(3)

    // A fresh run is a fresh start: the next retry is at the floor, not at the
    // 4-minute step the abandoned run had reached.
    pulse.stop()
    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(4)

    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS - 1)
    expect(refreshAuth).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(refreshAuth).toHaveBeenCalledTimes(5)

    pulse.stop()
  })

  it('stop() ends the pulse and detaches the listener', async () => {
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    expect(vi.getTimerCount()).toBe(1)

    pulse.stop()
    expect(pulse.isRunning).toBe(false)
    expect(listeners.get('visibilitychange')?.size ?? 0).toBe(0)
    // On the timer itself, not on the mock: an orphaned timer still fires and
    // is then turned away by the `isRunning` guard, so counting refreshes alone
    // cannot see the leak.
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(10 * FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // Idempotent, and safe on a pulse that never started.
    expect(() => pulse.stop()).not.toThrow()
  })

  it('a tick settling after stop() does not re-arm the timer', async () => {
    let release: () => void = () => {}
    const refreshAuth = vi.fn(() => new Promise<AuthData>((resolve) => {
      release = () => resolve(authData(sec(60 * 60_000)))
    }))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // `stop()` cannot cancel a refresh already in flight — it can only make
    // sure the tick's `finally` does not schedule anything when it lands.
    pulse.stop()
    release()
    await vi.advanceTimersByTimeAsync(0)

    // The settling tick is turned away by the run check, so it neither
    // re-arms the timer nor runs another check of its own.
    expect(vi.getTimerCount()).toBe(0)
    expect(pulse.isRunning).toBe(false)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10 * FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(1)
  })

  it('restarting while an old tick is in flight still schedules the new run', async () => {
    let release: () => void = () => {}
    const refreshAuth = vi.fn(() => new Promise<AuthData>((resolve) => {
      release = () => resolve(authData(sec(60 * 60_000)))
    }))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    pulse.stop()
    pulse.start()

    // The abandoned tick must not leave the new run without a timer.
    expect(vi.getTimerCount()).toBe(1)

    // Releasing the abandoned refresh must not add a second timer beside the
    // new run's — the old run has to be disowned, not merely outlived.
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(2)
    expect(pulse.isRunning).toBe(true)

    // And the two runs do not both keep ticking: over a full ceiling the count
    // advances at one schedule's pace, not two.
    const after = refreshAuth.mock.calls.length
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS * 4)
    expect(refreshAuth.mock.calls.length - after).toBeLessThanOrEqual(4)

    pulse.stop()
  })

  it('start() is idempotent — a second call does not run a second timer', async () => {
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    pulse.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)
    expect(listeners.get('visibilitychange')?.size ?? 0).toBe(1)
    expect(vi.getTimerCount()).toBe(1)

    pulse.stop()
  })

  it('leaves exactly one timer armed after a visibility round-trip', async () => {
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => authData(sec(60 * 60_000)), refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(vi.getTimerCount()).toBe(1)

    fireVisibilityChange('hidden')
    fireVisibilityChange('visible')
    await vi.advanceTimersByTimeAsync(0)

    // The stale timer is dropped rather than left running beside the new one.
    expect(vi.getTimerCount()).toBe(1)

    pulse.stop()
  })

  it('is a no-op outside a browser (SSR) — no timer, no listener', async () => {
    // Real SSR has neither global. Leaving `document` stubbed would never
    // exercise the `typeof document !== 'undefined'` branches with it absent.
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(10 * FRAME_PULSE_MIN_MS)
    expect(refreshAuth).not.toHaveBeenCalled()
    expect(pulse.isRunning).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    // `stop()` must be safe with no `document` to detach from.
    expect(() => pulse.stop()).not.toThrow()
  })
})
