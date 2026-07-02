/**
 * #189 (part C) — `AuthManager.refreshAuth()` must not hang.
 *
 * The frame refresh sends a `refreshAuth` postMessage and awaits the parent's
 * reply. `MessageManager.send` has no timeout of its own on this path (its
 * `isSafely` mode auto-*resolves* with `{ isSafely: true }`, which is not valid
 * `AuthData`). Since #182 every 401 triggers a refresh, so a parent that never
 * answers (slow / navigated away / blocked) would hang the request forever.
 *
 * `refreshAuth()` now races the send against a *rejecting* timer, so a hung
 * parent surfaces a clean `SdkError` after a bounded wait. This is a portal-free
 * mocked unit spec — the parent-window round-trip isn't reachable in CI, so we
 * stub `MessageManager.send`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { AuthManager } from '../../../packages/jssdk/src/frame/auth'
import { MessageManager } from '../../../packages/jssdk/src/frame/message/controller'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'

const ORIGIN = 'https://portal.bitrix24.com'
const REFRESH_AUTH_TIMEOUT = 10_000 // must match frame/auth.ts

function buildAuthManager(send: () => Promise<unknown>): AuthManager {
  const appFrame = {
    getTargetOrigin: () => ORIGIN,
    getTargetOriginWithPath: () => new Map()
  } as never
  const mgr = new MessageManager({ getTargetOrigin: () => ORIGIN } as never)
  ;(mgr as unknown as { send: () => Promise<unknown> }).send = send
  return new AuthManager(appFrame, mgr)
}

describe('#189 AuthManager.refreshAuth() is timeout-bounded', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects with a clear SdkError when the parent never answers', async () => {
    vi.useFakeTimers()
    // A `send` that never settles — models a hung / gone parent window.
    const auth = buildAuthManager(() => new Promise(() => {}))

    const pending = auth.refreshAuth()
    // Swallow the eventual rejection while we drive the clock, so it doesn't
    // surface as an unhandled rejection before the assertion attaches.
    pending.catch(() => {})

    await vi.advanceTimersByTimeAsync(REFRESH_AUTH_TIMEOUT)

    await expect(pending).rejects.toBeInstanceOf(SdkError)
    await expect(pending).rejects.toMatchObject({
      code: 'JSSDK_FRAME_REFRESH_AUTH_TIMEOUT'
    })
  })

  it('resolves with AuthData when the parent answers in time (timer is cleared)', async () => {
    // Real timers: the send resolves immediately, so the race settles well
    // before the 10s timer — and the timer is cleared in `finally`, so nothing
    // is left pending.
    const auth = buildAuthManager(async () => ({
      AUTH_ID: 'NEW_ACCESS',
      REFRESH_ID: 'NEW_REFRESH',
      AUTH_EXPIRES: '3600'
    }))

    const data = await auth.refreshAuth()
    expect(data.access_token).toBe('NEW_ACCESS')
    expect(data.refresh_token).toBe('NEW_REFRESH')
  })
})
