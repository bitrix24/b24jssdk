/**
 * Verifies `RestrictionParams.hardErrorCodes` / `softErrorCodes` extension
 * points added for https://github.com/bitrix24/b24jssdk/issues/24
 *
 * These tests intentionally **mock axios** via a request interceptor that
 * synthesises a custom error code, even though the surrounding integration
 * project hits a real portal for everything else. Reason: a real Bitrix24
 * portal won't return an arbitrary `MY_BUSINESS_FAIL` code on demand, and the
 * whole point of the feature is to teach the SDK about codes it has never
 * heard of. The interceptor short-circuits the request before any network I/O
 * happens, so it is the **core mechanism** of this test — please keep it.
 *
 * Requires `B24_HOOK` from `.env.test` so `B24Hook.fromWebhookUrl` succeeds.
 * No actual REST traffic leaves the machine.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { AxiosError } from 'axios'
import {
  ApiVersion,
  B24Hook,
  ParamsFactory,
  RestrictionManager
} from '../../../packages/jssdk/src/'
import type { RestrictionParams } from '../../../packages/jssdk/src/types/limiters'

const CUSTOM_CODE = 'MY_BUSINESS_FAIL'

function buildClient(restrictionOverrides: Partial<RestrictionParams> = {}): B24Hook {
  const hook = process.env.B24_HOOK
  if (!hook) {
    throw new Error('B24_HOOK environment variable is not set! Please configure it in your .env.test file')
  }

  const b24 = B24Hook.fromWebhookUrl(hook, {
    restrictionParams: {
      ...ParamsFactory.getDefault(),
      retryDelay: 50, // keep retries fast
      ...restrictionOverrides
    }
  })

  // Synthesise the REST response shape the real server would produce for a 400.
  // `_convertAxiosErrorToAjaxError` reads `response.data.error.code` from the
  // AxiosError, so the SDK ends up seeing CUSTOM_CODE as if it came from B24.
  b24.getHttpClient(ApiVersion.v2).ajaxClient.interceptors.request.use(() => {
    const err = new AxiosError(
      'Request failed with status code 400',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: { error: CUSTOM_CODE, error_description: 'simulated business failure' }
      }
    )
    return Promise.reject(err)
  })

  return b24
}

describe('core.limiters custom hardErrorCodes / softErrorCodes @apiV2 (issue #24)', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    b24?.destroy()
    b24 = null
  })

  it('exposes built-in code lists as readonly static fields', () => {
    expect(RestrictionManager.BUILT_IN_HARD_ERROR_CODES.length).toBeGreaterThan(0)
    expect(RestrictionManager.BUILT_IN_SOFT_ERROR_CODES.length).toBeGreaterThan(0)
    expect(RestrictionManager.BUILT_IN_HARD_ERROR_CODES).not.toContain(CUSTOM_CODE)
    expect(RestrictionManager.BUILT_IN_SOFT_ERROR_CODES).not.toContain(CUSTOM_CODE)
  })

  it('unknown code is retried by default (baseline — issue #24 bug pattern)', async () => {
    b24 = buildClient()

    let thrown: any
    try {
      await b24.actions.v2.call.make({ method: 'crm.deal.get', params: { id: 1 } })
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeDefined()
    expect(thrown.code).toBe('JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED')

    const stats = b24.getHttpClient(ApiVersion.v2).getStats()
    expect(stats.retries).toBeGreaterThan(0)
  })

  it('hardErrorCodes: SDK throws immediately, no retries', async () => {
    b24 = buildClient({ hardErrorCodes: [CUSTOM_CODE] })

    let thrown: any
    try {
      await b24.actions.v2.call.make({ method: 'crm.deal.get', params: { id: 1 } })
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeDefined()
    expect(thrown.code).toBe(CUSTOM_CODE)

    const stats = b24.getHttpClient(ApiVersion.v2).getStats()
    expect(stats.retries).toBe(0)
    expect(stats.failedRequests).toBe(1)
  })

  it('softErrorCodes: SDK returns AjaxResult with the error, no throw and no retries', async () => {
    b24 = buildClient({ softErrorCodes: [CUSTOM_CODE] })

    const response = await b24.actions.v2.call.make({ method: 'crm.deal.get', params: { id: 1 } })

    expect(response.isSuccess).toBe(false)

    const firstError = response.getErrors().next().value as { code?: string } | undefined
    expect(firstError?.code).toBe(CUSTOM_CODE)

    const stats = b24.getHttpClient(ApiVersion.v2).getStats()
    expect(stats.retries).toBe(0)
    expect(stats.failedRequests).toBe(1)
  })
})
