/**
 * Regression for issue #462: a `restApi:v3` call must be able to carry an
 * `Idempotency-Key` header, and its caller must be able to tell a replayed
 * response from a fresh write.
 *
 * The portal implements the mechanism in full — an arbitrary key names one
 * business operation, the successful response is stored against it for 24
 * hours, and a repeat with the same key and the same body replays that stored
 * response with `Idempotent-Replayed: true` (a key reused with a *different*
 * body is refused with HTTP 422). See
 * https://apidocs.bitrix24.ru/api-reference/rest-v3.html, section
 * «Повторный вызов без дублей».
 *
 * Before the fix the transport could not reach any of it: `call()` took no
 * per-request options, `_makeAxiosRequest` posted with two arguments so no
 * per-request header could be attached, and `AjaxResponse` was `{ status,
 * payload }` — the reply headers were dropped on the way out. The only escape
 * hatch was `ajaxClient.defaults.headers`, which is instance-wide, so one key
 * would ride every subsequent request and the 422 branch would become the
 * normal case.
 *
 * One `it` per surface on purpose: a single compound case lets one mutation
 * hide behind another assertion in the same block.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (axios is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { AxiosError } from 'axios'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'

const IDEMPOTENCY_KEY = '2f7c1e4a-0000-4000-8000-abcdefabcdef'

/** A plain v3 write response, with whatever headers the case needs. */
function writeResponse(headers: Record<string, string> = {}) {
  return {
    status: 200,
    statusText: 'OK',
    headers,
    config: {} as never,
    data: {
      result: { item: { id: 15 } },
      time: {
        start: 0, finish: 0, duration: 0, processing: 0,
        date_start: '1970-01-01T00:00:00+00:00',
        date_finish: '1970-01-01T00:00:00+00:00',
        operating_reset_at: 1, operating: 0
      }
    }
  }
}

/** A 401 the transport will answer by refreshing the token and retrying. */
function expiredTokenError(): AxiosError {
  return new AxiosError(
    'Request failed with status code 401',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 401,
      statusText: 'Error',
      headers: {},
      config: {} as never,
      data: { error: 'expired_token', error_description: 'simulated expired_token' }
    }
  )
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

/** The header bag axios was asked to send, or `undefined` when none was. */
function sentHeaders(postSpy: { mock: { calls: unknown[][] } }): Record<string, unknown> | undefined {
  const config = postSpy.mock.calls[0]?.[2] as { headers?: Record<string, unknown> } | undefined
  return config?.headers
}

describe('Idempotency-Key on restApi:v3 (issue #462)', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('@apiV3 sends the key as an `Idempotency-Key` request header', async () => {
    b24 = buildHook()
    const postSpy = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse())

    await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: IDEMPOTENCY_KEY
    })

    expect(sentHeaders(postSpy)?.['Idempotency-Key']).toBe(IDEMPOTENCY_KEY)
  })

  it('@apiV3 sends no idempotency header when the call did not ask for one', async () => {
    b24 = buildHook()
    const postSpy = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse())

    await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } }
    })

    // Not merely "the value is undefined": the whole per-request config must
    // stay absent, so an ordinary call is byte-for-byte what it was before.
    expect(postSpy.mock.calls[0]?.[2]).toBeUndefined()
  })

  it('@apiV3 reports a replayed response through `isIdempotentReplay()`', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse({ 'idempotent-replayed': 'true' }))

    const response = await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: IDEMPOTENCY_KEY
    })

    expect(response.isIdempotentReplay()).toBe(true)
  })

  it('@apiV3 reports a fresh write as not a replay', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse({ 'idempotency-key': IDEMPOTENCY_KEY }))

    const response = await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: IDEMPOTENCY_KEY
    })

    // The first call with a key echoes the key but is not a replay — the two
    // headers are independent, and reading either one for the other is the
    // mistake this pins.
    expect(response.isIdempotentReplay()).toBe(false)
    expect(response.getIdempotencyKey()).toBe(IDEMPOTENCY_KEY)
  })

  it('@apiV3 reports no replay at all when the response carries no headers', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse())

    const response = await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } }
    })

    expect(response.isIdempotentReplay()).toBe(false)
    expect(response.getIdempotencyKey()).toBeUndefined()
  })

  it('@apiV3 reads the reply headers case-insensitively', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse({
        'Idempotent-Replayed': 'True',
        'Idempotency-Key': IDEMPOTENCY_KEY
      }))

    const response = await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: IDEMPOTENCY_KEY
    })

    // The portal answered lowercased when measured, but the casing an adapter
    // or a proxy hands back is not ours to assume.
    expect(response.isIdempotentReplay()).toBe(true)
    expect(response.getIdempotencyKey()).toBe(IDEMPOTENCY_KEY)
  })

  it('@apiV3 does not treat `idempotent-replayed: false` as a replay', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse({ 'idempotent-replayed': 'false' }))

    const response = await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: IDEMPOTENCY_KEY
    })

    // Presence of the header is not the signal; its value is.
    expect(response.isIdempotentReplay()).toBe(false)
  })

  it('@apiV2 drops the key rather than sending it to the v2 endpoint', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const postSpy = vi.spyOn(httpClient.ajaxClient, 'post')
      .mockResolvedValue(writeResponse())

    await httpClient.call('crm.deal.add', {}, 'req-v2-idem', { idempotencyKey: IDEMPOTENCY_KEY })

    // The portal honours the header only under `/rest/api/`. Sending it to v2
    // anyway would leave the caller believing a retry is deduplicated when
    // nothing is deduplicating it.
    expect(sentHeaders(postSpy)?.['Idempotency-Key']).toBeUndefined()
  })

  it('@apiV2 warns when it drops the key, instead of dropping it silently', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    vi.spyOn(httpClient.ajaxClient, 'post').mockResolvedValue(writeResponse())
    const warning = vi.spyOn(httpClient.getLogger(), 'warning').mockResolvedValue(undefined)

    await httpClient.call('crm.deal.add', {}, 'req-v2-idem', { idempotencyKey: IDEMPOTENCY_KEY })

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('idempotencyKey'),
      expect.objectContaining({ method: 'crm.deal.add' })
    )
  })

  it('@apiV3 keeps the key on the retry after a 401 refreshed the token', async () => {
    b24 = buildHook()
    const postSpy = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockRejectedValueOnce(expiredTokenError())
      .mockResolvedValue(writeResponse())

    await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: IDEMPOTENCY_KEY
    })

    // The refresh-and-retry branch rebuilds the request from scratch. Losing
    // the key there is the one place a retry would write a *second* entity —
    // which is precisely what the key exists to prevent.
    expect(postSpy).toHaveBeenCalledTimes(2)
    const retryConfig = postSpy.mock.calls[1]?.[2] as { headers?: Record<string, unknown> } | undefined
    expect(retryConfig?.headers?.['Idempotency-Key']).toBe(IDEMPOTENCY_KEY)
  })

  it('@apiV3 accepts an already-parsed boolean replay header', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse({ 'idempotent-replayed': true as unknown as string }))

    const response = await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: IDEMPOTENCY_KEY
    })

    // An adapter or a test double may hand back a boolean rather than the
    // string the portal sends.
    expect(response.isIdempotentReplay()).toBe(true)
  })

  it('@apiV3 reads a repeated header handed back as an array', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse({
        'idempotent-replayed': ['true', 'true'] as unknown as string,
        'idempotency-key': [IDEMPOTENCY_KEY] as unknown as string
      }))

    const response = await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: IDEMPOTENCY_KEY
    })

    // Node's http adapter arrays a repeated header name. Stringifying the
    // array gives `true,true`, which matches nothing — so a proxy that
    // duplicated the header would have swallowed a real replay.
    expect(response.isIdempotentReplay()).toBe(true)
    expect(response.getIdempotencyKey()).toBe(IDEMPOTENCY_KEY)
  })

  it('@apiV3 refuses an empty key rather than sending an empty header', async () => {
    b24 = buildHook()
    const postSpy = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse())

    // `toBeInstanceOf(SdkError)` alone is not enough here: `AjaxError` extends
    // `SdkError`, so that assertion stays green even when the named error is
    // converted to `JSSDK_UNKNOWN_ERROR` on the way out — which is exactly what
    // happened while the key was validated inside the retry loop's `try`.
    await expect(b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: ''
    })).rejects.toMatchObject({ code: 'JSSDK_HTTP_INVALID_IDEMPOTENCY_KEY' })

    // And it fails before the write, not after it.
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('@apiV3 refuses a key with a control character', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse())

    // Node's HTTP client would throw ERR_INVALID_CHAR here, and a browser
    // would reject it silently; neither tells the caller what is wrong.
    await expect(b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: 'key-with\r\nInjected: header'
    })).rejects.toMatchObject({ code: 'JSSDK_HTTP_INVALID_IDEMPOTENCY_KEY' })
  })

  it('@apiV3 refuses a key longer than the documented 255 characters', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse())

    await expect(b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: 'x'.repeat(256)
    })).rejects.toMatchObject({ code: 'JSSDK_HTTP_INVALID_IDEMPOTENCY_KEY' })
  })

  it('@apiV3 accepts a key of exactly the documented maximum length', async () => {
    b24 = buildHook()
    const postSpy = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(writeResponse())
    const longestKey = 'x'.repeat(255)

    await b24.actions.v3.call.make({
      method: 'note.collection.add',
      params: { fields: { name: 'audit-v3 idem' } },
      idempotencyKey: longestKey
    })

    // The bound is inclusive: an off-by-one here would reject a key the portal
    // documents as valid.
    expect(sentHeaders(postSpy)?.['Idempotency-Key']).toBe(longestKey)
  })

  it('@apiV2 names the v3 endpoint in the warning, not just the option', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    vi.spyOn(httpClient.ajaxClient, 'post').mockResolvedValue(writeResponse())
    const warning = vi.spyOn(httpClient.getLogger(), 'warning').mockResolvedValue(undefined)

    await httpClient.call('crm.deal.add', {}, 'req-v2-idem', { idempotencyKey: IDEMPOTENCY_KEY })

    // The warning is the caller's only signal that the key went nowhere, so it
    // has to say where to go instead — not merely that something was ignored.
    const [message] = warning.mock.calls[0] as [string, unknown]
    expect(message).toContain('restApi:v2')
    expect(message).toContain('actions.v3.call.make')
    // Once for the call, not once per retry attempt.
    expect(warning).toHaveBeenCalledTimes(1)
  })

  it('@apiV2 stays on the two-argument post when no key is given', async () => {
    b24 = buildHook()
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    const postSpy = vi.spyOn(httpClient.ajaxClient, 'post').mockResolvedValue(writeResponse())

    await httpClient.call('crm.deal.add', {}, 'req-v2-plain')

    expect(postSpy.mock.calls[0]?.[2]).toBeUndefined()
  })
})
