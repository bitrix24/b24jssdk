/**
 * #495 and #496 — the two gaps #493 left open in the cursor guard, and why one
 * check closes both.
 *
 * **#495: a cycle longer than one.** The stall guard compares the cursor it just
 * read against the **immediately preceding** one. A server that alternates
 * between two pages — `A, B, A, B, …` — never repeats that value, so the guard
 * never fires and the walk runs for ever, exactly as it did before #493. The
 * issue weighed a ring of the last N cursors (catches short cycles, costs
 * memory) and a hard page cap (catches everything, needs a default that does not
 * truncate a real export) against a direction check, and guessed the direction
 * check was the best value per line. It is, and for a reason worth stating: a
 * cycle has to step backwards somewhere, so catching the first backwards step
 * catches every cycle, of any length, for the price of one comparison — no set
 * of every cursor seen, which is the unbounded allocation that deferred the
 * issue.
 *
 * What makes the direction knowable: every walk here asks for rows **past** a
 * value. The list walkers append `[cursorIdKey, '>', cursor]`; the tail walkers
 * send `cursor: { field, value, order }`, read as `field > value` for ASC and
 * `field < value` for DESC. In an answer that honoured the condition the next
 * cursor is strictly past the last one, on every page.
 *
 * **#496: a short stalled page ended the walk silently.** The end-of-data check
 * ran before the cursor guard, so a page shorter than the largest seen ended the
 * walk as "end of data" whatever the cursor did — returning a truncated and
 * possibly overlapping result, reported as success. The issue called the fix
 * non-obvious, because a genuinely final short page whose last row repeats the
 * previous cursor would then throw instead of finishing. The same observation
 * settles it: a row at or before the cursor cannot be in an answer that honoured
 * a strictly-greater condition, **however short the page**. So a short page with
 * a repeated cursor is a server ignoring the condition, not the data running
 * out, and the checks can safely run first.
 *
 * Both are covered at all four insertion points, because all four can cycle and
 * none could notice: the two v2 inline loops and the shared v3 driver (which
 * serves list and tail alike).
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect } from 'vitest'
import { CallListV2 } from '../../../packages/jssdk/src/core/actions/v2/call-list'
import { FetchListV2 } from '../../../packages/jssdk/src/core/actions/v2/fetch-list'
import { CallListV3 } from '../../../packages/jssdk/src/core/actions/v3/call-list'
import { FetchListV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-list'
import { CallTailV3 } from '../../../packages/jssdk/src/core/actions/v3/call-tail'
import { FetchTailV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-tail'
import { cursorProgressed } from '../../../packages/jssdk/src/core/actions/_cursor-progress'

type Item = { id: string, title: string }

const BACKWARDS = 'JSSDK_ACTION_CURSOR_WENT_BACKWARDS'
const STALLED = 'JSSDK_ACTION_CURSOR_STALLED'

function makeLogger() {
  const warnings: string[] = []
  const logger = {
    warning: async (m: string) => warnings.push(m),
    error: async () => {},
    info: async () => {},
    log: async () => {},
    debug: async () => {},
    trace: async () => {}
  }
  return { logger: logger as never, warnings }
}

function b24V2(make: unknown) {
  return { actions: { v2: { call: { make } } } } as never
}

function b24V3(make: unknown) {
  return { actions: { v3: { call: { make } } } } as never
}

const page = (ids: number[]): Item[] => ids.map(id => ({ id: String(id), title: `row ${id}` }))

/**
 * Drives either walker shape to completion: `callList` resolves a result,
 * `fetchList` yields batches and does nothing at all until it is consumed.
 */
async function drain(walk: unknown): Promise<void> {
  const it = walk as AsyncIterable<unknown>
  if (typeof it?.[Symbol.asyncIterator] === 'function') {
    for await (const _batch of it) { /* consume */ }
    return
  }
  await walk
}

/** 50 rows, because the v2 walkers stop on any page shorter than their fixed 50. */
const v2Page = (start: number): Item[] => page(Array.from({ length: 50 }, (_, i) => start + i))

/**
 * A server that alternates between two full pages: ids 1-50, then 51-100, then
 * 1-50 again. Each page differs from the one before, so the "did not move"
 * check never fires — the cursor goes 50, 100, 50, 100 — and the walk repeats
 * for ever. `stopAfter` bounds the mock so a regression here fails the suite
 * rather than hanging it.
 */
function cyclingV2Server(stopAfter = 8) {
  const calls: unknown[] = []
  const make = async (callOpts: { params: unknown }) => {
    calls.push(structuredClone(callOpts.params))
    const slice = calls.length > stopAfter
      ? []
      : (calls.length % 2 === 1 ? v2Page(1) : v2Page(51))
    return {
      isSuccess: true,
      getData: () => ({ result: slice }),
      getErrorMessages: () => [],
      errors: [] as Array<[number, Error]>
    } as never
  }
  return { make, calls }
}

function cyclingV3Server(customKey: string, stopAfter = 8) {
  const calls: unknown[] = []
  const make = async (callOpts: { params: unknown }) => {
    calls.push(structuredClone(callOpts.params))
    const slice = calls.length > stopAfter
      ? []
      : (calls.length % 2 === 1 ? page([1, 2]) : page([3, 4]))
    return {
      isSuccess: true,
      getData: () => ({ result: { [customKey]: slice } }),
      getErrorMessages: () => [],
      errors: [] as Array<[number, Error]>
    } as never
  }
  return { make, calls }
}

describe('a cursor that cycles rather than repeating (#495)', () => {
  it('@apiV2 callList rejects on the first backwards step', async () => {
    const server = cyclingV2Server()
    const action = new CallListV2(b24V2(server.make), makeLogger().logger)

    const error = await action.make({ method: 'tasks.task.list', idKey: 'id' }).catch((e: unknown) => e)

    expect((error as { code?: string })?.code).toBe(BACKWARDS)
    // Two pages out, one back: the walk stops on the third request, not never.
    expect(server.calls).toHaveLength(3)
  })

  it('@apiV2 fetchList rejects too, after yielding what it read', async () => {
    const server = cyclingV2Server()
    const action = new FetchListV2(b24V2(server.make), makeLogger().logger)

    const yielded: Item[][] = []
    const error = await (async () => {
      try {
        for await (const batch of action.make({ method: 'tasks.task.list', idKey: 'id' })) {
          yielded.push(batch as Item[])
        }
        return null
      } catch (e: unknown) {
        return e as { code?: string }
      }
    })()

    expect(error?.code).toBe(BACKWARDS)
    // The consumer already holds the repeated page — which is what the message says.
    expect(yielded).toHaveLength(3)
  })

  it('@apiV3 callList rejects on the first backwards step', async () => {
    const server = cyclingV3Server('items')
    const action = new CallListV3(b24V3(server.make), makeLogger().logger)

    const error = await action
      .make({ method: 'tasks.task.list', customKeyForResult: 'items', idKey: 'id' })
      .catch((e: unknown) => e)

    expect((error as { code?: string })?.code).toBe(BACKWARDS)
    expect(server.calls).toHaveLength(3)
  })

  it('@apiV3 fetchList rejects too', async () => {
    const server = cyclingV3Server('items')
    const action = new FetchListV3(b24V3(server.make), makeLogger().logger)

    const error = await (async () => {
      try {
        for await (const _batch of action.make({ method: 'tasks.task.list', customKeyForResult: 'items', idKey: 'id' })) {
          void _batch
        }
        return null
      } catch (e: unknown) {
        return e as { code?: string }
      }
    })()

    expect(error?.code).toBe(BACKWARDS)
  })

  // A DESC tail walk pages by `field < value`, so for it "backwards" is upwards.
  // A check hardcoded to ASC would reject every correct DESC walk on page two.
  it('@apiV3 callTail reads DESC the other way round', async () => {
    const descending = (() => {
      const calls: unknown[] = []
      const make = async (callOpts: { params: unknown }) => {
        calls.push(structuredClone(callOpts.params))
        const slice = calls.length > 3 ? [] : page([100 - calls.length * 2, 99 - calls.length * 2])
        return {
          isSuccess: true,
          getData: () => ({ result: { items: slice } }),
          getErrorMessages: () => [],
          errors: [] as Array<[number, Error]>
        } as never
      }
      return { make, calls }
    })()

    const action = new CallTailV3(b24V3(descending.make), makeLogger().logger)

    const result = await action.make({
      method: 'main.eventlog.tail',
      customKeyForResult: 'items',
      cursorField: 'id',
      order: 'DESC',
      initialValue: 1000
    })

    // Descending values are progress here, not a cycle: the walk completes, and
    // it walks — asserting only `isSuccess` would not tell a three-page walk
    // from one that gave up after the first page.
    expect(result.isSuccess).toBe(true)
    expect((result.getData() as Item[]).map(row => row.id)).toEqual(['98', '97', '96', '95', '94', '93'])
    expect(descending.calls).toHaveLength(4)
  })

  // `fetchTail` derives its direction separately from `callTail`, and hardcoding
  // it to ASC there passed the whole suite: the existing tail spec checks the
  // `order` sent on the first request, which is not the same thing as the
  // direction the guard is told about on the second.
  it('@apiV3 fetchTail derives DESC for the guard too', async () => {
    const calls: unknown[] = []
    const make = async (callOpts: { params: unknown }) => {
      calls.push(structuredClone(callOpts.params))
      const slice = calls.length > 3 ? [] : page([100 - calls.length * 2, 99 - calls.length * 2])
      return {
        isSuccess: true,
        getData: () => ({ result: { items: slice } }),
        getErrorMessages: () => [],
        errors: [] as Array<[number, Error]>
      } as never
    }

    const action = new FetchTailV3(b24V3(make), makeLogger().logger)

    const seen: string[] = []
    for await (const batch of action.make({
      method: 'main.eventlog.tail',
      customKeyForResult: 'items',
      cursorField: 'id',
      order: 'DESC',
      initialValue: 1000
    })) {
      seen.push(...(batch as Item[]).map(row => row.id))
    }

    expect(seen).toEqual(['98', '97', '96', '95', '94', '93'])
  })
})

describe('a short page that is actually a stall (#496)', () => {
  /**
   * Page one is full; page two is shorter **and** ends on the same id. Before
   * the fix the short page ended the walk as end-of-data, and `callList`
   * resolved with the overlapping rows and no error at all.
   */
  function shortStalledV3(customKey: string) {
    const calls: unknown[] = []
    const make = async (callOpts: { params: unknown }) => {
      calls.push(structuredClone(callOpts.params))
      const slice = calls.length === 1 ? page([1, 2, 3]) : page([2, 3])
      return {
        isSuccess: true,
        getData: () => ({ result: { [customKey]: slice } }),
        getErrorMessages: () => [],
        errors: [] as Array<[number, Error]>
      } as never
    }
    return { make, calls }
  }

  it('@apiV3 is reported rather than returned as a truncated success', async () => {
    const server = shortStalledV3('items')
    const action = new CallListV3(b24V3(server.make), makeLogger().logger)

    const error = await action
      .make({ method: 'tasks.task.list', customKeyForResult: 'items', idKey: 'id' })
      .catch((e: unknown) => e)

    expect((error as { code?: string })?.code).toBe(STALLED)
  })

  // The v2 loops are a separate implementation of the same ordering, and were a
  // blind spot: reverting the reorder there left the whole suite green. Page one
  // is the full 50 the v2 walkers expect; page two is short and ends on an id
  // already read, so it is a server ignoring `>ID`, not the data running out.
  it.each([
    ['callList', CallListV2],
    ['fetchList', FetchListV2]
  ] as const)('@apiV2 %s reports a short stalled page instead of returning it', async (_label, Action) => {
    const calls: unknown[] = []
    const make = async (callOpts: { params: unknown }) => {
      calls.push(structuredClone(callOpts.params))
      const slice = calls.length === 1 ? v2Page(1) : page([48, 49, 50])
      return {
        isSuccess: true,
        getData: () => ({ result: slice }),
        getErrorMessages: () => [],
        errors: [] as Array<[number, Error]>
      } as never
    }

    const action = new Action(b24V2(make), makeLogger().logger)

    const error = await drain(action.make({ method: 'tasks.task.list', idKey: 'id' })).catch((e: unknown) => e)

    expect((error as { code?: string })?.code).toBe(STALLED)
    expect(calls).toHaveLength(2)
  })

  // …and the same walk ending on a short page that *did* advance must finish.
  it.each([
    ['callList', CallListV2],
    ['fetchList', FetchListV2]
  ] as const)('@apiV2 %s still ends quietly on a short page that advanced', async (_label, Action) => {
    const calls: unknown[] = []
    const make = async (callOpts: { params: unknown }) => {
      calls.push(structuredClone(callOpts.params))
      const slice = calls.length === 1 ? v2Page(1) : page([51, 52])
      return {
        isSuccess: true,
        getData: () => ({ result: slice }),
        getErrorMessages: () => [],
        errors: [] as Array<[number, Error]>
      } as never
    }

    const action = new Action(b24V2(make), makeLogger().logger)

    await drain(action.make({ method: 'tasks.task.list', idKey: 'id' }))

    expect(calls).toHaveLength(2)
  })

  // The other half of the same ordering: a short page whose cursor *did* move is
  // end of data, and must still finish quietly. Without this, "check the cursor
  // first" could be satisfied by throwing on every short page.
  it('@apiV3 a short page with a moving cursor still ends the walk', async () => {
    const server = (() => {
      const calls: unknown[] = []
      const make = async (callOpts: { params: unknown }) => {
        calls.push(structuredClone(callOpts.params))
        const slice = calls.length === 1 ? page([1, 2, 3]) : page([4, 5])
        return {
          isSuccess: true,
          getData: () => ({ result: { items: slice } }),
          getErrorMessages: () => [],
          errors: [] as Array<[number, Error]>
        } as never
      }
      return { make, calls }
    })()

    const action = new CallListV3(b24V3(server.make), makeLogger().logger)

    const result = await action.make({ method: 'tasks.task.list', customKeyForResult: 'items', idKey: 'id' })

    expect(result.isSuccess).toBe(true)
    expect((result.getData() as Item[]).map(row => row.id)).toEqual(['1', '2', '3', '4', '5'])
    // Two requests: the short second page ended it, no third round trip.
    expect(server.calls).toHaveLength(2)
  })

  // The warning for an unreadable cursor belongs to a full page. On the page
  // that proves end-of-data there is nothing to read it for, and warning there
  // would fire at the close of an ordinary walk.
  it('@apiV3 says nothing about a cursor it did not need', async () => {
    const server = (() => {
      const calls: unknown[] = []
      const make = async (callOpts: { params: unknown }) => {
        calls.push(structuredClone(callOpts.params))
        const slice = calls.length === 1
          ? page([1, 2, 3])
          : [{ title: 'no id here' }] as never as Item[]
        return {
          isSuccess: true,
          getData: () => ({ result: { items: slice } }),
          getErrorMessages: () => [],
          errors: [] as Array<[number, Error]>
        } as never
      }
      return { make, calls }
    })()

    const { logger, warnings } = makeLogger()
    const action = new CallListV3(b24V3(server.make), logger)

    await action.make({ method: 'tasks.task.list', customKeyForResult: 'items', idKey: 'id' })

    expect(warnings.filter(w => w.includes('cursor'))).toHaveLength(0)
  })

  // The v2 walkers read the cursor before they call a short page the end, so a
  // short *final* page whose rows carry no parsable `idKey` now reaches the
  // no-cursor branch that used to be unreachable for it. End of data is not a
  // misconfiguration, so it must stay silent — the warning is for a full page
  // that could not be advanced past.
  it.each([
    ['callList', CallListV2],
    ['fetchList', FetchListV2]
  ] as const)('@apiV2 %s says nothing about an idKey a finished walk did not need', async (_label, Action) => {
    const make = async () => ({
      isSuccess: true,
      getData: () => ({ result: [{ title: 'no id here' }] as never as Item[] }),
      getErrorMessages: () => [],
      errors: [] as Array<[number, Error]>
    } as never)

    const { logger, warnings } = makeLogger()
    const action = new Action(b24V2(make), logger)

    await drain(action.make({ method: 'tasks.task.list', idKey: 'id' }))

    expect(warnings.filter(w => w.includes('idKey'))).toHaveLength(0)
  })

  // …and the same walk stopped by a *full* page it cannot advance past must
  // still say so, or the guard above would have silenced a real diagnosis.
  it.each([
    ['callList', CallListV2],
    ['fetchList', FetchListV2]
  ] as const)('@apiV2 %s still reports an idKey it could not read on a full page', async (_label, Action) => {
    const make = async () => ({
      isSuccess: true,
      getData: () => ({ result: v2Page(1).map(({ title }) => ({ title })) as never as Item[] }),
      getErrorMessages: () => [],
      errors: [] as Array<[number, Error]>
    } as never)

    const { logger, warnings } = makeLogger()
    const action = new Action(b24V2(make), logger)

    await drain(action.make({ method: 'tasks.task.list', idKey: 'id' }))

    expect(warnings.filter(w => w.includes('idKey'))).toHaveLength(1)
  })
})

describe('the comparison itself', () => {
  it.each([
    ['forward numbers', 10, 5, 'ASC', true],
    ['equal numbers', 5, 5, 'ASC', false],
    ['backwards numbers', 5, 10, 'ASC', false],
    ['descending walk going down', 5, 10, 'DESC', true],
    ['descending walk going up', 10, 5, 'DESC', false],
    ['ISO timestamps in one zone', '2026-09-14T00:00:01Z', '2026-09-14T00:00:00Z', 'ASC', true],
    ['ISO timestamps in one offset', '2026-09-14T00:00:01+03:00', '2026-09-14T00:00:00+03:00', 'ASC', true],
    // Without a string pair expected `false`, disabling the direction check for
    // every string cursor would leave this suite green — and strings are what a
    // tail walk over a datetime field actually carries.
    ['ISO timestamps going backwards', '2026-09-14T00:00:00Z', '2026-09-14T00:00:01Z', 'ASC', false],
    ['ISO timestamps in a DESC walk', '2026-09-14T00:00:00Z', '2026-09-14T00:00:01Z', 'DESC', true],
    ['zero-padded ids', '0010', '0009', 'ASC', true],
    ['zero-padded ids going backwards', '0009', '0010', 'ASC', false],
    // The shapes the ISO pattern deliberately admits, each pinned so that
    // narrowing the pattern stops being a silent loss of detection: a
    // space-separated datetime, and sub-second precision.
    ['space-separated datetimes', '2026-09-14 00:00:00Z', '2026-09-14 00:00:01Z', 'ASC', false],
    ['sub-second datetimes', '2026-09-14T00:00:00.250Z', '2026-09-14T00:00:00.500Z', 'ASC', false],
    // Equality answers `false` whatever the types — including a pair the
    // direction check would decline to order.
    ['an equal pair the check cannot order', 'abc', 'abc', 'ASC', false]
  ] as const)('%s', (_label, next, previous, direction, expected) => {
    expect(cursorProgressed(next, previous, direction)).toBe(expected)
  })

  // Values the check cannot order are not called backwards. A server that
  // changes only the type of a cursor, or an id spelled without padding
  // (`'9'` then `'10'`), must keep walking — the equality check still catches a
  // true repeat underneath.
  //
  // The two that matter most are the last pair. Across a DST transition
  // `02:00:00+01:00` is 01:00Z and genuinely later than `02:59:00+02:00`
  // (00:59Z), yet sorts before it as text — and both are the same length, so
  // length alone would not save it. And a mixed-case field under MySQL's
  // default case-insensitive collation orders `a1` before `B1` while JS orders
  // them the other way round. Judging either would abort a healthy walk.
  it.each([
    ['a type change', 100, '100'],
    ['unpadded string ids', '10', '9'],
    ['NaN', Number.NaN, 5],
    ['timestamps stated in different zones', '2024-10-27T02:00:00+01:00', '2024-10-27T02:59:00+02:00'],
    // A datetime with no offset at all — what a MySQL `DATETIME` column prints.
    // The clocks going back repeat the wall-clock hour, so 02:15 standard time
    // is a later instant than 02:30 summer time and still sorts before it.
    // "Neither states a zone" is not "both state the same zone".
    ['timestamps stating no zone', '2024-10-27 02:15:00', '2024-10-27 02:30:00'],
    // `'T'` is 0x54 and `' '` is 0x20, so a `T`-form value sorts after every
    // space-form value with the same date, whatever the time says.
    ['timestamps written with different separators', '2026-01-01 00:00:02Z', '2026-01-01T00:00:01Z'],
    ['mixed-case ids a collation may order either way', 'B1', 'a1']
  ] as const)('lets %s through rather than guessing', (_label, next, previous) => {
    expect(cursorProgressed(next, previous, 'ASC')).toBe(true)
  })
})
