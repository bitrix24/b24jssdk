/**
 * Unit tests for the soft-error fan-out of the shared v3 keyset driver
 * (`_keyset-paginate.ts`, used by callList / fetchList / callTail / fetchTail).
 *
 * The happy-path loop (50-cap stop, idKey/cursorIdKey, DESC, cursor-stop
 * warnings) is covered by `list-cursor-id-key` / `list-tail-v3`. This file pins
 * the part the refactor centralized into `KeysetPaginationError`:
 *   - eager `call*` fold the error into the `Result` AND keep the records already
 *     accumulated (partial result), preserving the original error key;
 *   - streaming `fetch*` rethrow as their action-specific `SdkError`.
 *
 * Each mock serves one full page, then fails on the next request — so the error
 * happens mid-walk, after data has been collected.
 */
import { describe, it, expect } from 'vitest'
import { FetchListV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-list'
import { CallListV3 } from '../../../packages/jssdk/src/core/actions/v3/call-list'
import { FetchTailV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-tail'
import { CallTailV3 } from '../../../packages/jssdk/src/core/actions/v3/call-tail'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'

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
 * Mock `_b24` that returns one full page of `pageSize` items on the first call,
 * then a soft error on every later call. The first page's ids start at 1 so the
 * helper has a numeric cursor to advance with.
 */
function makeFailOnSecondPage(pageSize = 50) {
  let n = 0
  const make = async () => {
    n += 1
    if (n === 1) {
      const items = Array.from({ length: pageSize }, (_, i) => ({ id: String(i + 1), title: `row ${i + 1}` }))
      return {
        isSuccess: true,
        getData: () => ({ result: { items } }),
        getErrorMessages: () => [],
        errors: [] as Array<[string, Error]>
      } as never
    }
    return {
      isSuccess: false,
      getData: () => undefined,
      getErrorMessages: () => ['boom'],
      errors: [['cmd-7', new Error('boom')]] as Array<[string, Error]>
    } as never
  }
  return { b24: { actions: { v3: { call: { make } } } } as never, callCount: () => n }
}

describe('v3 keyset driver — soft-error fan-out', () => {
  it('callList: keeps the page collected before the error and folds the error in', async () => {
    const { b24 } = makeFailOnSecondPage(50)
    const { logger } = makeLogger()

    const result = await new CallListV3(b24, logger).make<Item>({
      method: 'tasks.task.list',
      idKey: 'id',
      customKeyForResult: 'items',
      limit: 50
    })

    expect(result.isSuccess).toBe(false)
    expect(result.getData()).toHaveLength(50) // partial data is preserved
    expect(result.getErrorMessages().join(' ')).toMatch(/boom/)
  })

  it('callList: preserves the original error key from response.errors', async () => {
    const { b24 } = makeFailOnSecondPage(50)
    const { logger } = makeLogger()

    const result = await new CallListV3(b24, logger).make<Item>({
      method: 'tasks.task.list',
      idKey: 'id',
      customKeyForResult: 'items',
      limit: 50
    })

    // The error must land under its original key ('cmd-7'), not a re-generated one.
    const byKey = result.getErrorsByKey()
    expect(Object.keys(byKey)).toContain('cmd-7')
    expect(byKey['cmd-7']?.message).toMatch(/boom/)
  })

  it('callTail: keeps the page collected before the error and folds the error in', async () => {
    const { b24 } = makeFailOnSecondPage(50)
    const { logger } = makeLogger()

    const result = await new CallTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      cursorField: 'id',
      customKeyForResult: 'items',
      limit: 50
    })

    expect(result.isSuccess).toBe(false)
    expect(result.getData()).toHaveLength(50) // partial data is preserved
    expect(result.getErrorMessages().join(' ')).toMatch(/boom/)
  })

  it('fetchList: rethrows a mid-walk soft error as the helper-specific SdkError', async () => {
    const { b24, callCount } = makeFailOnSecondPage(50)
    const { logger } = makeLogger()

    const gen = new FetchListV3(b24, logger).make<Item>({
      method: 'tasks.task.list',
      idKey: 'id',
      customKeyForResult: 'items',
      limit: 50
    })

    const first = await gen.next() // first page streams fine
    expect(first.value).toHaveLength(50)

    let caught: unknown
    try {
      await gen.next()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SdkError)
    expect((caught as SdkError).code).toBe('JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V3')
    expect((caught as SdkError).message).toMatch(/boom/)
    expect(callCount()).toBe(2) // first page + the failing request, then stop
  })

  it('fetchTail: rethrows a mid-walk soft error as the helper-specific SdkError', async () => {
    const { b24 } = makeFailOnSecondPage(50)
    const { logger } = makeLogger()

    const gen = new FetchTailV3(b24, logger).make<Item>({
      method: 'main.eventlog.tail',
      cursorField: 'id',
      customKeyForResult: 'items',
      limit: 50
    })

    const first = await gen.next()
    expect(first.value).toHaveLength(50)

    let caught: unknown
    try {
      await gen.next()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SdkError)
    expect((caught as SdkError).code).toBe('JSSDK_CORE_B24_FETCH_TAIL_METHOD_API_V3')
    expect((caught as SdkError).message).toMatch(/boom/)
  })
})
