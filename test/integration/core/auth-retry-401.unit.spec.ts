/**
 * Regression for issue #182: a REST request that fails with HTTP 401
 * `expired_token` / `invalid_token` must trigger `authActions.refreshAuth()`
 * and retry the request once.
 *
 * Before the fix, `_makeRequestWithAuthRetry` checked `_isAuthError()` against
 * the *raw* AxiosError thrown by axios. Its `instanceof AjaxError` guard was
 * therefore always false (the AxiosError -> AjaxError conversion, which fills in
 * `code = 'expired_token'`, happened later in `call()`), so the refresh-and-retry
 * branch was dead code and the 401 propagated to the caller on the first attempt.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (axios is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { AxiosError } from 'axios'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'

const SUCCESS_RESPONSE = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: {
    result: { ID: 42 },
    time: {
      start: 0, finish: 0, duration: 0, processing: 0,
      date_start: '1970-01-01T00:00:00+00:00',
      date_finish: '1970-01-01T00:00:00+00:00',
      operating_reset_at: 1, operating: 0
    }
  }
}

function axiosError(status: number, code: string): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      statusText: 'Error',
      headers: {},
      config: {} as never,
      data: { error: code, error_description: `simulated ${code}` }
    }
  )
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

describe('401 auth retry (issue #182)', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('refreshes auth and retries once on a 401 expired_token, then succeeds', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const refreshSpy = vi.spyOn(b24.auth, 'refreshAuth')
    const postSpy = vi.spyOn(httpClient.ajaxClient, 'post')
      .mockRejectedValueOnce(axiosError(401, 'expired_token'))
      .mockResolvedValue(SUCCESS_RESPONSE)

    const result = await b24.actions.v2.call.make({ method: 'user.current', params: {} })

    expect(refreshSpy).toHaveBeenCalledTimes(1) // dead code before the fix
    expect(postSpy).toHaveBeenCalledTimes(2) // original attempt + retry
    expect(result.isSuccess).toBe(true)
    expect(result.getData()!.result).toEqual({ ID: 42 })
  })

  it('also refreshes and retries on a 401 invalid_token', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const refreshSpy = vi.spyOn(b24.auth, 'refreshAuth')
    const postSpy = vi.spyOn(httpClient.ajaxClient, 'post')
      .mockRejectedValueOnce(axiosError(401, 'invalid_token'))
      .mockResolvedValue(SUCCESS_RESPONSE)

    const result = await b24.actions.v2.call.make({ method: 'user.current', params: {} })

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledTimes(2)
    expect(result.isSuccess).toBe(true)
  })

  it('does NOT refresh-and-retry on a non-auth 4xx (403 access_denied)', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const refreshSpy = vi.spyOn(b24.auth, 'refreshAuth')
    vi.spyOn(httpClient.ajaxClient, 'post').mockRejectedValue(axiosError(403, 'access_denied'))

    await expect(
      b24.actions.v2.call.make({ method: 'user.current', params: {} })
    ).rejects.toMatchObject({ status: 403 })

    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('does not loop: a persistent 401 is thrown after exactly one auth retry', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const refreshSpy = vi.spyOn(b24.auth, 'refreshAuth')
    // Every attempt 401s — the retried request after refresh fails too.
    const postSpy = vi.spyOn(httpClient.ajaxClient, 'post')
      .mockRejectedValue(axiosError(401, 'expired_token'))

    await expect(
      b24.actions.v2.call.make({ method: 'user.current', params: {} })
    ).rejects.toMatchObject({ status: 401, code: 'expired_token' })

    expect(refreshSpy).toHaveBeenCalledTimes(1) // one auth retry, no refresh loop
    expect(postSpy).toHaveBeenCalledTimes(2) // original + single retry, then thrown
  })

  it('surfaces a refreshAuth() failure instead of hanging or succeeding', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const refreshSpy = vi.spyOn(b24.auth, 'refreshAuth').mockRejectedValue(new Error('refresh failed'))
    vi.spyOn(httpClient.ajaxClient, 'post').mockRejectedValue(axiosError(401, 'expired_token'))

    await expect(
      b24.actions.v2.call.make({ method: 'user.current', params: {} })
    ).rejects.toBeDefined()

    expect(refreshSpy).toHaveBeenCalled() // refresh was attempted
  })

  it('does NOT refresh on a 5xx server error (goes through the normal retry loop)', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const refreshSpy = vi.spyOn(b24.auth, 'refreshAuth')
    vi.spyOn(httpClient.ajaxClient, 'post').mockRejectedValue(axiosError(500, 'INTERNAL_SERVER_ERROR'))

    await expect(
      b24.actions.v2.call.make({ method: 'user.current', params: {} })
    ).rejects.toBeDefined()

    expect(refreshSpy).not.toHaveBeenCalled()
  })
})
