/**
 * Regression for issue #185: cursor pagination in the list helpers must not
 * assume the REQUEST field name equals the RESPONSE field name.
 *
 * `tasks.task.list` sorts and filters by `ID` (uppercase) but returns task
 * objects with a lowercase `id`. The old code drove `order`, the `>` cursor
 * filter and the response read all from a single `idKey`, so:
 *   - idKey: 'ID'  → request was correct, but lastItem['ID'] was undefined →
 *                    pagination silently stopped after the first 50 records;
 *   - idKey: 'id'  → response read worked, but the request ordered/filtered by a
 *                    lowercase field tasks.task.list does not accept.
 *
 * The fix adds `cursorIdKey` (request order + `>` filter), defaulting to `idKey`
 * (the response read). A `.unit.spec.ts` — no real Bitrix24 portal: the helpers
 * are exercised against a mock `call.make`.
 */
import { describe, it, expect } from 'vitest'
import { FetchListV2 } from '../../../packages/jssdk/src/core/actions/v2/fetch-list'
import { CallListV2 } from '../../../packages/jssdk/src/core/actions/v2/call-list'
import { FetchListV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-list'
import { CallListV3 } from '../../../packages/jssdk/src/core/actions/v3/call-list'

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
 * A mock `_b24` whose `actions.v{2,3}.call.make` serves `items` page by page,
 * using the cursor it finds in the request (so it proves the request actually
 * advances). Each request's params are deep-snapshotted into `calls` because v2
 * mutates a single `requestParams` object across iterations.
 */
function makeB24(opts: {
  version: 'v2' | 'v3'
  customKey: string
  items: Item[]
  idField: string
  pageSize?: number
}) {
  const pageSize = opts.pageSize ?? 50
  const calls: any[] = []

  const make = async (callOpts: any) => {
    calls.push(structuredClone(callOpts.params))
    let after = 0
    if (opts.version === 'v2') {
      const filter = callOpts.params.filter || {}
      const gtKey = Object.keys(filter).find(k => k.startsWith('>') && k[1] !== '=')
      after = Number(gtKey ? filter[gtKey] : 0)
    } else {
      const filter: any[] = callOpts.params.filter || []
      const triple = [...filter].reverse().find((t: any[]) => t[1] === '>')
      after = Number(triple ? triple[2] : 0)
    }
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

  const actions = opts.version === 'v2'
    ? { v2: { call: { make } } }
    : { v3: { call: { make } } }
  return { b24: { actions } as never, calls }
}

function rows(n: number, idField: string): Item[] {
  return Array.from({ length: n }, (_, i) => ({ [idField]: String(i + 1), title: `row ${i + 1}` }))
}

describe('list helpers cursorIdKey (issue #185)', () => {
  it('v2 fetchList: tasks-like (request ID / response id) paginates every page', async () => {
    const { b24, calls } = makeB24({ version: 'v2', customKey: 'tasks', items: rows(120, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()
    const action = new FetchListV2(b24, logger)

    const collected: Item[] = []
    for await (const chunk of action.make<Item>({
      method: 'tasks.task.list',
      params: { select: ['ID', 'TITLE'] },
      idKey: 'id', // response field is lowercase
      cursorIdKey: 'ID', // request sorts/filters by uppercase
      customKeyForResult: 'tasks'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(120) // not truncated at the first 50
    expect(warnings).toEqual([])
    expect(calls).toHaveLength(3) // 50 + 50 + 20
    expect(calls[0].order).toEqual({ ID: 'ASC' }) // request orders by uppercase ID
    expect(calls[0].filter['>ID']).toBe(0)
    expect(calls[1].filter['>ID']).toBe(50) // cursor advanced from the lowercase response id
    expect(calls[2].filter['>ID']).toBe(100)
  })

  it('v2 fetchList: a wrong idKey stops after one page AND warns (the reported footgun)', async () => {
    const { b24 } = makeB24({ version: 'v2', customKey: 'tasks', items: rows(120, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()
    const action = new FetchListV2(b24, logger)

    const collected: Item[] = []
    for await (const chunk of action.make<Item>({
      method: 'tasks.task.list',
      // idKey omitted → defaults to 'ID', but the items only carry lowercase 'id'
      customKeyForResult: 'tasks'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(50) // exactly the symptom the user reported
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/idKey "ID"/)
    expect(warnings[0]).toMatch(/no numeric id could be read/)
    expect(warnings[0]).toMatch(/cursorIdKey/) // the message points at the fix
  })

  it('v2 fetchList: without cursorIdKey it defaults to idKey (back-compat)', async () => {
    const { b24, calls } = makeB24({ version: 'v2', customKey: 'items', items: rows(75, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()
    const action = new FetchListV2(b24, logger)

    const collected: Item[] = []
    for await (const chunk of action.make<Item>({
      method: 'crm.item.list',
      idKey: 'id',
      customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(75)
    expect(warnings).toEqual([])
    expect(calls[0].order).toEqual({ id: 'ASC' }) // cursorIdKey === idKey
    expect(calls[1].filter['>id']).toBe(50)
  })

  it('v2 callList: tasks-like decoupling returns every record in one array', async () => {
    const { b24, calls } = makeB24({ version: 'v2', customKey: 'tasks', items: rows(120, 'id'), idField: 'id' })
    const { logger } = makeLogger()
    const action = new CallListV2(b24, logger)

    const result = await action.make<Item>({
      method: 'tasks.task.list',
      idKey: 'id',
      cursorIdKey: 'ID',
      customKeyForResult: 'tasks'
    })

    expect(result.isSuccess).toBe(true)
    expect(result.getData()).toHaveLength(120)
    expect(calls[1].filter['>ID']).toBe(50)
  })

  it('v3 fetchList: cursorIdKey drives order + the [field,>,n] triple, keeping the user filter', async () => {
    const { b24, calls } = makeB24({ version: 'v3', customKey: 'items', items: rows(120, 'id'), idField: 'id' })
    const { logger } = makeLogger()
    const action = new FetchListV3(b24, logger)

    const collected: Item[] = []
    for await (const chunk of action.make<Item>({
      method: 'some.list',
      params: { filter: [['active', '=', 'Y']] },
      idKey: 'id',
      cursorIdKey: 'ID',
      customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(120)
    expect(calls[0].order).toEqual({ ID: 'ASC' })
    expect(calls[1].filter).toContainEqual(['active', '=', 'Y']) // existing filter preserved
    expect(calls[1].filter).toContainEqual(['ID', '>', 50]) // advanced cursor on cursorIdKey
  })

  it('v3 callList: tasks-like decoupling returns every record', async () => {
    const { b24, calls } = makeB24({ version: 'v3', customKey: 'items', items: rows(110, 'id'), idField: 'id' })
    const { logger } = makeLogger()
    const action = new CallListV3(b24, logger)

    const result = await action.make<Item>({
      method: 'some.list',
      idKey: 'id',
      cursorIdKey: 'ID',
      customKeyForResult: 'items'
    })

    expect(result.isSuccess).toBe(true)
    expect(result.getData()).toHaveLength(110)
    expect(calls[1].filter).toContainEqual(['ID', '>', 50])
  })

  // ── issue #253: server caps the page below the requested `limit` ─────────
  // `tasks.task.list` honours `limit` only up to 50 and silently truncates
  // anything larger (doc §6: "максимум 1000, всё больше — молча обрезается").
  // The v3 list helpers must not treat that first capped page as end-of-data —
  // they key the stop on the largest page seen, not on the requested `limit`.

  it('v3 fetchList: a server page cap below `limit` does not truncate the result', async () => {
    // request limit 100, but the mock server only ever returns 50 per page
    const { b24, calls } = makeB24({ version: 'v3', customKey: 'tasks', items: rows(120, 'id'), idField: 'id', pageSize: 50 })
    const { logger, warnings } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchListV3(b24, logger).make<Item>({
      method: 'tasks.task.list',
      idKey: 'id',
      cursorIdKey: 'ID',
      customKeyForResult: 'tasks',
      limit: 100 // larger than the server cap — must still page through everything
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(120) // NOT truncated to the first 50
    expect(warnings).toEqual([])
    expect(calls).toHaveLength(3) // 50 + 50 + 20 (last page shorter than the cap → stop)
    expect(calls[0].pagination).toEqual({ page: 0, limit: 100 }) // requested limit is still sent
  })

  it('v3 callList: a server page cap below `limit` returns every record', async () => {
    const { b24 } = makeB24({ version: 'v3', customKey: 'tasks', items: rows(130, 'id'), idField: 'id', pageSize: 50 })
    const { logger } = makeLogger()

    const result = await new CallListV3(b24, logger).make<Item>({
      method: 'tasks.task.list',
      idKey: 'id',
      cursorIdKey: 'ID',
      customKeyForResult: 'tasks',
      limit: 1000 // doc max; the mock server caps at 50 per page
    })

    expect(result.isSuccess).toBe(true)
    expect(result.getData()).toHaveLength(130) // 50 + 50 + 30, not stopped after page 1
  })

  it('v3 fetchList: an exact-multiple result set ends via the empty confirmation page', async () => {
    // 100 items, server cap 50 → two full pages, then one empty page confirms the end
    const { b24, calls } = makeB24({ version: 'v3', customKey: 'tasks', items: rows(100, 'id'), idField: 'id', pageSize: 50 })
    const { logger, warnings } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchListV3(b24, logger).make<Item>({
      method: 'tasks.task.list',
      idKey: 'id',
      cursorIdKey: 'ID',
      customKeyForResult: 'tasks',
      limit: 100
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(100) // every record, none dropped at the boundary
    expect(warnings).toEqual([])
    expect(calls).toHaveLength(3) // 50 + 50 + one empty confirmation page
  })

  it('v3 fetchList: a single short page costs one extra confirmation request (by design)', async () => {
    // 30 items, requested limit 50 — indistinguishable from a 50-cap on one page,
    // so the helper issues one extra request to confirm there is nothing after it.
    const { b24, calls } = makeB24({ version: 'v3', customKey: 'tasks', items: rows(30, 'id'), idField: 'id', pageSize: 50 })
    const { logger, warnings } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchListV3(b24, logger).make<Item>({
      method: 'tasks.task.list',
      idKey: 'id',
      cursorIdKey: 'ID',
      customKeyForResult: 'tasks',
      limit: 50
    })) {
      collected.push(...chunk)
    }

    expect(collected).toHaveLength(30)
    expect(warnings).toEqual([])
    expect(calls).toHaveLength(2) // 30 + one empty confirmation page
  })

  // ── review follow-ups (#191): negative + edge cases ──────────────────────

  it('v2 fetchList: a clean short last page does NOT warn', async () => {
    const { b24, calls } = makeB24({ version: 'v2', customKey: 'items', items: rows(30, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()
    const collected: Item[] = []
    for await (const chunk of new FetchListV2(b24, logger).make<Item>({
      method: 'crm.item.list', idKey: 'id', customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }
    expect(collected).toHaveLength(30)
    expect(calls).toHaveLength(1) // one short page, no second request
    expect(warnings).toEqual([]) // a short final page is a clean stop, not a misconfig
  })

  it('v2 fetchList: an empty result set yields nothing and does not warn', async () => {
    const { b24 } = makeB24({ version: 'v2', customKey: 'items', items: rows(0, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()
    const collected: Item[] = []
    for await (const chunk of new FetchListV2(b24, logger).make<Item>({
      method: 'crm.item.list', idKey: 'id', customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }
    expect(collected).toHaveLength(0)
    expect(warnings).toEqual([])
  })

  it('v2 fetchList: a full page of non-numeric ids warns and stops — never sends a NaN cursor', async () => {
    let calls = 0
    const make = async () => {
      calls += 1
      return {
        isSuccess: true,
        getData: () => ({ result: { items: Array.from({ length: 50 }, (_, i) => ({ id: `guid-${i}` })) } })
      } as never
    }
    const { logger, warnings } = makeLogger()
    const collected: Item[] = []
    for await (const chunk of new FetchListV2({ actions: { v2: { call: { make } } } } as never, logger).make<Item>({
      method: 'x.list', idKey: 'id', customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }
    expect(collected).toHaveLength(50) // stopped after the first full page
    expect(calls).toBe(1) // crucial: no second request carrying a NaN cursor
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/no numeric id could be read/)
  })

  it('v2 callList: returns !isSuccess and surfaces errors when the API fails', async () => {
    const make = async () => ({
      isSuccess: false,
      getErrorMessages: () => ['boom'],
      errors: [[0, new Error('boom')]]
    } as never)
    const { logger } = makeLogger()
    const result = await new CallListV2({ actions: { v2: { call: { make } } } } as never, logger).make<Item>({
      method: 'x.list', idKey: 'id', customKeyForResult: 'items'
    })
    expect(result.isSuccess).toBe(false)
    expect(result.getErrorMessages().join(' ')).toMatch(/boom/)
  })

  it('v3 fetchList: without cursorIdKey it defaults to idKey "id"', async () => {
    const { b24, calls } = makeB24({ version: 'v3', customKey: 'items', items: rows(60, 'id'), idField: 'id' })
    const { logger, warnings } = makeLogger()
    const collected: Item[] = []
    for await (const chunk of new FetchListV3(b24, logger).make<Item>({
      method: 'main.eventlog.list', customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }
    expect(collected).toHaveLength(60)
    expect(warnings).toEqual([])
    expect(calls[0].order).toEqual({ id: 'ASC' }) // default idKey 'id' drives the request
    expect(calls[1].filter).toContainEqual(['id', '>', 50])
  })

  it('v3 callList: warns and stops on a full page whose idKey is missing', async () => {
    let calls = 0
    const make = async () => {
      calls += 1
      return {
        isSuccess: true,
        getData: () => ({ result: { items: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })) } }),
        getErrorMessages: () => [],
        errors: []
      } as never
    }
    const { logger, warnings } = makeLogger()
    const result = await new CallListV3({ actions: { v3: { call: { make } } } } as never, logger).make<Item>({
      method: 'x.list', idKey: 'WRONG', customKeyForResult: 'items'
    })
    expect(result.getData()).toHaveLength(50)
    expect(calls).toBe(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/idKey "WRONG"/)
  })
})
