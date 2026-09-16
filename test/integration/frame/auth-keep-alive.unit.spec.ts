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

  let visibilityState: DocumentVisibilityState = 'visible'
  const listeners = new Map<string, Set<() => void>>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    listeners.clear()
    visibilityState = 'visible'

    // A minimal browser: the pulse is a no-op without `window`, and reads
    // `document.visibilityState` plus add/removeEventListener.
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibilityState
      },
      addEventListener(type: string, handler: () => void) {
        if (!listeners.has(type)) {
          listeners.set(type, new Set())
        }
        listeners.get(type)!.add(handler)
      },
      removeEventListener(type: string, handler: () => void) {
        listeners.get(type)?.delete(handler)
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

  it('refreshes ahead of expiry, not after it', async () => {
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

    // Sleeps to "expiry minus margin" and refreshes when it gets there — while
    // the token is still valid, which is the whole point.
    await vi.advanceTimersByTimeAsync(60 * 60_000 - FRAME_REFRESH_MARGIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

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

  it('checks immediately when the tab becomes visible again', async () => {
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

    fireVisibilityChange('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(2)

    pulse.stop()
  })

  it('never throws when the refresh fails, and retries after the minimum delay', async () => {
    const refreshAuth = vi.fn(async () => {
      throw new Error('portal said no')
    })
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    // No unhandled rejection, no throw out of `start()`.
    expect(() => pulse.start()).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(2)

    pulse.stop()
  })

  it('never throws when `getAuthData()` itself throws', async () => {
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      {
        getAuthData: () => {
          throw new Error('boom')
        },
        refreshAuth
      },
      logger
    )

    expect(() => pulse.start()).not.toThrow()
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS)
    expect(pulse.isRunning).toBe(true)

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

    pulse.stop()
    expect(pulse.isRunning).toBe(false)
    expect(listeners.get('visibilitychange')?.size ?? 0).toBe(0)

    await vi.advanceTimersByTimeAsync(10 * FRAME_PULSE_MIN_MS)
    expect(refreshAuth).toHaveBeenCalledTimes(1)

    // Idempotent, and safe on a pulse that never started.
    expect(() => pulse.stop()).not.toThrow()
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

    pulse.stop()
  })

  it('is a no-op outside a browser (SSR) — no timer, no listener', async () => {
    vi.stubGlobal('window', undefined)
    const refreshAuth = vi.fn(async () => authData(sec(60 * 60_000)))
    const pulse = new AuthKeepAlive(
      { getAuthData: () => false, refreshAuth },
      logger
    )

    pulse.start()
    await vi.advanceTimersByTimeAsync(10 * FRAME_PULSE_MIN_MS)
    expect(refreshAuth).not.toHaveBeenCalled()
    expect(pulse.isRunning).toBe(false)
  })
})
