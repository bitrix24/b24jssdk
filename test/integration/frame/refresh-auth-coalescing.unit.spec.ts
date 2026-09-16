/**
 * #532 — `AuthManager.refreshAuth()` coalesces concurrent callers.
 *
 * `AbstractHttp` already coalesced, but per http client — and `B24Frame` builds
 * TWO of them (v2 and v3) over ONE `AuthManager`, so a v2 call and a v3 call
 * racing an expiry sent two `refreshAuth` postMessages. The keep-alive adds a
 * third caller. Coalescing lives in `AuthManager` now, at the single point that
 * talks to the parent window.
 */
import { describe, it, expect, vi } from 'vitest'
import { AuthManager } from '../../../packages/jssdk/src/frame/auth'
import { MessageManager } from '../../../packages/jssdk/src/frame/message/controller'

const ORIGIN = 'https://portal.bitrix24.com'

function buildAuthManager(send: () => Promise<unknown>): AuthManager {
  const appFrame = {
    getTargetOrigin: () => ORIGIN,
    getTargetOriginWithPath: () => new Map()
  } as never
  const mgr = new MessageManager({ getTargetOrigin: () => ORIGIN } as never)
  ;(mgr as unknown as { send: () => Promise<unknown> }).send = send
  return new AuthManager(appFrame, mgr)
}

describe('#532 AuthManager.refreshAuth() coalescing', () => {
  it('sends one postMessage for concurrent callers and hands them all the same result', async () => {
    let resolveSend: (value: unknown) => void = () => {}
    const send = vi.fn(() => new Promise<unknown>((resolve) => {
      resolveSend = resolve
    }))
    const auth = buildAuthManager(send)

    const first = auth.refreshAuth()
    const second = auth.refreshAuth()
    const third = auth.refreshAuth()

    expect(send).toHaveBeenCalledTimes(1)

    resolveSend({ AUTH_ID: 'NEW_ACCESS', REFRESH_ID: 'NEW_REFRESH', AUTH_EXPIRES: '3600' })

    const [a, b, c] = await Promise.all([first, second, third])
    expect(a.access_token).toBe('NEW_ACCESS')
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('releases the slot before the caller resumes, so a refresh in the continuation really refreshes', async () => {
    const send = vi.fn(async () => ({
      AUTH_ID: 'NEW_ACCESS',
      REFRESH_ID: 'NEW_REFRESH',
      AUTH_EXPIRES: '3600'
    }))
    const auth = buildAuthManager(send)

    // The second call is made IN the continuation of the first, with no
    // intervening `await` of our own. That is the shape that matters: if the
    // slot were released by a `.finally()` chained onto the promise, the
    // handler would not have run yet at this point and this call would be
    // handed the already-settled promise instead of refreshing.
    //
    // Writing this as `await refreshAuth(); await refreshAuth()` passes either
    // way — the test's own second `await` donates the missing microtask.
    await auth.refreshAuth().then(() => auth.refreshAuth())

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('releases the slot after a failure, so a failed refresh is not cached', async () => {
    let attempt = 0
    const send = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        throw new Error('parent said no')
      }
      return { AUTH_ID: 'NEW_ACCESS', REFRESH_ID: 'NEW_REFRESH', AUTH_EXPIRES: '3600' }
    })
    const auth = buildAuthManager(send)

    await expect(auth.refreshAuth()).rejects.toThrow('parent said no')
    await expect(auth.refreshAuth()).resolves.toMatchObject({ access_token: 'NEW_ACCESS' })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('shares the rejection with every concurrent caller without an unhandled rejection', async () => {
    let rejectSend: (reason: unknown) => void = () => {}
    const send = vi.fn(() => new Promise<unknown>((_resolve, reject) => {
      rejectSend = reject
    }))
    const auth = buildAuthManager(send)

    const first = auth.refreshAuth()
    const second = auth.refreshAuth()
    expect(send).toHaveBeenCalledTimes(1)

    rejectSend(new Error('parent said no'))

    await expect(first).rejects.toThrow('parent said no')
    await expect(second).rejects.toThrow('parent said no')
  })
})
