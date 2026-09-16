/**
 * #532 — the `keepAuthFresh` option is wired to something.
 *
 * `AuthKeepAlive` has its own specs, but the option on `B24Frame` is the only
 * path a real app reaches the feature through, and it is three one-liners that
 * can rot silently: start it in `init()`, stop it in `destroy()`, forward the
 * caller's params. Mutation-checked — removing any of the three fails a test
 * here and nothing else in the suite.
 *
 * `MessageManager` is mocked: the postMessage handshake with the parent window
 * is not reachable in CI, and the point here is the wiring, not the transport.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const refreshSends: number[] = []

vi.mock('../../../packages/jssdk/src/frame/message', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../packages/jssdk/src/frame/message')>()

  return {
    ...actual,
    MessageManager: class {
      subscribe(): void {}
      unsubscribe(): void {}
      setLogger(): void {}

      async send(command: string, _params: unknown): Promise<unknown> {
        if (command === actual.MessageCommands.refreshAuth) {
          refreshSends.push(Date.now())
          return { AUTH_ID: 'ACCESS', REFRESH_ID: 'REFRESH', AUTH_EXPIRES: '3600' }
        }

        // getInitData
        return {
          AUTH_ID: 'ACCESS',
          REFRESH_ID: 'REFRESH',
          AUTH_EXPIRES: '3600',
          MEMBER_ID: 'MEMBER',
          IS_ADMIN: true,
          LANG: 'en',
          PLACEMENT: 'DEFAULT',
          PLACEMENT_OPTIONS: '{}',
          INSTALL: false,
          FIRST_RUN: false,
          APP_OPTIONS: {},
          USER_OPTIONS: {}
        }
      }
    }
  }
})

const { B24Frame } = await import('../../../packages/jssdk/src/frame/b24')
const { FRAME_PULSE_MIN_MS, FRAME_PULSE_MAX_MS, FRAME_REFRESH_MARGIN_MS } = await import('../../../packages/jssdk/src/frame/auth-keep-alive')

const QUERY_PARAMS = {
  DOMAIN: 'acme.bitrix24.com',
  PROTOCOL: true,
  APP_SID: 'APPSID123',
  LANG: null
}

describe('#532 keepAuthFresh wiring on B24Frame', () => {
  beforeEach(() => {
    refreshSends.length = 0
    vi.useFakeTimers()
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener() {},
      removeEventListener() {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('arms nothing when the option is absent — the feature is opt-in', async () => {
    const b24 = new B24Frame(QUERY_PARAMS)
    await b24.init()

    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(2 * FRAME_PULSE_MAX_MS)
    expect(refreshSends).toHaveLength(0)

    b24.destroy()
  })

  it('arms nothing for `keepAuthFresh: false`', async () => {
    const b24 = new B24Frame(QUERY_PARAMS, { keepAuthFresh: false })
    await b24.init()

    expect(vi.getTimerCount()).toBe(0)

    b24.destroy()
  })

  it('starts the pulse on init() for `keepAuthFresh: true`, on the default schedule', async () => {
    const b24 = new B24Frame(QUERY_PARAMS, { keepAuthFresh: true })
    await b24.init()
    await vi.advanceTimersByTimeAsync(0)

    // An hour-long token: nothing due yet, but the pulse is armed and
    // re-checking at the 10-minute ceiling.
    expect(refreshSends).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(1)

    // The token is refreshed at "expiry minus margin" — 55 minutes in, not
    // before, and without the app making a single REST call.
    await vi.advanceTimersByTimeAsync(60 * 60_000 - FRAME_REFRESH_MARGIN_MS - 1)
    expect(refreshSends).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(refreshSends).toHaveLength(1)

    b24.destroy()
  })

  it('forwards the caller params instead of the defaults', async () => {
    // A margin longer than the token's life makes every check due, so the
    // first tick refreshes immediately — which the defaults would not do.
    const b24 = new B24Frame(QUERY_PARAMS, {
      keepAuthFresh: { marginMs: 2 * 60 * 60_000 }
    })
    await b24.init()
    await vi.advanceTimersByTimeAsync(0)

    expect(refreshSends).toHaveLength(1)

    b24.destroy()
  })

  it('stops the pulse on destroy() — no timer, no further refreshes', async () => {
    const b24 = new B24Frame(QUERY_PARAMS, { keepAuthFresh: true })
    await b24.init()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    b24.destroy()

    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10 * FRAME_PULSE_MAX_MS)
    expect(refreshSends).toHaveLength(0)
  })

  it('destroy() before init() is safe', () => {
    const b24 = new B24Frame(QUERY_PARAMS, { keepAuthFresh: true })
    expect(() => b24.destroy()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a second init() does not start a second pulse', async () => {
    const b24 = new B24Frame(QUERY_PARAMS, { keepAuthFresh: true })
    await b24.init()
    await b24.init()
    await vi.advanceTimersByTimeAsync(0)

    expect(vi.getTimerCount()).toBe(1)

    b24.destroy()
  })

  it('the floor still applies to a caller asking for a faster pulse', async () => {
    const b24 = new B24Frame(QUERY_PARAMS, {
      keepAuthFresh: { marginMs: 2 * 60 * 60_000, minDelayMs: 1 }
    })
    await b24.init()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshSends).toHaveLength(1)

    // `minDelayMs: 1` must not become one message per millisecond.
    await vi.advanceTimersByTimeAsync(FRAME_PULSE_MIN_MS - 1)
    expect(refreshSends).toHaveLength(1)

    b24.destroy()
  })
})
