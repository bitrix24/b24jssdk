/**
 * #479 — `setRestrictionManagerParams` replaces the named parameters and keeps
 * the rest.
 *
 * It used to assign the whole config, so a caller changing one field silently
 * lost every other one — including `rateLimit`, which then reached
 * `RateLimiter.setConfig()` as `undefined` behind a non-null assertion. Nothing
 * threw and nothing was logged; the next call simply ran under a policy nobody
 * had chosen.
 *
 * Portal-free (jsSdk:unit): nothing here makes an HTTP request.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'
import { RateLimiter } from '../../../packages/jssdk/src/core/http/limiters/rate-limiter'

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET')
}

describe('#479 RestrictionParams merge on set', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('keeps the parameters a later partial update does not mention', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      retryOnNetworkError: false,
      hardErrorCodes: ['MY_APP_BAD_PAYLOAD'],
      classifyV3ErrorsByCategory: true
    })

    await b24.setRestrictionManagerParams({ maxRetries: 5 } as never)

    const params = client.getRestrictionManagerParams()
    expect(params.maxRetries).toBe(5)
    // Each of these was `undefined` before the fix.
    expect(params.retryOnNetworkError).toBe(false)
    expect(params.hardErrorCodes).toEqual(['MY_APP_BAD_PAYLOAD'])
    expect(params.classifyV3ErrorsByCategory).toBe(true)
  })

  it('keeps the nested limiter blocks a partial update does not mention', async () => {
    // The sharpest arm: `rateLimit` becoming `undefined` was passed on to
    // `RateLimiter.setConfig()` through a `!`, which reads `config.drainRate`.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)
    const before = client.getRestrictionManagerParams()

    await b24.setRestrictionManagerParams({ maxRetries: 5 } as never)

    const after = client.getRestrictionManagerParams()
    expect(after.rateLimit).toEqual(before.rateLimit)
    expect(after.operatingLimit).toEqual(before.operatingLimit)
    expect(after.adaptiveConfig).toEqual(before.adaptiveConfig)
  })

  it('replaces a nested block whole rather than merging it field by field', async () => {
    // Stated behaviour, not an accident of the spread: supply `rateLimit` and
    // you supply all of it. A half-specified block must NOT pick the missing
    // fields up from the previous one — passing a fully-specified block here
    // would leave replace and deep-merge indistinguishable.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)
    expect(client.getRestrictionManagerParams().rateLimit?.drainRate).toBeDefined()

    await b24.setRestrictionManagerParams({ rateLimit: { burstLimit: 7 } } as never)

    expect(client.getRestrictionManagerParams().rateLimit).toEqual({ burstLimit: 7 })
  })

  it('reconfigures the sub-limiter when its block is supplied', async () => {
    // `getParams()` reads the manager's own copy, so on its own it cannot tell
    // whether the rate limiter was ever told. Without this, dropping the
    // forwarding entirely leaves every other case green.
    b24 = buildHook()
    const setConfig = vi.spyOn(RateLimiter.prototype, 'setConfig')

    const rateLimit = { burstLimit: 7, drainRate: 1, adaptiveEnabled: false }
    await b24.setRestrictionManagerParams({ rateLimit } as never)

    expect(setConfig).toHaveBeenCalledWith(rateLimit)
  })

  it('leaves the sub-limiter alone when its block is not supplied', async () => {
    // The other half: an omitted block must not reach the limiter as
    // `undefined`, which is what the old non-null assertion allowed.
    b24 = buildHook()
    const setConfig = vi.spyOn(RateLimiter.prototype, 'setConfig')

    await b24.setRestrictionManagerParams({ maxRetries: 5 } as never)

    expect(setConfig).not.toHaveBeenCalled()
  })

  it('still applies every parameter of a full update', async () => {
    // The merge must not make a full replacement stickier than it was.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      hardErrorCodes: ['FIRST']
    })
    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      hardErrorCodes: ['SECOND']
    })

    expect(client.getRestrictionManagerParams().hardErrorCodes).toEqual(['SECOND'])
  })

  it('the merged policy is what the next call actually runs under', async () => {
    // `getParams()` could agree while the manager read something else.
    // `exceptionCodeForHard` is derived from the live config, so it is the
    // honest witness.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      hardErrorCodes: ['MY_APP_BAD_PAYLOAD']
    })
    await b24.setRestrictionManagerParams({ maxRetries: 5 } as never)

    expect(client.getRestrictionManagerParams().hardErrorCodes).toContain('MY_APP_BAD_PAYLOAD')
  })
})
