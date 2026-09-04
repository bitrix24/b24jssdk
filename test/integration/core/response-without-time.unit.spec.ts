/**
 * Regression: a successful response **without a `time` block** must come back to
 * the caller, not blow up.
 *
 * Before the fix, `_createAjaxResultFromResponse` read `result.getData()?.time`
 * and passed it on with a non-null assertion, and
 * `OperatingLimiter.updateStats()` destructured it — so a fine HTTP 200 turned
 * into `Cannot destructure property 'operating' of 'data' as it is undefined`.
 *
 * Two independent ways a portal legitimately answers without those fields, both
 * measured live:
 *
 * - `rest.documentation.openapi` returns the OpenAPI document at the **top
 *   level** — no `result` envelope and no `time` — on every portal tried: an
 *   on-premise build (SM_VERSION 26.700.0), a cloud portal and a cloud sandbox.
 *   That method is what the docs call the source of truth for v3 discovery, so
 *   the crash made the documented discovery flow impossible.
 * - On-premise the operating limiter is **off by default** (the `rest` module's
 *   `load_limiter_active` option defaults to `N` and nothing in the product ever
 *   sets it), so `operating` / `operating_reset_at` are missing from *every*
 *   response there.
 *
 * Same shape as #338, one level over: there the absent key was `result`, here it
 * is `time`.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (axios is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'
import { RestrictionManager } from '../../../packages/jssdk/src/core/http/limiters/manager'

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

/** An on-premise portal with the limiter off: `time` present, counters absent. */
const RESPONSE_WITHOUT_OPERATING = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: {
    result: { items: [{ id: 1 }] },
    time: {
      start: 0, finish: 0, duration: 0, processing: 0,
      date_start: '1970-01-01T00:00:00+00:00',
      date_finish: '1970-01-01T00:00:00+00:00'
    }
  }
}

/** A cloud portal with the limiter on — the shape that always worked. */
const RESPONSE_WITH_OPERATING = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: {
    result: { items: [{ id: 1 }] },
    time: {
      start: 0, finish: 0, duration: 0, processing: 0,
      date_start: '1970-01-01T00:00:00+00:00',
      date_finish: '1970-01-01T00:00:00+00:00',
      operating_reset_at: 1, operating: 0.5
    }
  }
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

describe('a response without a `time` block', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('@apiV3 does not throw when the payload has neither `result` nor `time`', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(OPENAPI_DOCUMENT_RESPONSE)

    // The assertion that matters: this used to throw.
    const response = await b24.actions.v3.call.make<Record<string, unknown>>({
      method: 'rest.documentation.openapi'
    })

    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toBeDefined()
  })

  it('@apiV3 does not throw when `time` is present but carries no operating counters', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(RESPONSE_WITHOUT_OPERATING)

    const response = await b24.actions.v3.call.make<{ items: Array<{ id: number }> }>({
      method: 'main.eventlog.list',
      params: { select: ['id'] }
    })

    expect(response.isSuccess).toBe(true)
    expect(response.getData()!.result.items).toEqual([{ id: 1 }])
  })

  it('@apiV3 still accepts a response that does carry the counters', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(RESPONSE_WITH_OPERATING)

    const response = await b24.actions.v3.call.make<{ items: Array<{ id: number }> }>({
      method: 'main.eventlog.list',
      params: { select: ['id'] }
    })

    expect(response.isSuccess).toBe(true)
    expect(response.getData()!.time.operating).toBe(0.5)
  })

  it('updateStats tolerates an absent time block from any caller', async () => {
    // The v2 batch strategy calls this directly with the per-command `time`,
    // which is equally absent when the portal sends none — so the guard has to
    // live in the limiter, not only at the transport call site.
    const manager = new RestrictionManager(ParamsFactory.getDefault())

    await expect(
      manager.updateStats('unit-test', 'main.eventlog.list', undefined)
    ).resolves.toBeUndefined()
  })
})
