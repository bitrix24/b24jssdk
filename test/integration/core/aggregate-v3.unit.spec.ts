/**
 * Unit tests for the v3 `aggregate` action. Mock `actions.v3.call.make`; no
 * portal (no module on the reference portal exposes `*.aggregate` yet).
 */
import { describe, it, expect } from 'vitest'
import { AggregateV3 } from '../../../packages/jssdk/src/core/actions/v3/aggregate'

function makeLogger() {
  return { warning: () => {}, error: () => {}, info: () => {}, log: () => {}, debug: () => {}, trace: () => {} } as never
}

/**
 * Mock b24 whose `actions.v3.call.make` records params and returns the §7 nested
 * `{ result: { result: <buckets> } }` envelope.
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

describe('AggregateV3', () => {
  it('sends select + filter and unwraps the nested result buckets', async () => {
    const { b24, calls } = makeB24({ sum: { amount: 12345 }, count: { id: 87 } })
    const action = new AggregateV3(b24, makeLogger())

    const response = await action.make({
      method: 'some.entity.aggregate',
      select: { sum: { amount: 'totalAmount' }, count: ['id'] },
      params: { filter: [['status', '=', 'NEW']] }
    })

    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual({ sum: { amount: 12345 }, count: { id: 87 } })
    // golden request shape: ONLY select + filter — no pagination/order/cursor leak
    expect(calls[0].method).toBe('some.entity.aggregate')
    expect(calls[0].params).toEqual({
      select: { sum: { amount: 'totalAmount' }, count: ['id'] },
      filter: [['status', '=', 'NEW']]
    })
  })

  it('falls back to single-level result and warns if the envelope is not double-nested', async () => {
    const warnings: string[] = []
    const logger = { warning: (m: string) => warnings.push(m), error: () => {}, info: () => {}, log: () => {}, debug: () => {}, trace: () => {} } as never
    // server returns buckets directly under `result`, not `result.result`
    const make = async () => ({
      isSuccess: true,
      getData: () => ({ result: { count: { id: 5 } } }),
      getErrorMessages: () => [],
      errors: []
    } as never)
    const b24 = { actions: { v3: { call: { make } } } } as never

    const response = await new AggregateV3(b24, logger).make({ method: 'x.aggregate', select: { count: ['id'] } })
    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual({ count: { id: 5 } })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/no nested 'result.result' envelope/)
  })

  it('accepts both the list form and the map form per function', async () => {
    const { b24, calls } = makeB24({ avg: { price: 99.5 }, min: { createdAt: 1 } })
    const response = await new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: { avg: { price: 'avgPrice' }, min: ['createdAt'] }
    })
    expect(response.isSuccess).toBe(true)
    expect(calls[0].params.select).toEqual({ avg: { price: 'avgPrice' }, min: ['createdAt'] })
    expect(calls[0].params.filter).toBeUndefined()
  })

  it('rejects an unknown aggregate function', async () => {
    const { b24 } = makeB24({})
    await expect(new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      // @ts-expect-error — median is not an aggregate function
      select: { median: ['price'] }
    })).rejects.toThrow(/not an aggregate function/)
  })

  it('rejects a malformed select value', async () => {
    const { b24 } = makeB24({})
    await expect(new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      // @ts-expect-error — must be array or { field: alias } map
      select: { sum: 'amount' }
    })).rejects.toThrow(/must be a string\[\]/)
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

  it('returns empty buckets when the payload has none', async () => {
    const { b24 } = makeB24(undefined)
    const response = await new AggregateV3(b24, makeLogger()).make({
      method: 'x.aggregate',
      select: { count: ['id'] }
    })
    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual({})
  })
})
