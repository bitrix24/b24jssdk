/**
 * Regression: a cursor that does not advance must stop the walk.
 *
 * Every list/tail helper pages by reading a cursor out of the page it just
 * received and sending it back. When the server does not apply the page
 * condition, the same page keeps arriving and **nothing in any of these loops
 * notices**: the page is full, so the end-of-data checks stay silent, and the
 * walk runs until the eager helpers exhaust memory or the streaming ones yield
 * the same rows for ever.
 *
 * Measured on a live portal, `restApi:v2` `tasks.task.list` with `idKey: 'id'`
 * and no `cursorIdKey`: the walk was capped at three pages and collected 150
 * rows of which **50 were unique**, the cursor reading 3 every time. The
 * response spells the id lowercase while the filter accepts it uppercase, so
 * `>id` matches nothing the server knows and is dropped. That is the
 * configuration #185 added `cursorIdKey` for — note it is *not* the default
 * `idKey: 'ID'`, which fails the other way (`lastItem['ID']` is `undefined`, so
 * the walk warns and stops after one page; pinned in
 * `list-cursor-id-key.unit.spec.ts`).
 *
 * Both API versions are covered because both can stall and neither could
 * notice: v3 through the shared `keysetPaginate` driver, v2 through the two
 * inline loops in `actions/v2/`.
 *
 * The walk **rejects** rather than folding the failure into a `Result` the way a
 * soft REST error does. For the list walkers the appended condition is either
 * honoured from the first request or dropped from the first request, so every
 * row held at that point is page one repeated and returning it would hand back
 * duplicates that read as data. The streaming helpers have already yielded those
 * pages — pinned below, because it is the caller's problem to undo.
 *
 * The mock servers here stop after a bounded number of pages. That is
 * deliberate: with the guard removed these tests then fail on the assertion
 * immediately instead of spinning until vitest's timeout, which reports nothing
 * about the cursor.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (the helpers run against a
 * mock `call.make`).
 */
import { describe, it, expect } from 'vitest'
import { CallListV2 } from '../../../packages/jssdk/src/core/actions/v2/call-list'
import { FetchListV2 } from '../../../packages/jssdk/src/core/actions/v2/fetch-list'
import { CallListV3 } from '../../../packages/jssdk/src/core/actions/v3/call-list'
import { FetchListV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-list'
import { CallTailV3 } from '../../../packages/jssdk/src/core/actions/v3/call-tail'
import { FetchTailV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-tail'

type Item = Record<string, unknown>

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

/**
 * A server that ignores the page condition: it answers with the same full page
 * every time, whatever cursor it is sent. After `stopAfter` pages it answers
 * empty — see the file header for why the mock is bounded rather than endless.
 */
function ignoringServer(opts: { customKey: string, page: Item[], stopAfter?: number }) {
  const stopAfter = opts.stopAfter ?? 6
  const calls: unknown[] = []

  const make = async (callOpts: { params: unknown }) => {
    calls.push(structuredClone(callOpts.params))
    const slice = calls.length > stopAfter ? [] : opts.page
    return {
      isSuccess: true,
      getData: () => ({ result: { [opts.customKey]: slice } }),
      getErrorMessages: () => [],
      errors: [] as Array<[number, Error]>
    } as never
  }

  return { make, calls }
}

function b24V2(make: unknown) {
  return { actions: { v2: { call: { make } } } } as never
}

function b24V3(make: unknown) {
  return { actions: { v3: { call: { make } } } } as never
}

const PAGE = [{ id: '1', title: 'row 1' }, { id: '2', title: 'row 2' }]

/**
 * The v2 walkers hardcode a page of 50 and stop on `length < 50`, so a stalled
 * v2 page has to be exactly that size to get past the end-of-data check and
 * reach the cursor at all. The v3 driver measures against the largest page it
 * has seen, so two rows are enough there.
 */
const FULL_V2_PAGE = Array.from({ length: 50 }, (_, index) => ({
  id: String(index + 1),
  title: `row ${index + 1}`
}))

describe('a cursor that does not move', () => {
  describe('restApi:v2 — where the stall was measured', () => {
    it('callList rejects instead of collecting the same page for ever', async () => {
      // The measured configuration: the response id is readable (`idKey: 'id'`),
      // so the walk gets past the "no numeric id" warning, but the request
      // filters on `>id`, which this server ignores.
      const { make, calls } = ignoringServer({ customKey: 'tasks', page: FULL_V2_PAGE })
      const { logger, warnings } = makeLogger()
      const action = new CallListV2(b24V2(make), logger)

      await expect(action.make<Item>({
        method: 'tasks.task.list',
        idKey: 'id',
        customKeyForResult: 'tasks'
      })).rejects.toMatchObject({
        code: STALLED,
        // 500, not the 400 the client-side guards use: from inside the loop
        // there is no way to tell a caller who named the wrong field from a
        // portal that ignores the condition on this method, so reporting a
        // caller error would be a guess. Asserted because the choice is
        // argued for at length in `_cursor-stalled.ts` and nothing else pinned
        // it — 400 passed the whole suite.
        status: 500
      })

      // Two requests: the first establishes the cursor, the second returns it
      // unchanged. Nothing beyond that is paid for.
      expect(calls).toHaveLength(2)
      // Not the `no numeric id` branch — that one is a warning, and confusing
      // the two is the whole reason this test names the configuration.
      expect(warnings).toEqual([])
    })

    it('the v2 message names the v2 action and the option to check', async () => {
      // The v2 call sites pass their own `actionLabel` literal, and nothing
      // read the message on this path: replacing either label with a nonsense
      // string passed the whole suite.
      const { make } = ignoringServer({ customKey: 'tasks', page: FULL_V2_PAGE })
      const { logger } = makeLogger()

      const error = await new CallListV2(b24V2(make), logger).make<Item>({
        method: 'tasks.task.list',
        idKey: 'id',
        customKeyForResult: 'tasks'
      }).catch((error_: Error) => error_)

      expect((error as Error).message).toContain('callList.make:')
      expect((error as Error).message).toContain('cursorIdKey')

      const streaming = ignoringServer({ customKey: 'tasks', page: FULL_V2_PAGE })
      const fetchError = await (async () => {
        for await (const _chunk of new FetchListV2(b24V2(streaming.make), makeLogger().logger).make<Item>({
          method: 'tasks.task.list',
          idKey: 'id',
          customKeyForResult: 'tasks'
        })) { /* drain until it throws */ }
      })().catch((error_: Error) => error_)

      expect((fetchError as Error).message).toContain('fetchList.make:')
      expect((fetchError as Error).message).toContain('cursorIdKey')
    })

    it('fetchList rejects too, after the consumer already holds the duplicates', async () => {
      const { make } = ignoringServer({ customKey: 'tasks', page: FULL_V2_PAGE })
      const { logger } = makeLogger()
      const action = new FetchListV2(b24V2(make), logger)

      const seen: unknown[] = []
      await expect((async () => {
        for await (const chunk of action.make<Item>({
          method: 'tasks.task.list',
          idKey: 'id',
          customKeyForResult: 'tasks'
        })) {
          seen.push(...chunk.map(row => row['id']))
        }
      })()).rejects.toMatchObject({ code: STALLED })

      // Exactly the duplication the error warns about: page one, then page one
      // again. A `for await` consumer that persisted these has to undo them.
      expect(seen).toHaveLength(100)
      expect(new Set(seen).size).toBe(50)
    })
  })

  describe('restApi:v3 — the shared keyset driver', () => {
    it('callList rejects, and the message names the list options', async () => {
      const { make, calls } = ignoringServer({ customKey: 'items', page: PAGE })
      const { logger } = makeLogger()
      const action = new CallListV3(b24V3(make), logger)

      const error = await action.make<Item>({
        method: 'main.eventlog.list',
        customKeyForResult: 'items'
      }).catch((error_: Error) => error_)

      expect(error).toMatchObject({ code: STALLED })
      expect(calls).toHaveLength(2)
      // The wording is the other half of the guard's job: it has to name the
      // options this action actually has, and read like its filter guard
      // (`callList.make: …`) rather than like the internal log label.
      expect((error as Error).message).toContain('callList.make:')
      expect((error as Error).message).toContain('cursorIdKey')
    })

    it('fetchList rejects after yielding what it read', async () => {
      const { make } = ignoringServer({ customKey: 'items', page: PAGE })
      const { logger } = makeLogger()
      const action = new FetchListV3(b24V3(make), logger)

      const seen: unknown[] = []
      const thrown = await (async () => {
        for await (const chunk of action.make<Item>({
          method: 'main.eventlog.list',
          customKeyForResult: 'items'
        })) {
          seen.push(...chunk.map(row => row['id']))
        }
      })().catch((error_: Error) => error_)

      expect(thrown).toMatchObject({ code: STALLED })

      expect(seen).toEqual(['1', '2', '1', '2'])
      // The streaming helpers carry their own `actionLabel`; only the eager
      // ones had their wording checked, so a wrong label on either survived.
      expect((thrown as Error).message).toContain('fetchList.make:')
      expect((thrown as Error).message).toContain('cursorIdKey')
    })

    it('callTail rejects, and the message names cursorField — not cursorIdKey', async () => {
      const { make, calls } = ignoringServer({ customKey: 'items', page: PAGE })
      const { logger } = makeLogger()
      const action = new CallTailV3(b24V3(make), logger)

      const error = await action.make<Item>({
        method: 'main.eventlog.tail',
        params: { select: ['id'] },
        customKeyForResult: 'items'
      }).catch((error_: Error) => error_)

      expect(error).toMatchObject({ code: STALLED })
      expect(calls).toHaveLength(2)
      // `ActionCallTailV3` has no `idKey` and no `cursorIdKey`. Sending a tail
      // caller after either would send them after an option TypeScript rejects,
      // which is what the single shared message used to do.
      expect((error as Error).message).toContain('callTail.make:')
      expect((error as Error).message).toContain('cursorField')
      expect((error as Error).message).not.toContain('cursorIdKey')
    })

    it('fetchTail rejects too — the walker is shared, the wiring is not', async () => {
      const { make } = ignoringServer({ customKey: 'items', page: PAGE })
      const { logger } = makeLogger()
      const action = new FetchTailV3(b24V3(make), logger)

      const seen: unknown[] = []
      const thrown = await (async () => {
        for await (const chunk of action.make<Item>({
          method: 'main.eventlog.tail',
          params: { select: ['id'] },
          customKeyForResult: 'items'
        })) {
          seen.push(...chunk.map(row => row['id']))
        }
      })().catch((error_: Error) => error_)

      expect(thrown).toMatchObject({ code: STALLED })

      expect(seen).toEqual(['1', '2', '1', '2'])
      expect((thrown as Error).message).toContain('fetchTail.make:')
      expect((thrown as Error).message).toContain('cursorField')
      expect((thrown as Error).message).not.toContain('cursorIdKey')
    })
  })

  it('a cursor that changes only its type is movement, not a stall', async () => {
    // `===` rather than `==`, and this is the input that tells them apart:
    // `2 == '2'` is true, so a loose comparison would call the second page a
    // stall and throw on a walk that is making progress. The cost of being
    // strict is one extra request when a server changes only the type of an
    // identical cursor — and the guard still fires on the page after that,
    // which is the second half of what this pins.
    //
    // Page 1 ends at the number 2, page 2 at the string '2', page 3 at '2'
    // again: strict equality pages through the first two and stalls on the
    // third. A loose one would have thrown after page 2 and never reached it.
    const pages: Item[][] = [
      [{ id: 1 }, { id: 2 }],
      [{ id: '1' }, { id: '2' }],
      [{ id: '1' }, { id: '2' }]
    ]
    const calls: unknown[] = []
    const make = async (callOpts: { params: unknown }) => {
      calls.push(structuredClone(callOpts.params))
      const slice = pages[calls.length - 1] ?? []
      return {
        isSuccess: true,
        getData: () => ({ result: { items: slice } }),
        getErrorMessages: () => [],
        errors: [] as Array<[number, Error]>
      } as never
    }

    const { logger } = makeLogger()
    const error = await new CallTailV3(b24V3(make), logger).make<Item>({
      method: 'main.eventlog.tail',
      params: { select: ['id'] },
      customKeyForResult: 'items'
    }).catch((error_: Error) => error_)

    // Reached the third page: the type flip was not mistaken for a stall.
    expect(calls).toHaveLength(3)
    expect(error).toMatchObject({ code: STALLED })
  })

  it('a cursor field that is not a scalar stops the walk instead of defeating it', async () => {
    // The hole an equality check alone leaves open. The tail walkers read the
    // cursor straight off the response — `lastItem[cursorField]`, an `any` — so
    // a `cursorField` naming an object-valued field (ordinary in a v3 response)
    // yields a fresh reference on every page. `next === cursor` between two
    // distinct objects is never true, so a stalled server would loop for ever
    // *past* the guard.
    //
    // Such a value is treated as no cursor at all: the same warn-and-stop path
    // an unreadable cursor already took, because the mistake is the same one —
    // `cursorField` does not name a scalar — and the warning already says so.
    const { make, calls } = ignoringServer({
      customKey: 'items',
      page: [{ id: '1', owner: { id: 7 } }, { id: '2', owner: { id: 8 } }]
    })
    const { logger, warnings } = makeLogger()
    const action = new CallTailV3(b24V3(make), logger)

    const response = await action.make<Item>({
      method: 'main.eventlog.tail',
      params: { select: ['id', 'owner'] },
      cursorField: 'owner',
      customKeyForResult: 'items'
    })

    expect(response.isSuccess).toBe(true)
    expect(calls).toHaveLength(1)
    expect(response.getData()).toHaveLength(2)
    expect(warnings.some(w => w.includes('cursorField "owner"'))).toBe(true)
  })
})
