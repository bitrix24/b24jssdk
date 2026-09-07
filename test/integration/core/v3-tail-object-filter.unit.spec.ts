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
import { filterMentionsField } from '../../../packages/jssdk/src/core/actions/v3/_keyset-paginate'
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

/**
 * `filterMentionsField` is bounded twice, and the two bounds answer different
 * questions. `MAX_FILTER_DEPTH` stops the walk going too *far*; the visited set
 * stops it doing too *much*. The tests below are the second one: every case here
 * is within the depth limit and would still not finish without it.
 *
 * Measured against the shipped depth of 32 before the visited set existed, the
 * first case took **85 seconds** of blocked event loop — inside a check whose
 * only output is a warning. The assertions are on wall-clock time because that
 * is the property that was broken.
 *
 * They run at an explicit depth of 24 rather than the shipped 32, so that
 * removing the visited set makes them **fail** rather than hang: at 24 the old
 * walk took 223 ms for the cycle and 386 ms for the DAG — measured — against a
 * 100 ms budget it now clears in under one. At 32 the same cycle took 85
 * seconds, which is the number worth knowing and the wrong number to build a
 * test around.
 */
describe('the filter walk is bounded by work, not only by depth', () => {
  const budgetMs = 100
  const probeDepth = 24

  it('returns at once for a node that points at itself twice', () => {
    // `T(d) = 1 + 2·T(d − 1)`. The single-edge version of this — the one the
    // docstring used to give as *the* example — is linear and was always fine,
    // which is exactly why the gap went unnoticed.
    const twoEdge: unknown[] = []
    twoEdge.push(twoEdge, twoEdge)

    const started = Date.now()
    expect(filterMentionsField(twoEdge, 'id', probeDepth)).toBe(false)
    expect(Date.now() - started).toBeLessThan(budgetMs)
  })

  it('returns at once for a shared-node DAG with no cycle at all', () => {
    // No node points back at an ancestor here, so a path-based cycle check would
    // not help: the cost comes from one node being reachable by two edges, at
    // every level.
    let node: unknown = [['x', '=', 1]]
    for (let index = 0; index < probeDepth; index++) {
      node = [node, node]
    }

    const started = Date.now()
    expect(filterMentionsField(node, 'id', probeDepth + 2)).toBe(false)
    expect(Date.now() - started).toBeLessThan(budgetMs)
  })

  it('still finds a field that sits behind a shared node', () => {
    // The visited set must not swallow a real match. `shared` is reached twice;
    // the first visit has to answer truthfully, and `some` short-circuits before
    // the second is ever asked.
    const shared = FilterV3.or(['id', '=', 1])
    expect(filterMentionsField([shared, shared], 'id')).toBe(true)
  })

  it('still finds a field on the second branch when the first shares a node', () => {
    const shared = FilterV3.or(['severity', '=', 'ERROR'])
    expect(filterMentionsField([shared, shared, FilterV3.or(['id', '=', 1])], 'id')).toBe(true)
  })

  it('answers no for a shared node that does not mention the field', () => {
    // The other half of the visited set, and the one the cases above cannot
    // reach: they all end in `true`, so a `seen.has(node) → return true` would
    // pass every one of them. Here the revisit is the only thing that could
    // produce a `true`, and it must not.
    const shared = FilterV3.or(['severity', '=', 'ERROR'])
    expect(filterMentionsField([shared, shared], 'id')).toBe(false)
  })

  it('answers the same filter the same way twice', () => {
    // The visited set has to be per call. A module-level one would still pass
    // every case above — each builds its own filter — and would then answer
    // `false` to the second question about any object it had already walked.
    // Reusing one `params` object across two `callTail` calls is ordinary, so
    // this is the shape that would break in real code and nowhere in a test.
    const filter = [FilterV3.or(['id', '=', 1])]

    expect(filterMentionsField(filter, 'id')).toBe(true)
    expect(filterMentionsField(filter, 'id')).toBe(true)

    // And the set is scoped to one question, not to the object: asking about a
    // different field has to walk the same nodes again.
    const both = [FilterV3.or(['id', '=', 1], ['severity', '=', 'ERROR'])]
    expect(filterMentionsField(both, 'id')).toBe(true)
    expect(filterMentionsField(both, 'severity')).toBe(true)
  })

  it('still stops at MAX_FILTER_DEPTH when nothing is shared', () => {
    // The visited set alone terminates any finite structure, which makes it easy
    // to stop noticing that the depth bound does separate work: a chain of
    // distinct nodes shares nothing, so only depth can end it. Nesting past the
    // limit answers `false` even though the field is really down there — the
    // documented trade, and the reason both bounds are kept.
    const deep = (levels: number): unknown => {
      let node: unknown = ['id', '>', 1]
      for (let index = 0; index < levels; index++) {
        node = [node]
      }
      return node
    }

    expect(filterMentionsField(deep(5), 'id')).toBe(true)
    expect(filterMentionsField(deep(40), 'id')).toBe(false)
  })

  it('keeps answering for the shapes a caller actually writes', () => {
    expect(filterMentionsField([['id', '>', 1]], 'id')).toBe(true)
    expect(filterMentionsField([FilterV3.or(['id', '>', 1])], 'id')).toBe(true)
    expect(filterMentionsField(FilterV3.or(['id', '>', 1]), 'id')).toBe(true)
    expect(filterMentionsField([['severity', '=', 'id']], 'id')).toBe(false)
    expect(filterMentionsField(undefined, 'id')).toBe(false)
  })
})
