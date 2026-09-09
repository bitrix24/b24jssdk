/**
 * The runtime half of #518: what each of the four batch modes actually hands
 * back.
 *
 * `batch-overloads.types.spec.ts` pins what the compiler now promises for each
 * combination of arguments. Overloads are unchecked assertions — TypeScript
 * takes the author's word that the implementation matches — so the promise has
 * to be measured against the running code, or the overloads become a
 * confidently-typed lie, which is worse than the union they replaced.
 *
 * The two files describe the same table. Keep them in step.
 */
import { describe, expect, it, vi } from 'vitest'
import { BatchV2 } from '../../../packages/jssdk/src/core/actions/v2/batch'
import { BatchV3 } from '../../../packages/jssdk/src/core/actions/v3/batch'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import { Result } from '../../../packages/jssdk/src/core/result'
import { LoggerFactory } from '../../../packages/jssdk/src/logger'
import type { BatchCommandsArrayUniversal, BatchNamedCommandsUniversal } from '../../../packages/jssdk/src/index'

function commandResult(id: string) {
  return new AjaxResult({
    answer: { result: { id }, time: {} as never },
    query: { method: 'crm.item.get', params: {}, requestId: 'shape' },
    status: 200
  })
}

/** A client whose transport answers with one command result under `key`. */
function clientAnswering(key: string | number) {
  const inner = new Result<never>().setData({
    result: new Map([[key, commandResult('1')]])
  } as never)
  return { getHttpClient: () => ({ batch: vi.fn(async () => inner) }) } as never
}

const NAMED: BatchNamedCommandsUniversal = { first: { method: 'crm.item.get', params: {} } }
// Typed rather than `as never`. `never` is assignable to every overload, so the
// first one wins — which silently made the array cases assert the named shape
// while the runtime returned an array. Worth knowing generally: a `calls` value
// the compiler cannot place picks the first matching signature, and only a
// genuinely wide type falls through to the union.
const ARRAY: BatchCommandsArrayUniversal = [['crm.item.get', {}]]

describe('#518 the four batch shapes, measured', () => {
  it('named commands, no returnAjaxResult — an object of payloads', async () => {
    const res = await new BatchV2(clientAnswering('first'), LoggerFactory.createNullLogger())
      .make({ calls: NAMED })
    const data = res.getData() as Record<string, unknown>

    expect(Array.isArray(data)).toBe(false)
    expect(data.first).toEqual({ id: '1' })
    expect(data.first).not.toBeInstanceOf(AjaxResult)
  })

  it('named commands, returnAjaxResult: true — an object of AjaxResult', async () => {
    const res = await new BatchV2(clientAnswering('first'), LoggerFactory.createNullLogger())
      .make({ calls: NAMED, options: { returnAjaxResult: true } })
    const data = res.getData() as Record<string, AjaxResult<{ id: string }>>

    expect(Array.isArray(data)).toBe(false)
    expect(data.first).toBeInstanceOf(AjaxResult)
    expect(data.first!.getData()!.result).toEqual({ id: '1' })
  })

  it('array commands, no returnAjaxResult — an array of payloads', async () => {
    const res = await new BatchV2(clientAnswering(0), LoggerFactory.createNullLogger())
      .make({ calls: ARRAY })
    const data = res.getData() as unknown[]

    expect(Array.isArray(data)).toBe(true)
    expect(data[0]).toEqual({ id: '1' })
    expect(data[0]).not.toBeInstanceOf(AjaxResult)
  })

  it('array commands, returnAjaxResult: true — an array of AjaxResult', async () => {
    const res = await new BatchV2(clientAnswering(0), LoggerFactory.createNullLogger())
      .make({ calls: ARRAY, options: { returnAjaxResult: true } })
    const data = res.getData() as AjaxResult<{ id: string }>[]

    expect(Array.isArray(data)).toBe(true)
    expect(data[0]).toBeInstanceOf(AjaxResult)
    expect(data[0]!.getData()!.result).toEqual({ id: '1' })
  })

  it('v3 answers the same shapes — the overloads claim both, so both are measured', async () => {
    const named = await new BatchV3(clientAnswering('first'), LoggerFactory.createNullLogger())
      .make({ calls: NAMED })
    expect((named.getData() as Record<string, unknown>).first).toEqual({ id: '1' })

    const indexed = await new BatchV3(clientAnswering(0), LoggerFactory.createNullLogger())
      .make({ calls: ARRAY })
    expect(Array.isArray(indexed.getData())).toBe(true)
  })

  it('the array-of-command-objects form counts as an array, not as named', async () => {
    // `BatchCommandsObjectUniversal` is `CommandObject[]` — an array whose
    // entries happen to be objects. The dispatch is `Array.isArray(calls)`, so
    // it answers by index, and the overloads have to group it with the tuple
    // form rather than with the named record it superficially resembles.
    const res = await new BatchV2(clientAnswering(0), LoggerFactory.createNullLogger())
      .make({ calls: [{ method: 'crm.item.get', params: {} }] })
    expect(Array.isArray(res.getData())).toBe(true)
  })
})
