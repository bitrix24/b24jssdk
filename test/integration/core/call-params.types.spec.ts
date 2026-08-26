/**
 * Type-level contract for the request-side filter typing added in #153.
 * Uses Vitest's `expectTypeOf` — no runtime behaviour, just compile-time pins:
 *  - v2 filter is the prefix-operator object dialect;
 *  - v3 filter accepts the array of triples AND the `FilterV3` builder output
 *    (which may include AND/OR/NOT groups);
 *  - v3 still accepts a v2-style object for backward compatibility.
 * Portal-free (jsSdk:unit).
 */
import { describe, it, expectTypeOf } from 'vitest'
import type { TypeCallParamsV2, TypeCallParamsV3 } from '../../../packages/jssdk/src/types/http'
import { FilterV3 as F } from '../../../packages/jssdk/src/tools/filter-v3'

describe('#153 request-side filter typing', () => {
  it('v2 accepts the prefix-operator object filter', () => {
    const params: TypeCallParamsV2 = { filter: { '>id': 100, '%NAME': 'Iv' } }
    // `not.toBeAny` first: `toMatchTypeOf<Record<string, unknown>>` passes for
    // `any` too, so on its own it would keep passing through exactly the
    // regression it is meant to catch.
    expectTypeOf(params.filter).not.toBeAny()
    expectTypeOf(params.filter).toMatchTypeOf<Record<string, unknown> | undefined>()
  })

  it('v3 accepts an array of triples', () => {
    const params: TypeCallParamsV3 = { filter: [['id', '>', 100], ['stageId', '=', 'NEW']] }
    expectTypeOf(params.filter).not.toBeAny()
    expectTypeOf(params).toMatchTypeOf<{ filter?: unknown }>()
    // The array form must stay assignable to the declared filter type — the
    // annotation above is what actually pins it, and it is a compile error if
    // the triples are dropped from the union.
    expectTypeOf<[['id', '>', 100]]>().toMatchTypeOf<TypeCallParamsV3['filter']>()
  })

  it('v3 accepts FilterV3.build() output, including groups', () => {
    const built = F.build(F.eq('status', 'NEW'), F.or(F.in('id', [1, 2]), F.gt('id', 100)))
    const params: TypeCallParamsV3 = { filter: built }
    expectTypeOf(params.filter).not.toBeNever()
    expectTypeOf(params.filter).not.toBeAny()
    // The builder's own return type has to remain assignable, so dropping the
    // group arms from the filter union fails here rather than silently
    // narrowing what `FilterV3.build()` is good for.
    expectTypeOf(built).toMatchTypeOf<TypeCallParamsV3['filter']>()
  })

  it('v3 still accepts a v2-style object filter (backward compatible)', () => {
    const params: TypeCallParamsV3 = { filter: { '>id': 100 } }
    expectTypeOf(params.filter).not.toBeNever()
    expectTypeOf(params.filter).not.toBeAny()
    expectTypeOf<{ '>id': number }>().toMatchTypeOf<TypeCallParamsV3['filter']>()
  })
})
