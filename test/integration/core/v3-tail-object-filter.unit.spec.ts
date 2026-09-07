/**
 * Regression: the `restApi:v2` object filter dialect (`{ '>id': 100 }`) is
 * rejected client-side by the **tail** walkers too, not only by the list ones.
 *
 * Measured live: `main.eventlog.tail` with that filter answers the portal's
 * "unknown filter condition" — the same rejection `callList` gets. v3 parses a
 * filter positionally (`FilterStructure::handleSimpleCondition()` dispatches on
 * `count()` and reads `[0]`, `[1]`, `[2]`), so a map keyed by an operator prefix
 * matches no shape it knows: in v3 the operator is a position, not a prefix on
 * the field name as it was in v2.
 *
 * The comment this replaces called the dialect "harmless" for the tail walkers.
 * It is harmless only in the sense that the SDK did not stand in the way — the
 * request still failed, one round-trip later and in wording that never mentions
 * the dialect. Hence the assertion that no request is sent at all.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (axios is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook, FilterV3, ParamsFactory } from '../../../packages/jssdk/src/'

const EMPTY_PAGE = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: {
    result: { items: [] },
    time: {
      start: 0, finish: 0, duration: 0, processing: 0,
      date_start: '1970-01-01T00:00:00+00:00',
      date_finish: '1970-01-01T00:00:00+00:00'
    }
  }
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

describe('the v2 object filter dialect on the v3 tail walkers', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('callTail rejects it before sending anything', async () => {
    b24 = buildHook()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')

    await expect(
      b24.actions.v3.callTail.make({
        method: 'main.eventlog.tail',
        params: { select: ['id'], filter: { '>id': 1 } } as never,
        customKeyForResult: 'items'
      })
    ).rejects.toMatchObject({ code: 'JSSDK_ACTION_V3_LIST_FILTER_NOT_ARRAY' })

    // The point of the guard: the caller learns before spending a request.
    expect(post).not.toHaveBeenCalled()
  })

  it('fetchTail rejects it before sending anything', async () => {
    b24 = buildHook()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')

    const generator = b24.actions.v3.fetchTail.make({
      method: 'main.eventlog.tail',
      params: { select: ['id'], filter: { '>id': 1 } } as never,
      customKeyForResult: 'items'
    } as never)

    await expect(generator.next()).rejects.toMatchObject({ code: 'JSSDK_ACTION_V3_LIST_FILTER_NOT_ARRAY' })
    expect(post).not.toHaveBeenCalled()
  })

  it('an array filter still passes the guard', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(EMPTY_PAGE)

    const response = await b24.actions.v3.callTail.make({
      method: 'main.eventlog.tail',
      params: { select: ['id'], filter: [['severity', '=', 'INFO']] } as never,
      customKeyForResult: 'items'
    })

    expect(response.isSuccess).toBe(true)
  })

  it('a bare logic group is left alone — the portal accepts it', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(EMPTY_PAGE)

    // Measured on an on-premise build: `{ logic: 'or', conditions: [...] }` as the
    // whole filter is accepted by `main.eventlog.list`, and the tail walkers
    // forward `filter` untouched. Guarding it would reject what `FilterV3.or()`
    // produces and what the portal answers to.
    const response = await b24.actions.v3.callTail.make({
      method: 'main.eventlog.tail',
      params: { select: ['id'], filter: FilterV3.or(FilterV3.gt('id', 1), FilterV3.lt('id', 9)) } as never,
      customKeyForResult: 'items'
    })

    expect(response.isSuccess).toBe(true)
  })

  it('the same group inside an array passes the guard', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(EMPTY_PAGE)

    const response = await b24.actions.v3.callTail.make({
      method: 'main.eventlog.tail',
      params: {
        select: ['id'],
        filter: [FilterV3.or(FilterV3.gt('id', 1), FilterV3.lt('id', 9))]
      } as never,
      customKeyForResult: 'items'
    })

    expect(response.isSuccess).toBe(true)
  })
})
