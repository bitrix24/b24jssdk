/**
 * Regression: a body that carries **no `result` key at all** must reach the
 * caller, not be projected away.
 *
 * `AjaxResult.getData()` rebuilds the payload from two named keys, `result` and
 * `time`. A body carrying neither therefore came back as
 * `{ result: undefined, time: undefined }` — the response was "successful" and
 * empty at the same time.
 *
 * That is the shape `rest.documentation.openapi` actually answers with: the
 * OpenAPI document at the top level, measured on an on-premise build
 * (SM_VERSION 26.700.0), a cloud portal and a cloud sandbox. It is the method
 * the docs call the source of truth for v3 discovery, and the snippet on that
 * page reads `getData()?.result` — so the page documented something the
 * transport quietly broke.
 *
 * The wrap lives in `getData()` and not in the constructor on purpose:
 * `#processErrors()` runs against the raw body and detects an error by its
 * `error` key. Wrapping earlier would hide `error` one level down and turn every
 * error response into a successful one — which the second case here pins down.
 *
 * `b24phpsdk` resolves the same problem the same way, naming this same endpoint.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (axios is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'

/** What `rest.documentation.openapi` actually answers: no envelope, no `time`. */
const OPENAPI_DOCUMENT_RESPONSE = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: {
    openapi: '3.0.0',
    info: { title: 'Bitrix24 REST V3 API', version: '1.0.0' },
    servers: [],
    tags: [{ name: 'main', description: 'main module methods' }],
    paths: { '/main.eventlog.list': {} },
    components: {}
  }
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

describe('a response body with no `result` key', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('@apiV3 is wrapped, so `getData().result` is the document', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(OPENAPI_DOCUMENT_RESPONSE)

    const response = await b24.actions.v3.call.make<{ openapi: string, paths: Record<string, unknown> }>({
      method: 'rest.documentation.openapi'
    })

    const document = response.getData()!.result
    expect(document.openapi).toBe('3.0.0')
    expect(Object.keys(document.paths)).toEqual(['/main.eventlog.list'])

    // Nothing to report as elapsed time — the body had no `time` block, and the
    // SDK does not invent one.
    expect(response.getData()!.time).toBeUndefined()
  })

  it('@apiV3 wraps a body that is not an object either — array, primitive', async () => {
    // The predicate asks "is this an envelope?", not "does it lack `result`?",
    // so everything that is not one takes the same route rather than being
    // projected away.
    const bodies: unknown[] = [
      [{ id: 1 }, { id: 2 }],
      true,
      'plain text'
    ]

    for (const body of bodies) {
      b24?.destroy()
      b24 = buildHook()
      vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
        data: body
      })

      const response = await b24.actions.v3.call.make({ method: 'some.method' })

      expect(response.isSuccess, JSON.stringify(body)).toBe(true)
      expect(response.getData()!.result, JSON.stringify(body)).toEqual(body)
      expect(response.getData()!.time, JSON.stringify(body)).toBeUndefined()
    }
  })

  it('@apiV3 a `null` body comes back empty rather than throwing', async () => {
    // Two `.result` reads on the raw body stood between an HTTP 200 with a
    // `null` body and its caller: the success-path log line and `getData()`'s
    // own fallback. Both threw a `TypeError`, which the request path then
    // re-wrapped as `JSSDK_UNKNOWN_ERROR` — a fine response arriving as an
    // unrecognisable failure, the same shape as #338 and #456 one field over.
    //
    // There is genuinely nothing to hand back, so `result` is `undefined`. The
    // assertion that matters is that the call succeeds and nothing is thrown.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
      data: null
    })

    const response = await b24.actions.v3.call.make({ method: 'some.method' })

    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toBeDefined()
    expect(response.getData()!.result).toBeUndefined()
  })

  it('@apiV3 reads `time` off an envelope-less body that happens to carry one', async () => {
    // Never invented, but not thrown away either when the portal did send it.
    b24 = buildHook()
    const time = {
      start: 0, finish: 0, duration: 0, processing: 0,
      date_start: '1970-01-01T00:00:00+00:00',
      date_finish: '1970-01-01T00:00:00+00:00'
    }
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
      data: { openapi: '3.0.0', time }
    })

    const response = await b24.actions.v3.call.make<{ openapi: string }>({
      method: 'rest.documentation.openapi'
    })

    expect(response.getData()!.result.openapi).toBe('3.0.0')
    expect(response.getData()!.time).toEqual(time)
  })

  it('@apiV3 an error body is NOT wrapped — it stays an error', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
        // No `result` key here either — but this one must not become a payload.
        data: { error: { code: 'BITRIX_REST_V3_EXCEPTION_METHODNOTFOUNDEXCEPTION', message: 'not found' } }
      })

    const response = await b24.actions.v3.call.make({ method: 'no.such.method' })

    expect(response.isSuccess).toBe(false)
    expect(response.getData()).toBeUndefined()
    expect([...response.getErrors()].map(e => (e as { code?: string }).code))
      .toContain('BITRIX_REST_V3_EXCEPTION_METHODNOTFOUNDEXCEPTION')
  })
})
