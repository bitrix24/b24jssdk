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

    // Descending values are progress here, not a cycle: the walk completes.
    expect(result.isSuccess).toBe(true)
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
})

describe('the comparison itself', () => {
  it.each([
    ['forward numbers', 10, 5, 'ASC', true],
    ['equal numbers', 5, 5, 'ASC', false],
    ['backwards numbers', 5, 10, 'ASC', false],
    ['descending walk going down', 5, 10, 'DESC', true],
    ['descending walk going up', 10, 5, 'DESC', false],
    ['ISO timestamps, same length', '2026-09-14T00:00:01Z', '2026-09-14T00:00:00Z', 'ASC', true]
  ] as const)('%s', (_label, next, previous, direction, expected) => {
    expect(cursorProgressed(next, previous, direction)).toBe(expected)
  })

  // Values the check cannot order are not called backwards. A server that
  // changes only the type of a cursor, or an id spelled without padding
  // (`'9'` then `'10'`), must keep walking — the equality check still catches a
  // true repeat underneath.
  it.each([
    ['a type change', 100, '100'],
    ['unpadded string ids', '10', '9'],
    ['NaN', Number.NaN, 5]
  ] as const)('lets %s through rather than guessing', (_label, next, previous) => {
    expect(cursorProgressed(next, previous, 'ASC')).toBe(true)
  })
})
