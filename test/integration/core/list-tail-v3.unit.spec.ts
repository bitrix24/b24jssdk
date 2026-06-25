/**
 * Unit tests for the v3 native `tail` (keyset cursor) helpers `fetchTail` /
 * `callTail`. Unlike `fetchList`, these drive the server `tail` action with its
 * native `cursor: { field, value, order, limit }` parameter (v3 reference §6.2)
 * instead of injecting a `[field, '>', n]` filter.
 *
 * A `.unit.spec.ts` — no real portal: the helpers run against a mock `call.make`
 * that pages by reading `params.cursor.value` and caps each page at `pageSize`.
 */
import { describe, it, expect } from 'vitest'
import { FetchTailV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-tail'
import { CallTailV3 } from '../../../packages/jssdk/src/core/actions/v3/call-tail'

type Item = Record<string, unknown>

function makeLogger() {
  const warnings: string[] = []
  const logger = {
    warning: (m: string) => warnings.push(m),
    error: () => {},
    info: () => {},
    log: () => {},
    debug: () => {},
    trace: () => {}
  }
  return { logger: logger as never, warnings }
}

/**
 * Mock `_b24` whose `actions.v3.call.make` serves `items` by reading the native
 * `cursor.value` from the request (proving the cursor advances), capping each
 * page at `pageSize`.
 */
function makeB24(opts: { customKey: string, items: Item[], idField: string, pageSize?: number }) {
  const pageSize = opts.pageSize ?? 50
  const calls: any[] = []
  const make = async (callOpts: any) => {
    calls.push(structuredClone(callOpts.params))
    const after = Number(callOpts.params?.cursor?.value ?? 0)
    const slice = opts.items
      .filter(it => Number(it[opts.idField]) > after)
      .slice(0, pageSize)
    return {
      isSuccess: true,
      getData: () => ({ result: { [opts.customKey]: slice } }),
      getErrorMessages: () => [],
      errors: [] as Array<[number, Error]>
    } as never
  }
  return { b24: { actions: { v3: { call: { make } } } } as never, calls }
}

function rows(n: number, idField: string): Item[] {
  return Array.from({ length: n }, (_, i) => ({ [idField]: String(i + 1), title: `row ${i + 1}` }))
}

describe('v3 native tail helpers (fetchTail / callTail)', () => {
  it('fetchTail: pages through every record via the native cursor', async () => {
    const { b24, calls } = makeB24({ customKey: 'items', items: rows(120, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      params: { select: ['id', 'title'] },
      cursorField: 'id',
      customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(120)
    expect(warnings).toEqual([])
    expect(calls).toHaveLength(3) // 50 + 50 + 20
    expect(calls[0].cursor).toEqual({ field: 'id', value: 0, order: 'ASC', limit: 50 })
    expect(calls[1].cursor.value).toBe('50') // advanced from the last item's id
    expect(calls[2].cursor.value).toBe('100')
    expect(calls[0].filter).toBeUndefined() // cursor is NOT injected into filter
  })

  it('callTail: returns every record as one array', async () => {
    const { b24 } = makeB24({ customKey: 'items', items: rows(110, 'id'), idField: 'id' })
    const { logger } = makeLogger()

    const result = await new CallTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      cursorField: 'id',
      customKeyForResult: 'items'
    })

    expect(result.isSuccess).toBe(true)
    expect(result.getData()).toHaveLength(110)
  })

  it('fetchTail: a server page cap below `limit` does not truncate the result', async () => {
    const { b24, calls } = makeB24({ customKey: 'items', items: rows(120, 'id'), idField: 'id', pageSize: 50 })
    const { logger } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      cursorField: 'id',
      customKeyForResult: 'items',
      limit: 100 // larger than the server cap (50)
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(120) // not truncated to the first 50
    // proves the helper does NOT stop after the first page<limit: 50 + 50 + 20
    expect(calls).toHaveLength(3)
  })

  it('fetchTail: auto-selects the cursor field when select omits it', async () => {
    const { b24, calls } = makeB24({ customKey: 'items', items: rows(10, 'id'), idField: 'id' })
    const { logger } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      params: { select: ['title'] }, // cursor field 'id' missing
      cursorField: 'id',
      customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(10)
    expect(calls[0].select).toEqual(['title', 'id']) // cursor field appended
  })

  it('fetchTail: warns when the cursor field is also used in filter', async () => {
    const { b24 } = makeB24({ customKey: 'items', items: rows(5, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      params: { filter: [['id', '>', 0]] },
      cursorField: 'id',
      customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }

    expect(collected.length).toBeGreaterThan(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/must not appear in `filter`/)
  })

  it('callTail: surfaces errors and returns !isSuccess when the API fails', async () => {
    const make = async () => ({
      isSuccess: false,
      getErrorMessages: () => ['boom'],
      errors: [[0, new Error('boom')]]
    } as never)
    const { logger } = makeLogger()
    const result = await new CallTailV3({ actions: { v3: { call: { make } } } } as never, logger).make<Item>({
      method: 'main.eventlog.tail', cursorField: 'id', customKeyForResult: 'items'
    })
    expect(result.isSuccess).toBe(false)
    expect(result.getErrorMessages().join(' ')).toMatch(/boom/)
  })

  it('fetchTail: an empty result set yields nothing', async () => {
    const { b24, calls } = makeB24({ customKey: 'items', items: rows(0, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()
    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail', cursorField: 'id', customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }
    expect(collected).toHaveLength(0)
    expect(calls).toHaveLength(1)
    expect(warnings).toEqual([])
  })

  it('fetchTail: warns and stops on a full page whose cursorField is absent from items', async () => {
    let n = 0
    const make = async () => {
      n += 1
      return {
        isSuccess: true,
        getData: () => ({ result: { items: Array.from({ length: 50 }, (_, i) => ({ title: `t${i}` })) } }),
        getErrorMessages: () => [],
        errors: []
      } as never
    }
    const { logger, warnings } = makeLogger()
    const collected: Item[] = []
    for await (const chunk of new FetchTailV3({ actions: { v3: { call: { make } } } } as never, logger).make<Item>({
      method: 'main.eventlog.tail', cursorField: 'id', customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }
    expect(collected).toHaveLength(50) // first full page only
    expect(n).toBe(1) // no second request with an undefined cursor
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/no value could be read/)
  })

  it('fetchTail: initialValue resumes the cursor from a given point', async () => {
    const { b24, calls } = makeB24({ customKey: 'items', items: rows(120, 'id'), idField: 'id' })
    const { logger } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      cursorField: 'id',
      customKeyForResult: 'items',
      initialValue: 100 // skip ids 1..100
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(20) // ids 101..120 only
    expect(calls[0].cursor.value).toBe(100) // first page starts from the given value
  })

  it('callTail: a server page cap below `limit` returns every record', async () => {
    const { b24 } = makeB24({ customKey: 'items', items: rows(130, 'id'), idField: 'id', pageSize: 50 })
    const { logger } = makeLogger()

    const result = await new CallTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      cursorField: 'id',
      customKeyForResult: 'items',
      limit: 1000 // far above the server cap
    })

    expect(result.isSuccess).toBe(true)
    expect(result.getData()).toHaveLength(130) // 50 + 50 + 30
  })

  it('fetchTail: an exact-multiple result set ends via the empty confirmation page', async () => {
    const { b24, calls } = makeB24({ customKey: 'items', items: rows(100, 'id'), idField: 'id', pageSize: 50 })
    const { logger } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail', cursorField: 'id', customKeyForResult: 'items', limit: 50
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(100)
    expect(calls).toHaveLength(3) // 50 + 50 + one empty confirmation page
  })

  it('fetchTail: omits `select` when none is given and the cursor field is the default id', async () => {
    const { b24, calls } = makeB24({ customKey: 'items', items: rows(5, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail', customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(5)
    expect(calls[0].select).toBeUndefined() // no select sent; rely on server defaults
    expect(warnings).toEqual([]) // default 'id' cursor → no warning
  })

  it('fetchTail: warns when select is omitted with a non-default cursor field', async () => {
    const { b24 } = makeB24({ customKey: 'items', items: rows(3, 'createdTime'), idField: 'createdTime' })
    const { logger, warnings } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail', cursorField: 'createdTime', customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(3)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/non-default cursorField "createdTime"/)
  })

  it('fetchTail: DESC without initialValue throws (the server would page below the default 0)', async () => {
    const { b24 } = makeB24({ customKey: 'items', items: rows(10, 'id'), idField: 'id' })
    const { logger } = makeLogger()
    const gen = new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail', cursorField: 'id', order: 'DESC', customKeyForResult: 'items'
    })
    await expect(gen.next()).rejects.toThrow(/order "DESC" requires an explicit `initialValue`/)
  })

  it('callTail: DESC without initialValue throws', async () => {
    const { b24 } = makeB24({ customKey: 'items', items: rows(10, 'id'), idField: 'id' })
    const { logger } = makeLogger()
    await expect(new CallTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail', cursorField: 'id', order: 'DESC', customKeyForResult: 'items'
    })).rejects.toThrow(/order "DESC" requires an explicit `initialValue`/)
  })

  it('fetchTail: DESC with initialValue is allowed and forwards order to the cursor', async () => {
    const { b24, calls } = makeB24({ customKey: 'items', items: rows(5, 'id'), idField: 'id' })
    const { logger } = makeLogger()
    const collected: Item[] = []
    for await (const chunk of new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail', cursorField: 'id', order: 'DESC', initialValue: 1000, customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }
    expect(calls[0].cursor.order).toBe('DESC')
    expect(calls[0].cursor.value).toBe(1000)
  })
})
