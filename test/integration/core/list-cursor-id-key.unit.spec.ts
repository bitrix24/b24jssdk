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
    expect(warnings[0]).toMatch(/idKey "ID" is missing/)
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
})
