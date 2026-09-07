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
    ).rejects.toMatchObject({
      code: 'JSSDK_ACTION_V3_TAIL_FILTER_INVALID',
      // The wording is the other half of the guard's job — the portal's own
      // rejection never names the dialect. Without this, a mutation that swapped
      // in the list message would pass.
      message: expect.stringContaining('logic group from FilterV3.or()')
    })

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

    await expect(generator.next()).rejects.toMatchObject({
      code: 'JSSDK_ACTION_V3_TAIL_FILTER_INVALID',
      message: expect.stringContaining('fetchTail.make')
    })
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

describe('shapes the tail guard has to tell apart', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it.each([
    ['null', null],
    ['a string', 'id > 1'],
    ['a number', 42],
    ['a boolean', true]
  ])('rejects %s rather than throwing a TypeError', async (_name, filter) => {
    // `null` is the sharp one: the group test reads `'conditions' in value`,
    // which throws a raw TypeError on `null` if the guard lets it through — an
    // error the caller cannot act on, from a check meant to make errors clearer.
    b24 = buildHook()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')

    await expect(
      b24.actions.v3.callTail.make({
        method: 'main.eventlog.tail',
        params: { select: ['id'], filter } as never,
        customKeyForResult: 'items'
      })
    ).rejects.toMatchObject({ code: 'JSSDK_ACTION_V3_TAIL_FILTER_INVALID' })

    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    // Each carries exactly ONE of the four keys and, crucially, three of them
    // carry no `conditions` — otherwise a predicate testing `conditions` alone
    // would be indistinguishable from one testing all four.
    ['logic', { logic: 'or' }],
    ['type', { type: 'group' }],
    ['negative', { negative: true }],
    ['conditions', { conditions: [] }]
  ])('passes an object carrying only %s — the portal reads all four as a group', async (_name, filter) => {
    // The portal's `fillStructure()` takes the group branch on any of
    // type/logic/conditions/negative. Testing only `conditions` would make the
    // guard stricter than the server it stands in for, and a false rejection
    // has no way around it.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)

    await expect(
      b24.actions.v3.callTail.make({
        method: 'main.eventlog.tail',
        params: { select: ['id'], filter } as never,
        customKeyForResult: 'items'
      })
    ).resolves.toBeDefined()
  })
})

describe('the cursor field hiding inside a logic group', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it.each([
    ['a bare group', FilterV3.or(['id', '>', 1], ['id', '<', 9])],
    ['a group inside the array form', [FilterV3.or(['id', '>', 1], ['id', '<', 9])]],
    ['a plain triple', [['id', '>', 1]]]
  ])('warns when the cursor field appears in %s', async (_name, filter) => {
    // The scan used to look only at a top-level array of triples. Once a bare
    // group became a legal filter here, it stopped seeing anything at all — so
    // the server rejected with INVALIDFILTEREXCEPTION and the caller got no
    // warning, which is the round trip this whole guard exists to save.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)
    // The action carries the manager's logger, not the transport's.
    const warning = vi.spyOn(b24.actions.v3.callTail['_logger'], 'warning').mockResolvedValue(undefined)

    await b24.actions.v3.callTail.make({
      method: 'main.eventlog.tail',
      params: { select: ['id'], filter } as never,
      cursorField: 'id',
      customKeyForResult: 'items'
    })

    expect(warning).toHaveBeenCalledWith(expect.stringContaining('must not appear in `filter`'))
  })

  it.each([
    ['a bare group', FilterV3.or(['id', '>', 1], ['id', '<', 9])],
    ['a group inside the array form', [FilterV3.or(['id', '>', 1])]],
    ['a group nested in a group', [FilterV3.or(FilterV3.and(['id', '>', 1]))]]
  ])('warns from fetchTail too, for %s', async (_name, filter) => {
    // The walker is shared, but the wiring is not: each action passes its own
    // `cursorField` and `params.filter` into it. Covering only `callTail` left
    // a defect in `fetchTail`'s call site invisible.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)
    const warning = vi.spyOn(b24.actions.v3.fetchTail['_logger'], 'warning').mockResolvedValue(undefined)

    const generator = b24.actions.v3.fetchTail.make({
      method: 'main.eventlog.tail',
      params: { select: ['id'], filter } as never,
      cursorField: 'id',
      customKeyForResult: 'items'
    } as never)
    await generator.next()

    expect(warning).toHaveBeenCalledWith(expect.stringContaining('must not appear in `filter`'))
  })

  it('stays quiet on fetchTail when the filter mentions another field', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)
    const warning = vi.spyOn(b24.actions.v3.fetchTail['_logger'], 'warning').mockResolvedValue(undefined)

    const generator = b24.actions.v3.fetchTail.make({
      method: 'main.eventlog.tail',
      params: { select: ['id'], filter: [FilterV3.or(['severity', '=', 'ERROR'])] } as never,
      cursorField: 'id',
      customKeyForResult: 'items'
    } as never)
    await generator.next()

    expect(warning).not.toHaveBeenCalledWith(expect.stringContaining('must not appear in `filter`'))
  })

  it('sees a field two groups deep', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)
    const warning = vi.spyOn(b24.actions.v3.callTail['_logger'], 'warning').mockResolvedValue(undefined)

    await b24.actions.v3.callTail.make({
      method: 'main.eventlog.tail',
      params: {
        select: ['id'],
        filter: [FilterV3.or(FilterV3.and(['severity', '=', 'ERROR'], ['id', '>', 1]))]
      } as never,
      cursorField: 'id',
      customKeyForResult: 'items'
    })

    expect(warning).toHaveBeenCalledWith(expect.stringContaining('must not appear in `filter`'))
  })

  it('does not fall over on a filter that points at itself', async () => {
    // A filter is ordinary JavaScript, not parsed JSON, so a caller can hand
    // over a cycle. Without the depth cap this took the stack down inside a
    // check whose whole purpose is to make failures clearer.
    const cyclic: { conditions: unknown[] } = { conditions: [] }
    cyclic.conditions.push(cyclic)

    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)

    // The transport refuses a circular payload by name. Reaching that refusal
    // is the assertion: it proves the walk terminated. Without the cap the
    // recursion dies first, with a RangeError from inside a warning check.
    await expect(
      b24.actions.v3.callTail.make({
        method: 'main.eventlog.tail',
        params: { select: ['id'], filter: cyclic } as never,
        cursorField: 'id',
        customKeyForResult: 'items'
      })
    ).rejects.toMatchObject({ code: 'JSSDK_INVALID_PARAMS' })
  })

  it('treats a group whose conditions are not an array as mentioning nothing', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)
    const warning = vi.spyOn(b24.actions.v3.callTail['_logger'], 'warning').mockResolvedValue(undefined)

    await b24.actions.v3.callTail.make({
      method: 'main.eventlog.tail',
      params: { select: ['id'], filter: { logic: 'or', conditions: 'id' } } as never,
      cursorField: 'id',
      customKeyForResult: 'items'
    })

    // The portal will refuse this shape itself; the point is that the scan
    // answers rather than throwing on the way there.
    expect(warning).not.toHaveBeenCalledWith(expect.stringContaining('must not appear in `filter`'))
  })

  it('stays quiet when the filter mentions another field', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)
    // The action carries the manager's logger, not the transport's.
    const warning = vi.spyOn(b24.actions.v3.callTail['_logger'], 'warning').mockResolvedValue(undefined)

    await b24.actions.v3.callTail.make({
      method: 'main.eventlog.tail',
      params: { select: ['id'], filter: [FilterV3.or(['severity', '=', 'ERROR'])] } as never,
      cursorField: 'id',
      customKeyForResult: 'items'
    })

    expect(warning).not.toHaveBeenCalledWith(expect.stringContaining('must not appear in `filter`'))
  })
})
