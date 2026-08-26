/**
 * #279 — the v3 list actions require the array filter, and say so.
 *
 * `TypeCallParamsV3.filter` deliberately accepts both the v3 array of triples and
 * the v2 object dialect, for backward compatibility. That union is fine for a
 * single `call`, which forwards the filter untouched — but NOT for `callList` /
 * `fetchList`, which emulate keyset pagination by appending
 * `[cursorIdKey, '>', cursor]` to the filter on every page. An array is not a
 * preference there; it is the only shape the mechanism can extend.
 *
 * Before this, the object form was accepted by the types and then threw
 * `filter is not iterable` from a spread one page into the walk — a runtime
 * failure on a shape the public type and the docs both promise. The type now
 * narrows it away at compile time, and this guard turns the JavaScript caller's
 * version of the same mistake into an error that names the fix.
 *
 * Pure logic, no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { CallListV3 } from '../../../packages/jssdk/src/core/actions/v3/call-list'
import { FetchListV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-list'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'

const logger = {
  warning: async () => {},
  error: async () => {},
  info: async () => {},
  log: async () => {},
  debug: async () => {},
  trace: async () => {}
} as never

/** One page of two rows, then an empty page so the walk terminates. */
function makeB24() {
  const seen: unknown[] = []
  let n = 0
  const make = async (options: { params?: { filter?: unknown } }) => {
    seen.push(options.params?.filter)
    n += 1
    const items = n === 1 ? [{ id: '1' }, { id: '2' }] : []
    return {
      isSuccess: true,
      getData: () => ({ result: { items } }),
      getErrorMessages: () => [],
      errors: [] as Array<[string, Error]>
    } as never
  }
  return { b24: { actions: { v3: { call: { make } } } } as never, seen }
}

const V2_OBJECT_FILTER = { '>id': 100 } as never

describe('#279 v3 list actions reject the v2 object filter', () => {
  it('callList throws a named SdkError instead of "filter is not iterable"', async () => {
    const { b24 } = makeB24()

    await expect(
      new CallListV3(b24, logger).make({
        method: 'tasks.task.list',
        customKeyForResult: 'items',
        params: { filter: V2_OBJECT_FILTER }
      })
    ).rejects.toThrow(SdkError)
  })

  it('the message names the code and the fix', async () => {
    const { b24 } = makeB24()

    // `rejects.toMatchObject`, not `.catch(err => expect(...))`. The `.catch`
    // form passes VACUOUSLY when the promise resolves — the callback simply
    // never runs, no assertion executes, and vitest reports green. Verified:
    // with the guard neutered AND the spread made object-tolerant, so the call
    // succeeds, the `.catch` version stayed green while the test above went
    // red. A test for an error message must fail when there is no error.
    await expect(
      new CallListV3(b24, logger).make({
        method: 'tasks.task.list',
        customKeyForResult: 'items',
        params: { filter: V2_OBJECT_FILTER }
      })
    ).rejects.toMatchObject({
      code: 'JSSDK_ACTION_V3_LIST_FILTER_NOT_ARRAY',
      // The point of the guard: the old failure named neither the argument that
      // was wrong nor what to write instead.
      message: expect.stringContaining('FilterV3.build')
    })
  })

  it('fetchList reports the same code, not just the same class', async () => {
    // Without the guard this path also throws — but a TypeError, not an
    // SdkError. Asserting the code as well as the class is what distinguishes
    // "guarded" from "crashed in a different way".
    const { b24 } = makeB24()

    await expect((async () => {
      const pages = new FetchListV3(b24, logger).make({
        method: 'tasks.task.list',
        customKeyForResult: 'items',
        params: { filter: V2_OBJECT_FILTER }
      })
      for await (const _page of pages) { /* drained to reach the throw */ }
    })()).rejects.toMatchObject({ code: 'JSSDK_ACTION_V3_LIST_FILTER_NOT_ARRAY' })
  })

  it('fetchList throws the same way — it is generator-based, so it must be drained', async () => {
    const { b24 } = makeB24()

    await expect((async () => {
      const pages = new FetchListV3(b24, logger).make({
        method: 'tasks.task.list',
        customKeyForResult: 'items',
        params: { filter: V2_OBJECT_FILTER }
      })
      for await (const _page of pages) { /* drained to reach the throw */ }
    })()).rejects.toThrow(SdkError)
  })

  it('accepts the array form and extends it with the cursor condition', async () => {
    const { b24, seen } = makeB24()

    const result = await new CallListV3(b24, logger).make({
      method: 'tasks.task.list',
      customKeyForResult: 'items',
      params: { filter: [['stageId', '=', 'NEW']] }
    })

    expect(result.isSuccess).toBe(true)
    // The caller's condition survives, and the cursor condition is appended —
    // which is exactly what the object form could not support.
    expect(seen[0]).toEqual([['stageId', '=', 'NEW'], ['id', '>', 0]])
  })

  it('accepts no filter at all', async () => {
    const { b24, seen } = makeB24()

    const result = await new CallListV3(b24, logger).make({
      method: 'tasks.task.list',
      customKeyForResult: 'items'
    })

    expect(result.isSuccess).toBe(true)
    expect(seen[0]).toEqual([['id', '>', 0]])
  })
})
