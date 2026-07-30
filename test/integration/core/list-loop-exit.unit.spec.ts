/**
 * Loop-exit invariants for the v2 cursor-pagination helpers.
 *
 * `CallListV2.make` / `FetchListV2.make` used to drive a `do { … } while (isContinue)`
 * where every exit assigned `isContinue = false` immediately before its `break`. The
 * flag was dead, so it was removed and the loop became `while (true)` — which means a
 * missed exit is now an infinite loop against a live REST API rather than an early
 * return. `test/integration/core/list-cursor-id-key.unit.spec.ts` covers four of the
 * five exits; these are the two it does not reach.
 *
 * Every case asserts the CALL COUNT, not just the returned data — that is the
 * assertion that fails loudly if an exit is ever turned back into a fall-through.
 *
 * A `.unit.spec.ts` — no portal, `call.make` is a stub.
 */
import { describe, it, expect } from 'vitest'
import { FetchListV2 } from '../../../packages/jssdk/src/core/actions/v2/fetch-list'
import { CallListV2 } from '../../../packages/jssdk/src/core/actions/v2/call-list'

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
 * A `_b24` stub whose `call.make` reports success but hands back no payload, and
 * counts how many times it was asked. `AjaxResult.getData()` returns `undefined`
 * only on a non-success response, so this shape is defensive rather than
 * reachable in production — but it is the one deleted `isContinue = false` that
 * cannot be checked by reading the diff.
 */
function makeB24WithoutData(data: undefined | null) {
  const state = { calls: 0 }
  const make = async () => {
    state.calls += 1
    return {
      isSuccess: true,
      getData: () => data,
      getErrorMessages: () => [],
      errors: [] as Array<[number, Error]>
    } as never
  }
  return { b24: { actions: { v2: { call: { make } } } } as never, state }
}

describe('v2 list helpers exit their `while (true)` loop on every branch', () => {
  it('callList: a success response carrying no data returns an empty success after one call', async () => {
    const { b24, state } = makeB24WithoutData(undefined)
    const { logger, warnings } = makeLogger()

    const result = await new CallListV2(b24, logger).make<Item>({
      method: 'crm.item.list',
      idKey: 'id',
      customKeyForResult: 'items'
    })

    expect(result.isSuccess).toBe(true)
    expect(result.getData()).toEqual([])
    expect(state.calls).toBe(1) // the loop must stop, not spin
    expect(warnings).toEqual([])
  })

  it('fetchList: a success response carrying no data yields nothing after one call', async () => {
    const { b24, state } = makeB24WithoutData(null)
    const { logger, warnings } = makeLogger()

    const collected: Item[] = []
    for await (const chunk of new FetchListV2(b24, logger).make<Item>({
      method: 'crm.item.list',
      idKey: 'id',
      customKeyForResult: 'items'
    })) {
      collected.push(...chunk)
    }

    expect(collected).toEqual([])
    expect(state.calls).toBe(1)
    expect(warnings).toEqual([])
  })

  it('fetchList: an API failure throws SdkError instead of breaking out silently', async () => {
    // The one loop exit with no `break` at all — fetchList throws where callList
    // collects the errors onto its Result. Pinned so the asymmetry stays deliberate.
    const state = { calls: 0 }
    const make = async () => {
      state.calls += 1
      return {
        isSuccess: false,
        getData: () => undefined,
        getErrorMessages: () => ['ACCESS_DENIED'],
        errors: [] as Array<[number, Error]>
      } as never
    }
    const { logger } = makeLogger()

    const generator = new FetchListV2(
      { actions: { v2: { call: { make } } } } as never,
      logger
    ).make<Item>({
      method: 'crm.item.list',
      idKey: 'id',
      customKeyForResult: 'items'
    })

    await expect(generator.next()).rejects.toMatchObject({
      code: 'JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V2',
      status: 500
    })
    expect(state.calls).toBe(1)
  })

  it('callList: an API failure surfaces the errors on the Result after one call', async () => {
    const state = { calls: 0 }
    const make = async () => {
      state.calls += 1
      return {
        isSuccess: false,
        getData: () => undefined,
        getErrorMessages: () => ['ACCESS_DENIED'],
        errors: [[0, new Error('ACCESS_DENIED')]] as Array<[number, Error]>
      } as never
    }
    const { logger } = makeLogger()

    const result = await new CallListV2(
      { actions: { v2: { call: { make } } } } as never,
      logger
    ).make<Item>({
      method: 'crm.item.list',
      idKey: 'id',
      customKeyForResult: 'items'
    })

    expect(result.isSuccess).toBe(false)
    expect(result.getErrorMessages()).toContain('ACCESS_DENIED')
    expect(state.calls).toBe(1)
  })
})
