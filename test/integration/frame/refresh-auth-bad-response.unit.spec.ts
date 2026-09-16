/**
 * #532 — `refreshAuth()` must not accept an answer it cannot use.
 *
 * `AUTH_EXPIRES` used to be parsed straight into the expiry. On a missing or
 * non-numeric value `Number.parseInt` gives `NaN`, `Date.now() + NaN` is `NaN`,
 * and `NaN > Date.now()` is false — so `getAuthData()` returned `false`
 * **permanently**, and `refreshAuth()` handed that `false` back to the caller
 * cast as `AuthData`. One malformed answer destroyed a still-valid token and
 * left the frame unauthenticated for the rest of the page's life.
 *
 * The assertion that matters in every case below is the second one: the OLD
 * token is still there afterwards. A version that validates only after writing
 * would satisfy the rejection but not that.
 */
import { describe, it, expect, vi } from 'vitest'
import { AuthManager } from '../../../packages/jssdk/src/frame/auth'
import { MessageManager } from '../../../packages/jssdk/src/frame/message/controller'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'
import type { AuthData, MessageInitData } from '../../../packages/jssdk/src/types/auth'

const ORIGIN = 'https://portal.bitrix24.com'

function buildAuthManager(send: () => Promise<unknown>): AuthManager {
  const appFrame = {
    getTargetOrigin: () => ORIGIN,
    getTargetOriginWithPath: () => new Map()
  } as never
  const mgr = new MessageManager({ getTargetOrigin: () => ORIGIN } as never)
  ;(mgr as unknown as { send: () => Promise<unknown> }).send = send

  return new AuthManager(appFrame, mgr).initData({
    AUTH_ID: 'ORIGINAL_ACCESS',
    REFRESH_ID: 'ORIGINAL_REFRESH',
    AUTH_EXPIRES: '3600',
    MEMBER_ID: 'MEMBER',
    IS_ADMIN: true
  } as MessageInitData)
}

describe('#532 refreshAuth() rejects an unusable answer and keeps the old token', () => {
  it.each([
    ['the key is missing', {}],
    ['it is empty', { AUTH_EXPIRES: '' }],
    ['it is not a number', { AUTH_EXPIRES: 'abc' }],
    ['it is zero', { AUTH_EXPIRES: '0' }],
    ['it is negative', { AUTH_EXPIRES: '-1' }],
    // `MessageManager.send` in `isSafely` mode auto-RESOLVES with this shape,
    // which is not AuthData at all. (#189)
    ['the send resolved safely instead of answering', { isSafely: true }]
  ])('rejects when %s', async (_label, answer) => {
    const auth = buildAuthManager(async () => ({
      AUTH_ID: 'REPLACEMENT_ACCESS',
      REFRESH_ID: 'REPLACEMENT_REFRESH',
      ...answer
    }))

    await expect(auth.refreshAuth()).rejects.toBeInstanceOf(SdkError)

    // The still-valid token from the handshake survived. This is the actual
    // bug: the old code had already overwritten it before noticing.
    const data = auth.getAuthData() as AuthData
    expect(data).not.toBe(false)
    expect(data.access_token).toBe('ORIGINAL_ACCESS')
    expect(data.refresh_token).toBe('ORIGINAL_REFRESH')
  })

  it('reports the failure with a code, and never echoes the payload', async () => {
    const auth = buildAuthManager(async () => ({
      AUTH_ID: 'SECRET_ACCESS_TOKEN',
      REFRESH_ID: 'SECRET_REFRESH_TOKEN',
      AUTH_EXPIRES: 'not-a-number'
    }))

    await expect(auth.refreshAuth()).rejects.toMatchObject({
      code: 'JSSDK_FRAME_REFRESH_AUTH_BAD_RESPONSE'
    })

    // An SdkError description is NOT run through the redactor, and this payload
    // carries the bearer tokens. The message names the field, never its value.
    await auth.refreshAuth().catch((error: SdkError) => {
      expect(error.message).not.toContain('SECRET_ACCESS_TOKEN')
      expect(error.message).not.toContain('SECRET_REFRESH_TOKEN')
      expect(error.message).not.toContain('not-a-number')
      expect(error.message).toContain('AUTH_EXPIRES')
    })
  })

  it('stays usable: a good answer after a bad one refreshes normally', async () => {
    let answerWell = false
    const auth = buildAuthManager(async () => (answerWell
      ? { AUTH_ID: 'NEW_ACCESS', REFRESH_ID: 'NEW_REFRESH', AUTH_EXPIRES: '7200' }
      : { AUTH_ID: 'BAD', REFRESH_ID: 'BAD', AUTH_EXPIRES: 'nope' }))

    await expect(auth.refreshAuth()).rejects.toBeInstanceOf(SdkError)

    answerWell = true
    const data = await auth.refreshAuth()
    expect(data.access_token).toBe('NEW_ACCESS')
  })

  it('updates expires_in on a successful refresh, not only expires', async () => {
    // It used to keep the handshake's value forever while `expires` moved, so
    // the two disagreed for the rest of the page's life.
    const auth = buildAuthManager(async () => ({
      AUTH_ID: 'NEW_ACCESS',
      REFRESH_ID: 'NEW_REFRESH',
      AUTH_EXPIRES: '7200'
    }))

    expect((auth.getAuthData() as AuthData).expires_in).toBe(3600)

    const refreshed = await auth.refreshAuth()
    expect(refreshed.expires_in).toBe(7200)
    expect((auth.getAuthData() as AuthData).expires_in).toBe(7200)
  })

  it('does not leave a coalescing slot behind after rejecting', async () => {
    const send = vi.fn(async () => ({ AUTH_ID: 'A', REFRESH_ID: 'R', AUTH_EXPIRES: 'nope' }))
    const auth = buildAuthManager(send)

    await expect(auth.refreshAuth()).rejects.toBeInstanceOf(SdkError)
    await expect(auth.refreshAuth()).rejects.toBeInstanceOf(SdkError)

    expect(send).toHaveBeenCalledTimes(2)
  })
})
