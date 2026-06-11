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

function authError(status: number, code: string): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      statusText: 'Unauthorized',
      headers: {},
      config: {} as never,
      data: { error: code, error_description: 'The access token provided has expired.' }
    }
  )
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

describe('401 expired_token auth retry (issue #182)', () => {
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
      .mockRejectedValueOnce(authError(401, 'expired_token'))
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
    vi.spyOn(httpClient.ajaxClient, 'post')
      .mockRejectedValueOnce(authError(401, 'invalid_token'))
      .mockResolvedValue(SUCCESS_RESPONSE)

    const result = await b24.actions.v2.call.make({ method: 'user.current', params: {} })

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(result.isSuccess).toBe(true)
  })

  it('does NOT refresh-and-retry on a non-auth 4xx (403 access_denied)', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const refreshSpy = vi.spyOn(b24.auth, 'refreshAuth')
    vi.spyOn(httpClient.ajaxClient, 'post').mockRejectedValue(authError(403, 'access_denied'))

    await expect(
      b24.actions.v2.call.make({ method: 'user.current', params: {} })
    ).rejects.toBeDefined()

    expect(refreshSpy).not.toHaveBeenCalled()
  })
})
