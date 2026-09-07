/**
 * Unit tests for the v3 `aggregate` action.
 *
 * The response fixtures are transcribed from a portal, not invented. No shipped
 * module publishes an `*.aggregate` action — checked on four portals, cloud and
 * on-premise — so the shapes were measured against a module written to publish
 * one, which reaches the same implementation any future module will:
 * `AggregateOrmActionTrait` on a `RestController`, and
 * `OrmRepository::getAllWithAggregate()` under it.
 *
 * Three things the reference does not say, and the action used to get wrong:
 *
 *   1. values come back as **strings** — `'27'`, and `'14.0000'` for an average;
 *   2. over a filter matching no rows, `count` is `'0'` but `sum` and `avg` are
 *      **`null`**, because SQL aggregates over an empty set are null;
 *   3. an alias in the `{ field: alias }` form names the column only inside the
 *      portal's own query — the response keys by field either way.
 *
 * A fourth was measured while reviewing the guard: the portal refuses a select
 * with **no aggregate column at all**, and only that. An empty list beside a
 * non-empty one is accepted, so the guard counts columns across the whole
 * select rather than per function.
 *
 * `actions.v3.call.make` is mocked; no portal is needed to run these.
 */
import { describe, it, expect } from 'vitest'
import { AggregateV3 } from '../../../packages/jssdk/src/core/actions/v3/aggregate'

function makeLogger(warnings: string[] = []) {
  return {
    warning: async (m: string) => warnings.push(m),
    error: async () => {},
    info: async () => {},
    log: async () => {},
    debug: async () => {},
    trace: async () => {}
  } as never
}

/**
 * Mock b24 whose `actions.v3.call.make` records params and answers with the
 * double-nested `{ result: { result: <buckets> } }` envelope a portal sends.
 */
function makeB24(buckets: unknown, isSuccess = true) {
  const calls: any[] = []
  const make = async (opts: any) => {
    calls.push(opts)
    return {
      isSuccess,
      getData: () => ({ result: { result: buckets } }),
      getErrorMessages: () => isSuccess ? [] : ['boom'],
      errors: isSuccess ? [] : [[0, new Error('boom')]]
    } as never
  }
  return { b24: { actions: { v3: { call: { make } } } } as never, calls }
}

/** Answers with a body of the caller's choosing, bypassing the envelope helper. */
function makeB24Raw(data: unknown) {
  const calls: any[] = []
  const make = async (opts: any) => {
    calls.push(opts)
    return { isSuccess: true, getData: () => data, getErrorMessages: () => [], errors: [] } as never
  }
  return { b24: { actions: { v3: { call: { make } } } } as never, calls }
}

describe('AggregateV3', () => {
  it('sends select + filter and unwraps the nested result buckets', async () => {
    const { b24, calls } = makeB24({ sum: { amount: '12345.6700' }, count: { id: '87' } })
    const action = new AggregateV3(b24, makeLogger())

    const response = await action.make({
      method: 'some.entity.aggregate',
      select: { sum: { amount: 'totalAmount' }, count: ['id'] },
      params: { filter: [['status', '=', 'NEW']] }
    })

    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual({ sum: { amount: '12345.6700' }, count: { id: '87' } })
    // Golden request shape: ONLY select + filter — no pagination/order/cursor leak.
    expect(calls[0].method).toBe('some.entity.aggregate')
    expect(calls[0].params).toEqual({
      select: { sum: { amount: 'totalAmount' }, count: ['id'] },
      filter: [['status', '=', 'NEW']]
    })
  })

  it('hands the values back as sent — strings, not numbers', async () => {
    // The action deliberately does not convert. `Number()` is right for a count
    // and wrong for a money sum, and only the caller knows which they hold.
    const { b24 } = makeB24({ count: { id: '27' }, avg: { id: '14.0000' } })
    const data = (await new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: { count: ['id'], avg: ['id'] }
    })).getData()

    // A string, not a number — `toBe` is `Object.is`, so this pins the type too.
    expect(data?.count?.['id']).toBe('27')
    // MySQL picks the scale for an average; it is not a JS number's idea of 14.
    expect(data?.avg?.['id']).toBe('14.0000')
  })

  it('passes null through when the filter matched no rows', async () => {
    // `count` still answers '0' — only `count` has a zero over an empty set.
    // Anything that would have to average or total nothing is null, and a caller
    // who assumed a number would have called a number method on it.
    const { b24 } = makeB24({ count: { id: '0' }, sum: { userId: null }, avg: { id: null } })
    const data = (await new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: { count: ['id'], sum: ['userId'], avg: ['id'] },
      params: { filter: [['id', '>', 99_999]] }
    })).getData()

    expect(data?.count?.['id']).toBe('0')
    expect(data?.sum?.['userId']).toBeNull()
    expect(data?.avg?.['id']).toBeNull()
  })

  it('accepts both the list form and the map form per function', async () => {
    const { b24, calls } = makeB24({ avg: { price: '99.5000' }, min: { createdAt: '1' } })
    const response = await new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: { avg: { price: 'avgPrice' }, min: ['createdAt'] }
    })
    expect(response.isSuccess).toBe(true)
    expect(calls[0].params.select).toEqual({ avg: { price: 'avgPrice' }, min: ['createdAt'] })
    // The KEY, not its value. `params.filter = undefined` reads as `undefined`
    // just as an absent key does, and `toEqual` treats an undefined-valued key
    // as absent too — so neither a value check nor the golden-shape comparison
    // can tell "no filter sent" from "filter sent as undefined". Only this can.
    expect('filter' in calls[0].params).toBe(false)
    expect(Object.keys(calls[0].params)).toEqual(['select'])
  })

  it('sends the alias but keys the answer by field, not by alias', async () => {
    const { b24, calls } = makeB24({ count: { id: '27' } })
    const data = (await new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: { count: { id: 'total' } }
    })).getData()

    // The alias goes out…
    expect(calls[0].params.select).toEqual({ count: { id: 'total' } })
    // …and does not come back — `total` names the column inside the portal's own
    // query. `toEqual` is the assertion: an extra `total` key would fail it.
    expect(data).toEqual({ count: { id: '27' } })
  })

  it('falls back to a single-level result and warns if the envelope is not double-nested', async () => {
    const warnings: string[] = []
    const { b24 } = makeB24Raw({ result: { count: { id: '5' } } })

    const response = await new AggregateV3(b24, makeLogger(warnings)).make({
      method: 'x.aggregate',
      select: { count: ['id'] }
    })
    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual({ count: { id: '5' } })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/no nested 'result.result' envelope/)
  })

  it('returns empty buckets without a word when the envelope is intact but empty', async () => {
    // `{ result: { result: undefined } }` is the nested shape with nothing in it.
    // The envelope is the one the portal sends, so there is nothing to warn
    // about — this is the arm that must stay quiet.
    const warnings: string[] = []
    const { b24 } = makeB24(undefined)
    const response = await new AggregateV3(b24, makeLogger(warnings)).make({
      method: 'x.aggregate',
      select: { count: ['id'] }
    })
    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual({})
    expect(warnings).toEqual([])
  })

  it('warns rather than answering silently when the result is not an object at all', async () => {
    // `{ result: null }` reaches neither unwrapping branch. Returning `{}` from
    // here without a word would let a changed envelope read as a legitimately
    // empty answer — and empty buckets are not that: an aggregate over no rows
    // answers `null` per function, with the keys present.
    const warnings: string[] = []
    const { b24 } = makeB24Raw({ result: null })
    const response = await new AggregateV3(b24, makeLogger(warnings)).make({
      method: 'x.aggregate',
      select: { count: ['id'] }
    })
    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual({})
    expect(warnings.join(' ')).toMatch(/no usable 'result' object/)
  })

  it('surfaces errors and returns !isSuccess when the API fails', async () => {
    const { b24 } = makeB24({}, false)
    const response = await new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: { count: ['id'] }
    })
    expect(response.isSuccess).toBe(false)
    expect(response.getErrorMessages().join(' ')).toMatch(/boom/)
  })

  it('rejects an unknown aggregate function without sending anything', async () => {
    const { b24, calls } = makeB24({})
    await expect(new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      // @ts-expect-error — median is not an aggregate function
      select: { median: ['price'] }
    })).rejects.toMatchObject({ code: 'JSSDK_AGGREGATE_V3_INVALID_FUNCTION', status: 400 })
    expect(calls).toHaveLength(0)
  })

  it('rejects a malformed select value without sending anything', async () => {
    const { b24, calls } = makeB24({})
    await expect(new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      // @ts-expect-error — must be array or { field: alias } map
      select: { sum: 'amount' }
    })).rejects.toMatchObject({ code: 'JSSDK_AGGREGATE_V3_INVALID_SELECT', status: 400 })
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['no function at all', {}],
    ['an empty list', { count: [] }],
    ['an empty map', { count: {} }]
  ])('refuses a select with no aggregate column — %s', async (_name, select) => {
    // Each of these is answered by the portal with
    // `BITRIX_REST_V3_EXCEPTION_INTERNAL_INTERNALEXCEPTION` / "Что-то пошло не
    // так" — measured, all three. A 500 is not a soft error, so it is rethrown
    // after the whole retry budget, for a request that was never going to work.
    const { b24, calls } = makeB24({})
    await expect(new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: select as never
    })).rejects.toMatchObject({ code: 'JSSDK_AGGREGATE_V3_INVALID_SELECT', status: 400 })
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['an empty list beside a full one', { count: ['id'], sum: [] }],
    ['an empty map beside a full one', { count: ['id'], sum: {} }]
  ])('allows %s — the portal does', async (_name, select) => {
    // Measured: both answer 200 with the `count` bucket. The guard counts columns
    // across the whole select for this reason. A per-function check would have
    // refused `sum: wantRevenue ? ['amount'] : []`, which is a shape a caller
    // reasonably writes and the portal reasonably answers — and a false
    // rejection has no way around it, unlike the round trip it would save.
    const { b24, calls } = makeB24({ count: { id: '29' } })
    const response = await new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: select as never
    })
    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual({ count: { id: '29' } })
    expect(calls).toHaveLength(1)
  })
})
