/**
 * Unit test for the `cause` chain on the SDK's last-resort rethrows.
 *
 * Both `AuthOAuthManager.refreshAuth()` and `B24HelperManager.loadData()` rethrow
 * an `Error` they caught untouched, and wrap anything that is NOT an `Error` in a
 * fresh one. That wrapper used to drop the original value — `refreshAuth()`
 * computed `cause: error instanceof Error ? error : undefined`, which is provably
 * always `undefined` on the only branch that reaches it, and `loadData()` passed no
 * `cause` at all. A non-Error rejection therefore disappeared entirely.
 *
 * Portal-free (`jsSdk:unit`): the failure is injected through
 * `setCustomRefreshAuth()` and a stub `TypeB24`, so no network request is made.
 * These assertions exist because the bug was introduced by a lint-driven refactor
 * and would be re-introduced just as silently by the next one.
 */
import { describe, it, expect } from 'vitest'

import { AuthOAuthManager } from '../../../packages/jssdk/src/oauth/auth'
import { B24HelperManager } from '../../../packages/jssdk/src/helper/helper-manager'
import type { B24OAuthParams, B24OAuthSecret } from '../../../packages/jssdk/src/types/auth'
import type { TypeB24 } from '../../../packages/jssdk/src/types/b24'

function makeManager(): AuthOAuthManager {
  const params = {
    domain: 'https://portal.bitrix24.com',
    clientEndpoint: 'https://portal.bitrix24.com/rest/',
    serverEndpoint: 'https://oauth.bitrix24.tech/rest/',
    expires: Math.floor(Date.now() / 1000) + 3600,
    expiresIn: 3600,
    accessToken: 'ACCESS_OLD',
    refreshToken: 'REFRESH_OLD',
    memberId: 'mid-1',
    scope: 'app',
    status: 'L'
  } as unknown as B24OAuthParams
  const secret = { clientId: 'local.app.id', clientSecret: 'CLIENT_SECRET' } as B24OAuthSecret
  return new AuthOAuthManager(params, secret)
}

/** A `TypeB24` stub whose only reachable member is the v2 batch call. */
function makeB24ThatRejectsWith(thrown: unknown): TypeB24 {
  return {
    actions: {
      v2: {
        batch: {
          make: async () => {
            throw thrown
          }
        }
      }
    }
  } as unknown as TypeB24
}

describe('non-Error rejections keep the original value as `cause`', () => {
  it('refreshAuth() wraps a non-Error in `Strange error: …` and carries it as cause', async () => {
    const mgr = makeManager()
    // A string is not an `Error`, so it falls past both `instanceof` guards.
    mgr.setCustomRefreshAuth(async () => {
      throw 'refresh exploded'
    })

    const thrown = await mgr.refreshAuth().catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('Strange error: refresh exploded')
    // The whole point: the raw value survives instead of becoming `undefined`.
    expect((thrown as Error).cause).toBe('refresh exploded')
  })

  it('refreshAuth() rethrows a real Error untouched — no wrapping, no cause rewrite', async () => {
    const original = new Error('a real failure')
    const mgr = makeManager()
    mgr.setCustomRefreshAuth(async () => {
      throw original
    })

    const thrown = await mgr.refreshAuth().catch((e: unknown) => e)

    expect(thrown).toBe(original)
    expect((thrown as Error).cause).toBeUndefined()
  })

  it('refreshAuth() carries a Symbol as cause instead of throwing while formatting it', async () => {
    const symbol = Symbol('boom')
    const mgr = makeManager()
    mgr.setCustomRefreshAuth(async () => {
      throw symbol
    })

    const thrown = await mgr.refreshAuth().catch((e: unknown) => e)

    // `${symbol}` throws a TypeError; `String(symbol)` does not. The old template
    // form made the catch block itself throw, masking the original value.
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('Strange error: Symbol(boom)')
    expect((thrown as Error).cause).toBe(symbol)
  })

  it('loadData() wraps a non-Error in `Failed to load data` and carries it as cause', async () => {
    const helper = new B24HelperManager(makeB24ThatRejectsWith('batch exploded'))

    const thrown = await helper.loadData().catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('Failed to load data')
    expect((thrown as Error).cause).toBe('batch exploded')
  })

  it('loadData() rethrows a real Error untouched, preserving its message', async () => {
    const original = new Error('batch failed for real')
    const helper = new B24HelperManager(makeB24ThatRejectsWith(original))

    const thrown = await helper.loadData().catch((e: unknown) => e)

    expect(thrown).toBe(original)
    expect((thrown as Error).message).toBe('batch failed for real')
  })
})
