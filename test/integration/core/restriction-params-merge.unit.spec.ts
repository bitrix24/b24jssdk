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
import { ApiVersion, AjaxError, B24Hook, ParamsFactory, SdkError } from '../../../packages/jssdk/src/'
import { RateLimiter } from '../../../packages/jssdk/src/core/http/limiters/rate-limiter'
import { OperatingLimiter } from '../../../packages/jssdk/src/core/http/limiters/operating-limiter'
import { AdaptiveDelayer } from '../../../packages/jssdk/src/core/http/limiters/adaptive-delayer'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'

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
      softErrorCodes: ['MY_APP_RETRYABLE']
    })

    await b24.setRestrictionManagerParams({ maxRetries: 5 })

    const params = client.getRestrictionManagerParams()
    expect(params.maxRetries).toBe(5)
    // Each of these was `undefined` before the fix. The third slot used to hold
    // `classifyV3ErrorsByCategory`, removed in 3.0.0 (#480); `softErrorCodes` is
    // its nearest equivalent — a field the default set does not populate, so it
    // can only be here because the merge kept it.
    expect(params.retryOnNetworkError).toBe(false)
    expect(params.hardErrorCodes).toEqual(['MY_APP_BAD_PAYLOAD'])
    expect(params.softErrorCodes).toEqual(['MY_APP_RETRYABLE'])
  })

  it('keeps the nested limiter blocks a partial update does not mention', async () => {
    // The sharpest arm: `rateLimit` becoming `undefined` was passed on to
    // `RateLimiter.setConfig()` through a `!`, which reads `config.drainRate`.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)
    const before = client.getRestrictionManagerParams()

    await b24.setRestrictionManagerParams({ maxRetries: 5 })

    const after = client.getRestrictionManagerParams()
    expect(after.rateLimit).toEqual(before.rateLimit)
    expect(after.operatingLimit).toEqual(before.operatingLimit)
    expect(after.adaptiveConfig).toEqual(before.adaptiveConfig)
  })

  it('refuses a half-specified nested block instead of running on NaN', async () => {
    // Blocks are replaced, not deep-merged, and their types have no optional
    // fields — so this is unreachable from TypeScript and reachable from
    // JavaScript or a cast. It used to sail through: `1000 / undefined` is
    // `NaN`, `while (waitTime > 0)` is false on `NaN`, and rate limiting was
    // off for the rest of the process with nothing logged.
    b24 = buildHook()
    const before = b24.getHttpClient(ApiVersion.v3).getRestrictionManagerParams()

    await expect(b24.setRestrictionManagerParams(
      { rateLimit: { burstLimit: 7 } } as never
    )).rejects.toMatchObject({ code: 'JSSDK_LIMITER_INVALID_CONFIG_BLOCK' })

    // And it refuses before touching anything.
    expect(b24.getHttpClient(ApiVersion.v3).getRestrictionManagerParams().rateLimit)
      .toEqual(before.rateLimit)
  })

  it('names the missing fields, so the caller can act on the refusal', async () => {
    b24 = buildHook()
    const thrown = await b24.setRestrictionManagerParams(
      { rateLimit: { burstLimit: 7 } } as never
    ).catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(SdkError)
    expect((thrown as SdkError).message).toContain('drainRate')
    expect((thrown as SdkError).message).toContain('adaptiveEnabled')
  })

  it.each([
    ['operatingLimit', { operatingLimit: { windowMs: 1000 } }],
    ['adaptiveConfig', { adaptiveConfig: { enabled: true } }]
  ])('refuses a half-specified %s too — all three blocks are guarded', async (_name, params) => {
    // Guarding only `rateLimit` left the other two able to reach their limiter
    // half-built, which is the same failure one file over.
    b24 = buildHook()
    await expect(b24.setRestrictionManagerParams(params as never))
      .rejects.toMatchObject({ code: 'JSSDK_LIMITER_INVALID_CONFIG_BLOCK' })
  })

  it('refuses a half-specified block at construction too', () => {
    // `restrictionParams` is a public constructor option, and
    // `RestrictionManager` is exported from the package root — the same door,
    // one frame further out. Without the gate here, the block replaces the
    // default whole and the limiter runs on NaN from the very first request.
    expect(() => B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
      restrictionParams: { rateLimit: { burstLimit: 7 } } as never
    })).toThrow(expect.objectContaining({ code: 'JSSDK_LIMITER_INVALID_CONFIG_BLOCK' }))
  })

  it('refuses a null block rather than resolving and failing on every later call', async () => {
    // `null` reached `RateLimiter.setConfig`, which stored it and then threw on
    // `#config.drainRate`. The rejection was swallowed by the `Promise.allSettled`
    // fan-out, so the setter RESOLVED and every subsequent request died.
    b24 = buildHook()
    await expect(b24.setRestrictionManagerParams(
      { rateLimit: null } as never
    )).rejects.toMatchObject({ code: 'JSSDK_LIMITER_INVALID_CONFIG_BLOCK' })
  })

  it('treats an explicitly undefined key as "not mentioned"', async () => {
    // Object spread copies a key whose value is `undefined`, so the natural
    // spelling of an optional override wiped the field: `maxRetries` reaching
    // the retry loop as `undefined` made `attempt < undefined` false on the
    // first pass, and every call failed as "all attempts exhausted" without one
    // request going out.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    await b24.setRestrictionManagerParams({ ...ParamsFactory.getDefault(), maxRetries: 7 })
    await b24.setRestrictionManagerParams({ maxRetries: undefined })

    expect(client.getRestrictionManagerParams().maxRetries).toBe(7)
  })

  it('an explicitly undefined nested key leaves the block and the limiter in step', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)
    const before = client.getRestrictionManagerParams()
    const setConfig = vi.spyOn(RateLimiter.prototype, 'setConfig')

    await b24.setRestrictionManagerParams({ rateLimit: undefined, maxRetries: 5 })

    // Reporting `undefined` here while the limiter kept enforcing the old block
    // was a permanent drift between what `getParams()` says and what runs.
    expect(client.getRestrictionManagerParams().rateLimit).toEqual(before.rateLimit)
    expect(setConfig).not.toHaveBeenCalled()
  })

  it('reconfigures the sub-limiter when its block is supplied', async () => {
    // `getParams()` reads the manager's own copy, so on its own it cannot tell
    // whether the rate limiter was ever told. Without this, dropping the
    // forwarding entirely leaves every other case green.
    b24 = buildHook()
    const setConfig = vi.spyOn(RateLimiter.prototype, 'setConfig')

    const rateLimit = { burstLimit: 7, drainRate: 1, adaptiveEnabled: false }
    await b24.setRestrictionManagerParams({ rateLimit })

    expect(setConfig).toHaveBeenCalledWith(rateLimit)
  })

  it('reconfigures the operating limiter when its block is supplied', async () => {
    // The three forwards are independent; spying on only one of them left the
    // other two entirely unguarded — deleting them both kept the suite green.
    b24 = buildHook()
    const setConfig = vi.spyOn(OperatingLimiter.prototype, 'setConfig')

    const operatingLimit = { windowMs: 1000, limitMs: 500, heavyPercent: 50 }
    await b24.setRestrictionManagerParams({ operatingLimit })

    expect(setConfig).toHaveBeenCalledWith(operatingLimit)
  })

  it('reconfigures the adaptive delayer when its block is supplied', async () => {
    b24 = buildHook()
    const setConfig = vi.spyOn(AdaptiveDelayer.prototype, 'setConfig')

    const adaptiveConfig = { thresholdPercent: 50, coefficient: 0.02, maxDelay: 1000, enabled: false }
    await b24.setRestrictionManagerParams({ adaptiveConfig })

    expect(setConfig).toHaveBeenCalledWith(adaptiveConfig)
  })

  it('leaves the operating limiter and adaptive delayer alone when their blocks are not supplied', async () => {
    b24 = buildHook()
    const operating = vi.spyOn(OperatingLimiter.prototype, 'setConfig')
    const adaptive = vi.spyOn(AdaptiveDelayer.prototype, 'setConfig')

    await b24.setRestrictionManagerParams({ maxRetries: 5 })

    expect(operating).not.toHaveBeenCalled()
    expect(adaptive).not.toHaveBeenCalled()
  })

  it('leaves the sub-limiter alone when its block is not supplied', async () => {
    // The other half: an omitted block must not reach the limiter as
    // `undefined`, which is what the old non-null assertion allowed.
    b24 = buildHook()
    const setConfig = vi.spyOn(RateLimiter.prototype, 'setConfig')

    await b24.setRestrictionManagerParams({ maxRetries: 5 })

    expect(setConfig).not.toHaveBeenCalled()
  })

  it('a value named in one update and not the next survives it', async () => {
    // Setting the same key twice cannot tell merge from replace. `ParamsFactory`
    // carries no `hardErrorCodes` key at all, so spreading the defaults does not
    // clear one — which is exactly what the documentation now says.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      hardErrorCodes: ['FIRST']
    })
    await b24.setRestrictionManagerParams({ ...ParamsFactory.getDefault() })

    expect(client.getRestrictionManagerParams().hardErrorCodes).toEqual(['FIRST'])
  })

  it('spreading the defaults does NOT clear the two code lists', async () => {
    // The shape a "restore defaults" `finally` block takes. `ParamsFactory`
    // carries no `hardErrorCodes` / `softErrorCodes` key, so under the merge
    // they survive it — which is why the error-handling recipe now names them
    // explicitly. Pinned here because it is the one place the merge surprises.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      hardErrorCodes: ['MY_APP_BAD_PAYLOAD']
    })
    await b24.setRestrictionManagerParams(ParamsFactory.getDefault())

    expect(client.getRestrictionManagerParams().hardErrorCodes).toEqual(['MY_APP_BAD_PAYLOAD'])

    // Naming them is what clears them.
    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      hardErrorCodes: [],
      softErrorCodes: []
    })
    expect(client.getRestrictionManagerParams().hardErrorCodes).toEqual([])
  })

  it('an explicit empty array is how a list is cleared', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    await b24.setRestrictionManagerParams({ hardErrorCodes: ['FIRST'] })
    await b24.setRestrictionManagerParams({ hardErrorCodes: [] })

    expect(client.getRestrictionManagerParams().hardErrorCodes).toEqual([])
  })

  it('three updates in sequence compose', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    await b24.setRestrictionManagerParams({ ...ParamsFactory.getDefault(), hardErrorCodes: ['ONE'] })
    await b24.setRestrictionManagerParams({ rateLimit: { burstLimit: 7, drainRate: 1, adaptiveEnabled: false } })
    await b24.setRestrictionManagerParams({ maxRetries: 9 })

    const params = client.getRestrictionManagerParams()
    expect(params.hardErrorCodes).toEqual(['ONE'])
    expect(params.rateLimit?.burstLimit).toBe(7)
    expect(params.maxRetries).toBe(9)
  })

  it('the merged policy is what the next call actually runs under', async () => {
    // `getParams()` reads the manager's own copy, so it cannot on its own show
    // that the classification path sees the same thing. Drive a real call
    // instead: a `hardErrorCodes` entry that survived a partial update must
    // still make the call throw rather than resolve softly.
    const http = new HttpV2({} as unknown as AuthActions, null, { maxRetries: 1 })
    await http.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      maxRetries: 1,
      softErrorCodes: ['MY_APP_CODE'],
      hardErrorCodes: ['MY_APP_CODE']
    })
    await http.setRestrictionManagerParams({ retryDelay: 1 })

    ;(http as never as { _executeSingleCall: unknown })._executeSingleCall = vi.fn()
      .mockRejectedValue(new AjaxError({
        code: 'MY_APP_CODE',
        description: 'error MY_APP_CODE',
        status: 400,
        requestInfo: { method: 'crm.deal.get', params: {}, requestId: 'r-479' },
        originalError: null
      }))

    // Hard outranks soft, and both survived the partial update above.
    await expect(http.call('crm.deal.get', {})).rejects.toBeInstanceOf(AjaxError)
  })

  it('getParams hands back a copy, not the live limiter state', async () => {
    // A sub-limiter stores its block by reference and rewrites it in place
    // while throttling, so a shallow spread let a reader mutate live
    // enforcement without ever calling the setter.
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v3)

    const first = client.getRestrictionManagerParams()
    const second = client.getRestrictionManagerParams()
    expect(first.rateLimit).not.toBe(second.rateLimit)

    first.rateLimit!.burstLimit = 999
    first.hardErrorCodes = undefined
    await b24.setRestrictionManagerParams({ hardErrorCodes: ['KEPT'] })
    const third = client.getRestrictionManagerParams()
    third.hardErrorCodes!.push('INJECTED')

    expect(client.getRestrictionManagerParams().rateLimit?.burstLimit).not.toBe(999)
    expect(client.getRestrictionManagerParams().hardErrorCodes).toEqual(['KEPT'])
  })
})
